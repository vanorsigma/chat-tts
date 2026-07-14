"""
Python evaluator
"""

from pydantic_ai import Agent, ModelSettings, Tool
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from config import MakiConfig


class Evaluator:
    def __init__(self, config: MakiConfig) -> None:
        print(
            f"[EVALUATOR] Initializing with model={config.evaluator_model}, max_tokens={config.max_tokens}"
        )
        self.ollama_model = OpenAIChatModel(
            model_name=config.evaluator_model,
            settings=ModelSettings(max_tokens=config.max_tokens),
            provider=OpenRouterProvider(api_key=config.openrouter_api_key),
        )

        self.math_agent = Agent(
            self.ollama_model,
            output_type=str,
            system_prompt=(
                "You are coding god. You make the best possible code for whatever that is asked of you, and you cram it all in one file."
            ),
        )

    async def code_generator(self, prompt: str) -> str:
        """Code Generator

        Args:
            prompt: the natural language query for code generation
        """
        print(
            f"[EVALUATOR] Code generation called: prompt=\"{prompt[:100]}{'...' if len(prompt) > 100 else ''}\""
        )
        results = await self.math_agent.run(prompt)
        output_len = len(results.output)
        print(f"[EVALUATOR] Code generation complete: {output_len} chars output")
        return results.output

    def save_text_contents(self, filename: str, to_save: str) -> None:
        """Writes text to disk.

        Args:
            filename: the file to save to
            to_save: the text to save
        """
        print("[TOOL] Saving text", to_save.replace("\n", "\\n"))
        with open(filename, mode="w") as f:
            f.write(to_save)

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.code_generator, takes_ctx=False),
            Tool(self.save_text_contents, takes_ctx=False),
        ]
