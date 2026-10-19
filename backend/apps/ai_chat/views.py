"""
AI chat proxy — the single backend entry point for the Shopping Assistant.

Provider priority: GROQ → XAI (both OpenAI-compatible Chat Completions).
Authentication is required, the ``ai_chat`` throttle scope applies (30/min by
default), and every request is served the same canonical customer prompt —
there is no role branch.

What this view guarantees server-side:
- The system prompt + verified application knowledge come from
  ``prompts.SYSTEM_PROMPT`` and ``knowledge``; the client cannot inject them.
- The per-customer order snapshot is built from the authenticated user only.
- Client-supplied history is sanitized (role whitelist, length caps) so it can
  never smuggle in a ``system`` role.
- Tools are executed server-side through the whitelisted handlers in
  ``tools.py`` with the current user; failures become honest "cannot verify"
  instructions, never stack traces or internals.
"""
import json
import logging

import requests
from django.conf import settings
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order

from .knowledge import app_knowledge, customer_context
from .prompts import SYSTEM_PROMPT
from .tools import TOOL_SCHEMAS, execute_tool

logger = logging.getLogger(__name__)

MAX_MESSAGE_CHARS = 2000
MAX_HISTORY_TURNS = 20
MAX_TOOL_ROUNDS = 2

GENERIC_UPSTREAM_ERROR = "AI service is currently unavailable. Please try again shortly."


# --------------------------------------------------------------------------- #
# Provider — a thin OpenAI-compatible chat client with optional tool support.
# --------------------------------------------------------------------------- #
class _Provider:
    def __init__(self, name, base_url, api_key, model):
        self.name = name
        self.base_url = base_url
        self.api_key = api_key
        self.model = model

    def chat_completions(self, messages, tools=None, tool_choice=None):
        """POST a Chat Completions request and return the parsed JSON body."""
        payload = {"messages": messages, "model": self.model}
        if tools:
            payload["tools"] = tools
        if tool_choice:
            payload["tool_choice"] = tool_choice
        resp = requests.post(
            f"{self.base_url}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


def _get_providers():
    """Configured providers in priority order (GROQ → XAI)."""
    providers = []
    if settings.GROQ_API_KEY:
        providers.append(_Provider("groq", settings.GROQ_API_URL, settings.GROQ_API_KEY, settings.GROQ_MODEL))
    if settings.XAI_API_KEY:
        providers.append(_Provider("xai", settings.XAI_API_URL, settings.XAI_API_KEY, settings.XAI_MODEL))
    return providers


def get_ai_endpoint():
    """First configured provider, or ``None`` when AI is not configured."""
    providers = _get_providers()
    if providers:
        return {"provider": providers[0], "mode": "direct"}
    return None


# --------------------------------------------------------------------------- #
# Request sanitization
# --------------------------------------------------------------------------- #
def sanitize_message(message):
    """Validate and bound the incoming user message."""
    if not isinstance(message, str):
        return None
    cleaned = message.strip()
    if not cleaned or len(cleaned) > MAX_MESSAGE_CHARS:
        return None
    return cleaned


def sanitize_history(history):
    """Keep only bounded user/assistant turns; system roles are dropped."""
    if not isinstance(history, list):
        return []
    clean = []
    for item in history:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        content = item.get("content", "")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        content = content.strip()
        if not content:
            continue
        if len(clean) >= MAX_HISTORY_TURNS * 2:
            break
        clean.append({"role": role, "content": content[:MAX_MESSAGE_CHARS]})
    # Never let a client-injected 'assistant' answer appear right before the
    # real user message without a matching user turn — trim leading assistant.
    while clean and clean[0]["role"] == "assistant":
        clean.pop(0)
    return clean


def build_system_message(user):
    """Canonical prompt + application knowledge, assembled server-side."""
    system = f"{SYSTEM_PROMPT}\n{app_knowledge().strip()}"
    snapshot_orders = list(Order.objects.filter(user=user).order_by("-created_at")[:6])
    context = customer_context(snapshot_orders)
    if context:
        system += context
    return system


# --------------------------------------------------------------------------- #
# Views
# --------------------------------------------------------------------------- #
class ChatProxyView(APIView):
    """
    Forward a chat message to the AI provider for the Shopping Assistant.

    Accepts::

        {"message": "...", "history": [{"role": "user", "content": "..."}],
         "device": "desktop" | "mobile"}

    Returns ``{"reply": "..."}`` on success, a 503 when no provider is
    configured, and a 502 with a generic message when the provider fails —
    provider error internals are logged, never returned.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "ai_chat"

    def post(self, request):
        message = sanitize_message(request.data.get("message"))
        if message is None:
            return Response(
                {"detail": "Please send a message of at most 2000 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        history = sanitize_history(request.data.get("history"))
        device = request.data.get("device") if request.data.get("device") in ("desktop", "mobile") else "desktop"

        endpoint = get_ai_endpoint()
        if endpoint is None:
            return Response(
                {"detail": "AI service is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        provider = endpoint["provider"]

        system_message = build_system_message(request.user) + (
            f"\nUSER DEVICE CONTEXT: The customer is on a {device.upper()} device. "
            "When giving navigation instructions, account for the UI differences "
            "between desktop and mobile described in APPLICATION KNOWLEDGE."
        )
        messages = (
            [{"role": "system", "content": system_message}]
            + history
            + [{"role": "user", "content": message}]
        )

        try:
            response = provider.chat_completions(messages, tools=TOOL_SCHEMAS, tool_choice="auto")
            rounds = 0
            while rounds < MAX_TOOL_ROUNDS:
                message_body = response.get("choices", [{}])[0].get("message", {})
                tool_calls = message_body.get("tool_calls") or []
                if not tool_calls:
                    break
                rounds += 1
                # Replay the assistant turn correctly for the provider: the
                # upstream payload carries tool_calls but no role field.
                assistant_turn = {
                    "role": "assistant",
                    "content": message_body.get("content") or "",
                }
                if message_body.get("tool_calls"):
                    assistant_turn["tool_calls"] = message_body["tool_calls"]
                messages.append(assistant_turn)
                for call in tool_calls:
                    function = call.get("function", {})
                    try:
                        arguments = json.loads(function.get("arguments") or "{}")
                    except (json.JSONDecodeError, TypeError):
                        arguments = {}
                    result = execute_tool(function.get("name", ""), arguments, request.user)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call.get("id", ""),
                            "content": json.dumps(result, ensure_ascii=False),
                        }
                    )
                response = provider.chat_completions(messages, tools=TOOL_SCHEMAS, tool_choice="auto")
        except requests.RequestException:
            logger.exception("AI provider request failed")
            return Response(
                {"detail": GENERIC_UPSTREAM_ERROR},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        reply = ""
        try:
            reply = (response.get("choices", [{}])[0].get("message", {}) or {}).get("content") or ""
        except (AttributeError, TypeError, IndexError):
            reply = ""
        if not reply.strip():
            # The loop capped out or the provider answered mid-tool-call.
            return Response(
                {
                    "reply": (
                        "I couldn't complete that lookup right now. Please try "
                        "again shortly, or reach our support team via the "
                        "Contact page."
                    )
                },
                status=status.HTTP_200_OK,
            )

        return Response({"reply": reply.strip(), "model": provider.model}, status=status.HTTP_200_OK)


class HealthView(APIView):
    """Check which AI provider is configured."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = "ai_chat"

    def get(self, request):
        endpoint = get_ai_endpoint()
        if endpoint is None:
            return Response({"ai_available": False, "detail": "No AI provider configured."})
        provider = endpoint["provider"]
        return Response({"ai_available": True, "mode": provider.name, "model": provider.model})
