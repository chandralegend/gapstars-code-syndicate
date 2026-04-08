"""Mock order database for the customer support demo."""

from __future__ import annotations

ORDERS: dict[str, dict] = {
    "ORD-1001": {
        "order_id": "ORD-1001",
        "customer_email": "alice@example.com",
        "status": "delivered",
        "items": [
            {"name": "Wireless Headphones Pro", "sku": "WHP-100", "qty": 1, "price": 149.99},
        ],
        "total": 149.99,
        "shipping": {
            "carrier": "FedEx",
            "tracking_number": "FX-789456123",
            "estimated_delivery": "2026-04-02",
            "status": "delivered",
        },
        "placed_at": "2026-03-28T10:30:00Z",
        "return_eligible": True,
    },
    "ORD-1002": {
        "order_id": "ORD-1002",
        "customer_email": "bob@example.com",
        "status": "in_transit",
        "items": [
            {"name": "Smart Home Hub", "sku": "SHH-200", "qty": 1, "price": 199.99},
            {"name": "Motion Sensor 3-Pack", "sku": "MS-303", "qty": 1, "price": 49.99},
        ],
        "total": 249.98,
        "shipping": {
            "carrier": "UPS",
            "tracking_number": "1Z999AA10123456784",
            "estimated_delivery": "2026-04-09",
            "status": "in_transit",
        },
        "placed_at": "2026-04-03T14:15:00Z",
        "return_eligible": False,
    },
    "ORD-1003": {
        "order_id": "ORD-1003",
        "customer_email": "carol@example.com",
        "status": "processing",
        "items": [
            {"name": "Ergonomic Keyboard", "sku": "EK-400", "qty": 1, "price": 89.99},
            {"name": "USB-C Dock", "sku": "UCD-500", "qty": 1, "price": 129.99},
        ],
        "total": 219.98,
        "shipping": {
            "carrier": "USPS",
            "tracking_number": None,
            "estimated_delivery": "2026-04-12",
            "status": "label_created",
        },
        "placed_at": "2026-04-05T09:00:00Z",
        "return_eligible": False,
    },
    "ORD-1004": {
        "order_id": "ORD-1004",
        "customer_email": "alice@example.com",
        "status": "delivered",
        "items": [
            {"name": "Portable Bluetooth Speaker", "sku": "PBS-600", "qty": 2, "price": 39.99},
        ],
        "total": 79.98,
        "shipping": {
            "carrier": "FedEx",
            "tracking_number": "FX-321654987",
            "estimated_delivery": "2026-03-25",
            "status": "delivered",
        },
        "placed_at": "2026-03-20T16:45:00Z",
        "return_eligible": True,
    },
    "ORD-1005": {
        "order_id": "ORD-1005",
        "customer_email": "dave@example.com",
        "status": "cancelled",
        "items": [
            {"name": "4K Webcam", "sku": "WC-700", "qty": 1, "price": 119.99},
        ],
        "total": 119.99,
        "shipping": {
            "carrier": None,
            "tracking_number": None,
            "estimated_delivery": None,
            "status": "cancelled",
        },
        "placed_at": "2026-04-01T11:20:00Z",
        "return_eligible": False,
    },
}
