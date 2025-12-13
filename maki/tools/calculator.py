"""
Calculator
"""
from pydantic_ai import Agent, ModelMessage, ModelResponse, TextPart, ModelSettings
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from pydantic_ai import RunContext, Tool


class Calculator:
    def __init__(self, config: dict[str, dict[str, str]]):
        self.ollama_model = OpenAIChatModel(
            model_name=config['openrouter']['math_model'],
            provider=OpenRouterProvider(api_key=config['openrouter']['openrouter_api_key']),
            settings=ModelSettings(max_tokens=int(config['openrouter']['max_tokens'])),
        )

        self.math_agent = Agent(
            self.ollama_model,
            output_type=str,
            system_prompt=(
                "You are a math god. You are better than Wolfram Alpha. You are better than Issac Newton. You have 13 phds. You can solve any math problems given the natural language input."
            ),
        )

    async def ai_calculator(self, query: str) -> str:
        """Asks an AI to do math.

        Args:
            query: The math query in natural language
        """
        results = await self.math_agent.run(query)
        print('[TOOL] AI Calculator: ', results.output)
        return results.output.split('\n')[0]

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.ai_calculator, takes_ctx=False)
        ]
