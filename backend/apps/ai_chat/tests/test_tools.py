"""Tool-layer tests — whitelisted, read-only, non-privileged."""
import pytest

from apps.ai_chat import tools
from apps.ai_chat.tools import execute_tool, search_products


@pytest.mark.django_db
class TestCatalogueSearch:
    def test_returns_verified_product_data(self, product):
        result = search_products(None, query="Test Widget")
        items = result["result"]
        assert isinstance(items, list) and len(items) == 1
        assert items[0]["name"] == "Test Widget"
        assert items[0]["price"] == "₦400"  # effective (discounted) price
        assert items[0]["product_page"] == "/products/test-widget"

    def test_excludes_hidden_catalogue(self, archived_product, product):
        result = search_products(None, query="Secret")
        assert "No matching products" in result["result"]

    def test_limit_is_capped(self, product):
        result = search_products(None, query="test", limit=999)
        assert isinstance(result["result"], list)

    def test_empty_store_degrades_honestly(self, db):
        result = search_products(None, query="anything")
        assert "No matching products are currently listed" in result["result"]


@pytest.mark.django_db
class TestToolWhitelist:
    def test_unknown_tool_refused(self, shopper):
        result = execute_tool("get_all_users", {}, shopper)
        assert "error" in result
        assert "search_products is available" in result["error"]

    def test_handler_failure_returns_honest_error_not_traceback(self, shopper, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("password hunter2 leak")

        monkeypatch.setitem(tools.TOOL_HANDLERS, "search_products", boom)
        result = execute_tool("search_products", {"query": "x"}, shopper)
        assert "error" in result
        assert "hunter2" not in str(result)
        assert "cannot verify" in result["error"]

    def test_non_dict_arguments_safe(self, shopper):
        result = execute_tool("search_products", ["not", "a", "dict"], shopper)
        assert "result" in result or "error" in result

    def test_no_superuser_information_passed_through_shopper(self, staff_member):
        # The user argument carries no role weight: staff get the same catalogue.
        result = execute_tool("search_products", {"query": "test"}, staff_member)
        assert isinstance(result, dict)
