"""Mock product catalog and knowledge base for the customer support demo."""

from __future__ import annotations

PRODUCTS: dict[str, dict] = {
    "WHP-100": {
        "sku": "WHP-100",
        "name": "Wireless Headphones Pro",
        "category": "Audio",
        "price": 149.99,
        "description": "Premium noise-cancelling wireless headphones with 30-hour battery life.",
        "troubleshooting": [
            {
                "issue": "Won't turn on",
                "steps": [
                    "Ensure the headphones are charged — connect the "
                    "USB-C cable for at least 30 minutes.",
                    "Press and hold the power button for 5 seconds.",
                    "If the LED does not light up, try a different USB-C cable.",
                    "Perform a factory reset by holding Power + Volume Down for 10 seconds.",
                ],
            },
            {
                "issue": "Audio cutting out",
                "steps": [
                    "Make sure you are within 10 metres of the paired device.",
                    "Remove other Bluetooth devices that may cause interference.",
                    "Forget the headphones in your device settings and re-pair them.",
                    "Update to the latest firmware via the companion app.",
                ],
            },
            {
                "issue": "Microphone not working",
                "steps": [
                    "Check that the headphones are selected as the "
                    "input device in your OS audio settings.",
                    "Toggle the mute switch on the left ear cup.",
                    "Restart the headphones and re-pair with your device.",
                ],
            },
        ],
    },
    "SHH-200": {
        "sku": "SHH-200",
        "name": "Smart Home Hub",
        "category": "Smart Home",
        "price": 199.99,
        "description": (
            "Central hub for controlling all your smart home devices. "
            "Supports Zigbee, Z-Wave, and Wi-Fi."
        ),
        "troubleshooting": [
            {
                "issue": "Hub not connecting to Wi-Fi",
                "steps": [
                    "Ensure your Wi-Fi network is 2.4 GHz (the hub does not support 5 GHz).",
                    "Move the hub closer to your router.",
                    "Restart your router and the hub.",
                    "Factory reset the hub by pressing the reset pin-hole button for 15 seconds.",
                ],
            },
            {
                "issue": "Devices not discovered",
                "steps": [
                    "Put your smart device into pairing mode first.",
                    "In the hub app, go to Settings > Add Device and wait up to 60 seconds.",
                    "Make sure the device protocol (Zigbee/Z-Wave) is enabled in hub settings.",
                ],
            },
        ],
    },
    "EK-400": {
        "sku": "EK-400",
        "name": "Ergonomic Keyboard",
        "category": "Peripherals",
        "price": 89.99,
        "description": "Split ergonomic mechanical keyboard with hot-swappable switches.",
        "troubleshooting": [
            {
                "issue": "Keys not registering",
                "steps": [
                    "Reseat the USB cable on both ends.",
                    "Try a different USB port (prefer USB 2.0 for keyboards).",
                    "Check if the affected switch is properly seated — press it down firmly.",
                    "Test with another computer to rule out a software issue.",
                ],
            },
            {
                "issue": "Backlight not working",
                "steps": [
                    "Press Fn + Backlight toggle key (usually F5).",
                    "Check brightness level with Fn + Up/Down arrows.",
                    "Reflash the keyboard firmware using the manufacturer tool.",
                ],
            },
        ],
    },
    "PBS-600": {
        "sku": "PBS-600",
        "name": "Portable Bluetooth Speaker",
        "category": "Audio",
        "price": 39.99,
        "description": "Compact waterproof Bluetooth speaker with 12-hour battery and deep bass.",
        "troubleshooting": [
            {
                "issue": "Speaker won't pair",
                "steps": [
                    "Press and hold the Bluetooth button for 3 seconds to enter pairing mode.",
                    "Remove old pairings from your phone's Bluetooth settings.",
                    "Ensure the speaker is not already connected to another device.",
                    "Reset the speaker by pressing Power + Volume Up for 8 seconds.",
                ],
            },
            {
                "issue": "Distorted sound",
                "steps": [
                    "Lower the volume on both the speaker and your phone.",
                    "Move the speaker away from metallic surfaces.",
                    "Check that the speaker grille is not blocked or damaged.",
                ],
            },
        ],
    },
    "WC-700": {
        "sku": "WC-700",
        "name": "4K Webcam",
        "category": "Peripherals",
        "price": 119.99,
        "description": "Ultra HD webcam with auto-focus, built-in ring light, and privacy shutter.",
        "troubleshooting": [
            {
                "issue": "Camera not detected",
                "steps": [
                    "Unplug and reconnect the USB cable.",
                    "Try a different USB 3.0 port.",
                    "Install the latest driver from the manufacturer website.",
                    "Check Device Manager (Windows) or System Report (macOS) for the camera.",
                ],
            },
            {
                "issue": "Poor image quality",
                "steps": [
                    "Clean the lens with a microfiber cloth.",
                    "Improve room lighting — the ring light can be toggled with the button on top.",
                    "In your video app settings, make sure resolution is set to 4K/30fps.",
                ],
            },
        ],
    },
}
