import time

import pytest

from app.core import tokens


def test_issue_and_verify_roundtrip():
    tok = tokens.issue("task-1")
    payload = tokens.verify(tok, expected_task_id="task-1")
    assert payload["task_id"] == "task-1"
    assert payload["exp"] > int(time.time())


def test_verify_wrong_task_id_rejected():
    tok = tokens.issue("task-1")
    with pytest.raises(ValueError):
        tokens.verify(tok, expected_task_id="task-2")


def test_verify_tampered_signature_rejected():
    tok = tokens.issue("task-1")
    body, sig = tok.split(".")
    bad = body + "." + ("A" * len(sig))
    with pytest.raises(ValueError):
        tokens.verify(bad)


def test_verify_expired_token_rejected():
    tok = tokens.issue("task-1", ttl_seconds=-1)
    with pytest.raises(ValueError):
        tokens.verify(tok)


def test_verify_malformed_token_rejected():
    with pytest.raises(ValueError):
        tokens.verify("not-a-token")
    with pytest.raises(ValueError):
        tokens.verify("")
