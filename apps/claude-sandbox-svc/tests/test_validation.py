import pytest

from app.core.validation import EnvValidationError, redact_text, validate_user_env


def test_validate_user_env_passes_through_safe_keys():
    out = validate_user_env({"FOO": "bar", "BAZ_QUX": "1"})
    assert out == {"FOO": "bar", "BAZ_QUX": "1"}


def test_task_prefix_always_allowed_even_for_secret_words():
    out = validate_user_env({"TASK_API_KEY": "abc", "TASK_TOKEN": "x"})
    assert out == {"TASK_API_KEY": "abc", "TASK_TOKEN": "x"}


@pytest.mark.parametrize(
    "name",
    [
        "API_KEY",
        "MY_SECRET",
        "DB_PASSWORD",
        "STRIPE_TOKEN",
        "ANTHROPIC_API_KEY",
        "AWS_SECRET_ACCESS_KEY",
        "OPENAI_API_KEY",
    ],
)
def test_blocks_obvious_secret_names(name):
    with pytest.raises(EnvValidationError):
        validate_user_env({name: "x"})


def test_rejects_invalid_env_name():
    with pytest.raises(EnvValidationError):
        validate_user_env({"BAD-NAME": "x"})
    with pytest.raises(EnvValidationError):
        validate_user_env({"1STARTS_WITH_DIGIT": "x"})


def test_redact_text_scrubs_anthropic_keys():
    raw = "key=sk-ant-abc123def456ghi789jkl000"
    assert "sk-ant" not in redact_text(raw)


def test_redact_text_scrubs_bearer_tokens():
    raw = "Authorization: Bearer abc.def.ghi"
    out = redact_text(raw)
    assert "abc.def.ghi" not in out


def test_redact_text_handles_empty():
    assert redact_text("") == ""
