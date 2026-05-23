"""Test-execution sub-package.

Public surface: ``run_test_execution`` for the explicit case and
``queue_auto_execution`` for the auto-trigger.
"""

from api.test_execution.worker import queue_auto_execution, run_test_execution

__all__ = ["queue_auto_execution", "run_test_execution"]
