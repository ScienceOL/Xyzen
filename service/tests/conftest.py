"""
Pytest configuration and shared fixtures for Xyzen service tests.
"""

pytest_plugins = [
    "tests.fixtures.database",
    "tests.fixtures.client",
    "tests.fixtures.data",
]
