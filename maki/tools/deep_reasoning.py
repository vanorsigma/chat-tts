"""
Deep Reasoning tool for complex multi-step analysis.
"""

from pydantic_ai import Agent, ModelSettings, Tool
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from config import MakiConfig


class DeepReasoning:
    def __init__(self, config: MakiConfig) -> None:
        print(
            f"[DEEP_REASONING] Initializing with model={config.deep_reasoning_model}, max_tokens={config.deep_reasoning_max_tokens}"
        )
        self.model = OpenAIChatModel(
            model_name=config.deep_reasoning_model,
            settings=ModelSettings(max_tokens=config.deep_reasoning_max_tokens),
            provider=OpenRouterProvider(api_key=config.openrouter_api_key),
        )

        self.reasoning_agent = Agent(
            self.model,
            output_type=str,
            system_prompt=(
                "You are a deep reasoning engine. Your purpose is to think through complex "
                "problems carefully, step by step, and return a clear, structured analysis.\n\n"
                "When given a query:\n"
                "1. Break it down into sub-problems and identify what needs to be decided or solved.\n"
                "2. Consider multiple approaches or angles before settling on one.\n"
                "3. Weigh trade-offs, risks, and edge cases.\n"
                "4. Produce a concise but thorough answer that includes your recommended course of action "
                "and the key reasoning behind it.\n\n"
                "Be direct and actionable. If the query is about which tools to use or in what order, "
                "give a specific plan. If it's an open-ended creative or analytical question, give a "
                "well-reasoned final answer."
            ),
        )

    async def deep_reasoning(self, query: str) -> str:
        """Invoke a more capable reasoning model to think through a complex problem before acting.
        Use this tool when the task is complex, multi-step, or requires careful planning.

        Args:
            query: A detailed description of the problem or task to reason about.
                Include all relevant context, constraints, and what you need to decide.
        """
        print(
            f"[DEEP_REASONING] Reasoning called: query=\"{query[:100]}{'...' if len(query) > 100 else ''}\""
        )
        result = await self.reasoning_agent.run(query)
        output_len = len(result.output)
        print(f"[DEEP_REASONING] Reasoning complete: {output_len} chars output")
        return result.output

    def get_tools(self) -> list[Tool]:
        return [Tool(self.deep_reasoning, takes_ctx=False)]
