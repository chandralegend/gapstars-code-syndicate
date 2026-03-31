from __future__ import annotations

import math
import operator
from datetime import UTC, datetime

from langchain_core.tools import tool


@tool
def get_current_time() -> str:
    """Return the current UTC date and time as an ISO-8601 string."""
    return datetime.now(UTC).isoformat()


# Supported operators for the calculator
_OPS: dict[str, object] = {
    "+": operator.add,
    "-": operator.sub,
    "*": operator.mul,
    "/": operator.truediv,
    "**": operator.pow,
    "%": operator.mod,
    "sqrt": math.sqrt,
}


@tool
def calculate(expression: str) -> str:
    """Evaluate a simple mathematical expression and return the result as a string.

    Supports: +, -, *, /, **, %, sqrt(<number>).
    Examples: "2 + 3", "10 / 4", "sqrt(16)", "2 ** 8"
    """
    expression = expression.strip()

    # Handle sqrt(x)
    if expression.lower().startswith("sqrt(") and expression.endswith(")"):
        inner = expression[5:-1].strip()
        try:
            return str(math.sqrt(float(inner)))
        except ValueError as exc:
            return f"Error: {exc}"

    # Try two-operand expressions
    for op_str in ("**", "*", "/", "%", "+", "-"):
        if op_str in expression:
            parts = expression.split(op_str, 1)
            if len(parts) == 2:
                try:
                    left = float(parts[0].strip())
                    right = float(parts[1].strip())
                    result = _OPS[op_str](left, right)  # type: ignore[operator]
                    # Return int-style string when result is whole number
                    return str(
                        int(result) if isinstance(result, float) and result.is_integer() else result
                    )
                except (ValueError, ZeroDivisionError) as exc:
                    return f"Error: {exc}"

    return "Error: unsupported expression format"


# Export all tools as a flat list
TOOLS = [get_current_time, calculate]
