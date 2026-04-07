"""Tools available to the Triage / Supervisor agent."""

from __future__ import annotations

from langchain_core.tools import tool

# ── FAQ knowledge base ────────────────────────────────────────────────────────

_FAQ: dict[str, str] = {
    "return_policy": (
        "Our return policy allows returns within 30 days of delivery for a full refund. "
        "Items must be in original packaging and unused condition. "
        "To start a return, please provide your order ID."
    ),
    "shipping_times": (
        "Standard shipping takes 5-7 business days. "
        "Express shipping (available at checkout) takes 2-3 business days. "
        "You can track your order using the tracking number sent to your email."
    ),
    "payment_methods": (
        "We accept Visa, Mastercard, American Express, PayPal, and Apple Pay. "
        "All transactions are secured with 256-bit SSL encryption."
    ),
    "warranty": (
        "All products come with a 1-year limited warranty covering manufacturing defects. "
        "Premium subscription members receive an extended 2-year warranty. "
        "Warranty does not cover accidental damage."
    ),
    "contact_hours": (
        "Our customer support team is available Monday-Friday 9 AM - 6 PM EST. "
        "For urgent issues outside these hours, you can use this chat which is "
        "available 24/7."
    ),
    "subscription_plans": (
        "We offer two plans: Basic (free) gives you standard shipping and 1-year warranty. "
        "Premium ($9.99/month) includes free express shipping, 2-year warranty, "
        "priority support, and exclusive member discounts."
    ),
}


@tool
def lookup_faq(topic: str) -> str:
    """Look up frequently asked questions by topic.

    Available topics: return_policy, shipping_times, payment_methods,
    warranty, contact_hours, subscription_plans.

    Args:
        topic: The FAQ topic to look up.
    """
    result = _FAQ.get(topic.lower().strip())
    if result:
        return result
    available = ", ".join(_FAQ.keys())
    return f"No FAQ found for '{topic}'. Available topics: {available}"


TRIAGE_TOOLS = [lookup_faq]
