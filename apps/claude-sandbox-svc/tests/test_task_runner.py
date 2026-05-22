from app.core.models import TaskStatus
from app.core.task_runner import reconcile_outcome


def test_keeps_succeeded_when_result_present():
    out, err = reconcile_outcome(
        TaskStatus.SUCCEEDED, None, {"status": "succeeded"}, None
    )
    assert out is TaskStatus.SUCCEEDED
    assert err is None


def test_flips_succeeded_to_failed_when_only_error_json():
    out, err = reconcile_outcome(
        TaskStatus.SUCCEEDED, None, None, {"message": "API error from Anthropic"}
    )
    assert out is TaskStatus.FAILED
    assert err == "API error from Anthropic"


def test_prefers_error_json_message_over_generic_exit():
    out, err = reconcile_outcome(
        TaskStatus.FAILED,
        "sandbox exited with code 1",
        None,
        {"message": "API error from Anthropic: 401 invalid x-api-key"},
    )
    assert out is TaskStatus.FAILED
    assert "401" in err


def test_keeps_generic_error_when_no_runner_message():
    out, err = reconcile_outcome(
        TaskStatus.TIMEOUT, "exceeded timeout of 60s", None, None
    )
    assert out is TaskStatus.TIMEOUT
    assert err == "exceeded timeout of 60s"


def test_cancel_with_runner_message():
    out, err = reconcile_outcome(
        TaskStatus.CANCELLED, "cancelled by user", None, {"message": "cancelled"}
    )
    assert out is TaskStatus.CANCELLED
    assert err == "cancelled"
