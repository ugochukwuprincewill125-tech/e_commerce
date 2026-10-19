"""Shared fixtures for the users app test-suite."""
import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()
