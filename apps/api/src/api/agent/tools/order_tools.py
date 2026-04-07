"""Tools available to the Order Support agent."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from api.agent.data.orders import ORDERS


@tool
def lookup_order(order_id: str) -> str:
    """Look up an order by its ID and return full order details.

    Args:
        order_id: The order ID, e.g. 'ORD-1001'.
    """
    order = ORDERS.get(order_id.upper().strip())
    if order is None:
        return f"No order found with ID '{order_id}'. Please double-check the order ID."
    return json.dumps(order, indent=2)


@tool
def check_shipping_status(order_id: str) -> str:
    """Check the shipping status and tracking information for an order.

    Args:
        order_id: The order ID, e.g. 'ORD-1001'.
    """
    order = ORDERS.get(order_id.upper().strip())
    if order is None:
        return f"No order found with ID '{order_id}'."

    shipping = order["shipping"]
    status = shipping["status"]
    carrier = shipping.get("carrier") or "N/A"
    tracking = shipping.get("tracking_number") or "Not yet assigned"
    eta = shipping.get("estimated_delivery") or "Unknown"

    return (
        f"Order {order_id} shipping status:\n"
        f"  Status: {status}\n"
        f"  Carrier: {carrier}\n"
        f"  Tracking Number: {tracking}\n"
        f"  Estimated Delivery: {eta}"
    )


@tool
def initiate_return(order_id: str, reason: str) -> str:
    """Initiate a return for an eligible order.

    Args:
        order_id: The order ID to return, e.g. 'ORD-1001'.
        reason: The reason for the return.
    """
    order = ORDERS.get(order_id.upper().strip())
    if order is None:
        return f"No order found with ID '{order_id}'."

    if not order.get("return_eligible", False):
        status = order["status"]
        if status == "cancelled":
            return f"Order {order_id} was cancelled and cannot be returned."
        if status in ("processing", "in_transit"):
            return (
                f"Order {order_id} has not been delivered yet (status: {status}). "
                "Returns can only be initiated after delivery."
            )
        return f"Order {order_id} is not eligible for return."

    # Simulate the return initiation
    return_id = f"RET-{order_id.split('-')[1]}"
    return (
        f"Return initiated successfully!\n"
        f"  Return ID: {return_id}\n"
        f"  Order: {order_id}\n"
        f"  Reason: {reason}\n"
        f"  Refund Amount: ${order['total']:.2f}\n"
        f"  Instructions: Please ship the item(s) back within 14 days using the "
        f"prepaid label sent to your email. Refund will be processed within "
        f"5-7 business days after we receive the item."
    )


@tool
def modify_order(order_id: str, modification: str) -> str:
    """Request a modification to an existing order (e.g. change shipping address, cancel item).

    Only orders in 'processing' status can be modified.

    Args:
        order_id: The order ID to modify, e.g. 'ORD-1003'.
        modification: Description of the desired modification.
    """
    order = ORDERS.get(order_id.upper().strip())
    if order is None:
        return f"No order found with ID '{order_id}'."

    status = order["status"]
    if status != "processing":
        return (
            f"Order {order_id} cannot be modified because its status is '{status}'. "
            f"Only orders in 'processing' status can be modified."
        )

    return (
        f"Modification request submitted for order {order_id}.\n"
        f"  Requested change: {modification}\n"
        f"  Status: Pending review\n"
        f"  A confirmation email will be sent within 1 hour. "
        f"If the order ships before the modification is processed, "
        f"please contact us again for further assistance."
    )


ORDER_TOOLS = [lookup_order, check_shipping_status, initiate_return, modify_order]
