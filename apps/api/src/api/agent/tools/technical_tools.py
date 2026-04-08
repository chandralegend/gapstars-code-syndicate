"""Tools available to the Technical Support agent."""

from __future__ import annotations

import json
import uuid

from langchain_core.tools import tool

from api.agent.data.accounts import ACCOUNTS
from api.agent.data.products import PRODUCTS


@tool
def search_knowledge_base(query: str) -> str:
    """Search the product knowledge base for troubleshooting guides.

    Searches product names, categories, and known issues for matches.

    Args:
        query: Search query describing the issue, e.g. 'headphones won't turn on'.
    """
    query_lower = query.lower()
    results: list[dict] = []

    for product in PRODUCTS.values():
        # Check if query matches product name or category
        name_match = query_lower in product["name"].lower()
        cat_match = query_lower in product["category"].lower()

        for guide in product.get("troubleshooting", []):
            issue_match = query_lower in guide["issue"].lower()
            # Also check if any keywords from query appear in the issue
            query_words = set(query_lower.split())
            issue_words = set(guide["issue"].lower().split())
            keyword_overlap = len(query_words & issue_words) > 0

            if name_match or issue_match or keyword_overlap or cat_match:
                results.append(
                    {
                        "product": product["name"],
                        "sku": product["sku"],
                        "issue": guide["issue"],
                        "steps": guide["steps"],
                    }
                )

    if not results:
        return (
            f"No troubleshooting guides found for '{query}'. "
            "Please describe the issue in more detail or provide the product name."
        )

    return json.dumps(results, indent=2)


@tool
def check_account_status(email: str) -> str:
    """Check the status and details of a customer account.

    Args:
        email: The customer's email address.
    """
    account = ACCOUNTS.get(email.lower().strip())
    if account is None:
        return f"No account found with email '{email}'."

    return (
        f"Account details for {account['name']}:\n"
        f"  Email: {account['email']}\n"
        f"  Status: {account['account_status']}\n"
        f"  Subscription: {account['subscription']}\n"
        f"  Member since: {account['member_since']}\n"
        f"  2FA enabled: {'Yes' if account['two_factor_enabled'] else 'No'}\n"
        f"  Last login: {account['last_login']}\n"
        f"  Order history: {', '.join(account['orders'])}"
    )


@tool
def reset_password(email: str) -> str:
    """Send a password reset link to the customer's email.

    Args:
        email: The customer's email address.
    """
    account = ACCOUNTS.get(email.lower().strip())
    if account is None:
        return f"No account found with email '{email}'."

    if account["account_status"] == "suspended":
        return (
            f"Account for {email} is currently suspended. "
            "Password reset is not available for suspended accounts. "
            "Please contact a human agent for account reinstatement."
        )

    # Simulate sending a reset email
    return (
        f"Password reset link sent to {email}.\n"
        f"  The link will expire in 24 hours.\n"
        f"  If 2FA is enabled, you will also need your authenticator app.\n"
        f"  Check your spam folder if you don't see the email within 5 minutes."
    )


@tool
def create_support_ticket(subject: str, description: str, priority: str = "medium") -> str:
    """Create a support ticket for issues that require human follow-up.

    Args:
        subject: Brief summary of the issue.
        description: Detailed description of the problem.
        priority: Ticket priority — 'low', 'medium', or 'high'.
    """
    if priority.lower() not in ("low", "medium", "high"):
        priority = "medium"

    ticket_id = f"TKT-{uuid.uuid4().hex[:8].upper()}"

    return (
        f"Support ticket created successfully!\n"
        f"  Ticket ID: {ticket_id}\n"
        f"  Subject: {subject}\n"
        f"  Priority: {priority}\n"
        f"  Description: {description}\n\n"
        f"A support engineer will review your ticket within "
        f"{'4 hours' if priority == 'high' else '24 hours'}. "
        f"You will receive updates at your registered email address."
    )


TECHNICAL_TOOLS = [
    search_knowledge_base,
    check_account_status,
    reset_password,
    create_support_ticket,
]
