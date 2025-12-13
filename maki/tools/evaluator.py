"""
Python evaluator
"""

import subprocess
from pydantic_ai import RunContext, Tool
from pydantic_ai.exceptions import ModelRetry

from pydantic_ai import Agent, ModelSettings
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider


class Evaluator:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        self.ollama_model = OpenAIChatModel(
            model_name=config['openrouter']['evaluator_model'],
            settings=ModelSettings(max_tokens=int(config['openrouter']['max_tokens'])),
            provider=OpenRouterProvider(api_key=config['openrouter']['openrouter_api_key']),
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
        results = await self.math_agent.run(prompt)
        print('[TOOL] AI Code Generator: ', results.output)
        return results.output

    def python_eval(self, to_eval: str) -> str:
        """Evalutes the python in the argument.

        Args:
            to_eval: the python code to evaluate
        """
        print('Python', to_eval)
        with open('to_eval.py', mode='w') as f:
            f.write(to_eval)

        cmd = subprocess.Popen(
            'python3 to_eval.py',
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, stderr = cmd.communicate()
        print('[TOOL] Stdout', stdout)
        print('[TOOL] Stderr', stderr)
        if stderr:
            raise ModelRetry(f"Script terminated {str(stderr)}")

        return str(stdout)

    def save_text_contents(self, filename: str, to_save: str) -> None:
        """Writes text to disk.

        Args:
            filename: the file to save to
            to_save: the python code to save
        """
        print('[TOOL] Saving text', to_save.replace('\n', '\\n'))
        with open(filename, mode='w') as f:
            f.write(to_save)


    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.code_generator, takes_ctx=False),
            # Tool(self.python_eval, takes_ctx=False),
            Tool(self.save_text_contents, takes_ctx=False),
        ]
