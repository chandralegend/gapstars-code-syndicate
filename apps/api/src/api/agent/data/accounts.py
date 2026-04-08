"""Mock customer account database for the customer support demo."""

from __future__ import annotations

ACCOUNTS: dict[str, dict] = {
    "alice@example.com": {
        "email": "alice@example.com",
        "name": "Alice Johnson",
        "account_status": "active",
        "subscription": "premium",
        "member_since": "2024-06-15",
        "orders": ["ORD-1001", "ORD-1004"],
        "two_factor_enabled": True,
        "last_login": "2026-04-06T08:22:00Z",
    },
    "bob@example.com": {
        "email": "bob@example.com",
        "name": "Bob Smith",
        "account_status": "active",
        "subscription": "basic",
        "member_since": "2025-01-10",
        "orders": ["ORD-1002"],
        "two_factor_enabled": False,
        "last_login": "2026-04-05T19:45:00Z",
    },
    "carol@example.com": {
        "email": "carol@example.com",
        "name": "Carol Williams",
        "account_status": "active",
        "subscription": "premium",
        "member_since": "2024-11-22",
        "orders": ["ORD-1003"],
        "two_factor_enabled": True,
        "last_login": "2026-04-07T06:10:00Z",
    },
    "dave@example.com": {
        "email": "dave@example.com",
        "name": "Dave Brown",
        "account_status": "suspended",
        "subscription": "basic",
        "member_since": "2025-08-03",
        "orders": ["ORD-1005"],
        "two_factor_enabled": False,
        "last_login": "2026-03-15T12:00:00Z",
    },
}
