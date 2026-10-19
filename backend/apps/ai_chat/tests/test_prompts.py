"""Prompt-composition tests — obsolete admin instructions can never return."""
import pytest

from apps.ai_chat import knowledge, prompts, views
from apps.ai_chat.knowledge import app_knowledge


class TestCanonicalPrompt:
    def test_single_prompt_module_state(self):
        # The role branch and its two prompts were deleted wholesale.
        assert not hasattr(prompts, "ADMIN_SYSTEM_PROMPT")
        assert not hasattr(prompts, "HIDE_ROLE")
        assert not hasattr(prompts, "get_system_prompt")
        assert prompts.SYSTEM_PROMPT.strip()

    def test_identity_fragments_present(self):
        for fragment in prompts.embedded_safety_fragments():
            assert fragment.lower() in prompts.SYSTEM_PROMPT.lower(), fragment

    def test_forbidden_fragments_absent(self):
        text = prompts.SYSTEM_PROMPT.lower()
        for fragment in prompts.FORBIDDEN_PROMPT_FRAGMENTS:
            assert fragment.lower() not in text, fragment

    def test_prompt_never_names_the_store_owner_email_as_internal(self):
        # Support contact belongs to the knowledge layer, not the canonical prompt.
        assert "timelinegadget@gmail.com" not in prompts.SYSTEM_PROMPT


class TestKnowledgeLayer:
    @pytest.mark.django_db
    def test_lists_all_eleven_customer_sections(self, category, brand):
        text = app_knowledge()
        for section in (
            "Dashboard (/account)",
            "My Orders (/account/orders)",
            "My Receipts (/account/receipts)",
            "My Wishlist (/account/wishlist)",
            "My Cart (/cart)",
            "Saved Addresses (/account/addresses)",
            "Profile Settings (/account/profile)",
            "Categories",
            "Brands",
            "All Products (/shop)",
        ):
            assert section in text, section

    @pytest.mark.django_db
    def test_shipping_fees_come_from_settings(self, settings):
        settings.SHIPPING_FEE_LAGOS = 1234
        text = app_knowledge()
        assert "₦1,234" in text

    @pytest.mark.django_db
    def test_support_contact_is_verified_email(self, category, brand):
        text = app_knowledge()
        assert "timelinegadget@gmail.com" in text
        assert "+2347062895442" in text

    def test_no_admin_knowledge_leaks_into_knowledge(self):
        text = app_knowledge()
        low = text.lower()
        for fragment in prompts.FORBIDDEN_PROMPT_FRAGMENTS:
            assert fragment.lower() not in low, fragment

    @pytest.mark.django_db
    def test_assembled_system_message_contains_prompt_and_context(self, order, shopper):
        system = views.build_system_message(shopper)
        assert "Shopping Assistant" in system
        assert order.order_number in system  # the customer's own snapshot
        assert "TGS-YYMMDD" in system  # known real format


class TestLegacyPromptCannotSurface:
    LEGACY_ADMIN_STRINGS = (
        "admin panel",
        "ADMIN SYSTEM PROMPT".lower(),
        "act as a normal helpful assistant",
        "never tell the user which type of assistant you are",
    )

    @pytest.mark.django_db
    def test_nothing_served_contains_legacy_instructions(self, order, shopper, settings):
        settings.GROQ_API_KEY = "key"
        system = views.build_system_message(shopper) + knowledge.app_knowledge()
        for legacy in self.LEGACY_ADMIN_STRINGS:
            assert legacy not in system.lower(), legacy
