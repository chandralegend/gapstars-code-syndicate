from __future__ import annotations

from langchain_core.language_models.chat_models import BaseChatModel

from api.config import LLMProviderName, settings


def create_llm(
    provider: LLMProviderName | None = None,
    model: str | None = None,
) -> BaseChatModel:
    """Return the appropriate LangChain chat model for *provider* and *model*.

    Falls back to the values in ``settings`` when either argument is omitted.
    """
    resolved_provider: LLMProviderName = provider or settings.llm_provider
    resolved_model: str = model or settings.default_model_for(resolved_provider)

    if resolved_provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=resolved_model,
            api_key=settings.openai_api_key,
            streaming=True,
        )

    if resolved_provider == "mistral":
        from langchain_mistralai import ChatMistralAI

        return ChatMistralAI(
            model=resolved_model,
            api_key=settings.mistral_api_key,
            streaming=True,
        )

    if resolved_provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=resolved_model,
            api_key=settings.anthropic_api_key,
            streaming=True,
        )

    raise ValueError(f"Unknown provider: {resolved_provider!r}")
