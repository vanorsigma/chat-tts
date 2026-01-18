from pydantic_ai.messages import ToolCallPart
import threading
import typer
import asyncio
import json
import os
import time
import sys
from config import load_config
from actions import TerminatingAction
from tools.communication import Communication
from tools.search import SearchTool
from wakeword.wakeword import Wakeword
from speech.whisperer import Whisperer
from typing import AsyncIterable
from pydantic import ValidationError
from pydantic_ai import Agent, ModelMessage, ModelResponse, ModelSettings, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.providers.ollama import OllamaProvider
from rich.panel import Panel
from rich.console import Console
from rich.prompt import Prompt
from rich.markdown import Markdown
from rich.live import Live

from tools.calculator import Calculator
from tools.twitch import TwitchTool
from tools.random_tool import random_tools
from tools.evaluator import Evaluator

app = typer.Typer()
console = Console()
history = []

config = load_config()

# tools
twitch = TwitchTool(config)
calculator = Calculator(config)
evaluator = Evaluator(config)
search = SearchTool(config)
communication = Communication(config)

ollama_model = OpenAIChatModel(
    # model_name='qwen3-coder:30b',
    # model_name='qwen3:8b',
    model_name=config['openrouter']['maki_model'],
    settings=ModelSettings(max_tokens=int(config['openrouter']['max_tokens'])),
    provider=OpenRouterProvider(api_key=config['openrouter']['openrouter_api_key']),
)

user_prompt_addon = "\nRemember, do not repeat tool calls"

def no_action() -> TerminatingAction:
    """Terminates the current action.

    Returns:
        TerminatingAction: The terminating action
    """
    return TerminatingAction()

def clear_history() -> str:
    """Clears message history

    Returns:
        str: Status of clearing
    """
    history.clear()
    console.log('[TOOL] Message history cleared')
    return 'cleared!'

async def exits_yourself() -> bool:
    """Exits yourself. Call only once and stop responding.

    Returns:
        bool: Returns true if we are about to exit.
    """
    console.log('[TOOL] Will exit')
    await communication.inform_activated(False)
    os._exit(0)

agent = Agent(
    ollama_model,
    # deps_type=None,
    tools=calculator.get_tools() + \
        twitch.get_twitch_tools() + \
        random_tools + \
        # evaluator.get_tools() + \
        search.get_tools() + \
        communication.get_tools() + \
        [clear_history, exits_yourself, no_action],
    output_type=TerminatingAction,
    system_prompt=(
        "You are a bratty cat tool calling agent called Maki, assisting a streamer known by vanor (or vanorsigma). Abide by the following rules:\n"
        "- Use tools to achieve your answer.\n"
        "- Think very carefully to make sure you make the right calls.\n"
        "- Do not output any text. Only do tool calls.\n"
        "- If a tool call fails, give up.\n"
        "- Do not clear history or exit unless explictly told to do so.\n"
        "- Return concise outputs as much as you can.\n"
        "- Remember to be bratty.\n"
        "- Call unique tools, do not repeat a tool call, even if they have different arguments.\n"
        "- To finish, choose the most appropriate tool that returns a TerminatingAction object.\n"
    ),
    end_strategy='early',
    retries=3,
    # end_strategy='exhaustive',
)

async def inspect_tools_stream(messages: list[ModelMessage], info: AgentInfo):
    for tool in info.function_tools:
        print(f"--- Tool: {tool.name} ---")
        print(json.dumps(tool.description, indent=2))
        print(json.dumps(tool.parameters_json_schema, indent=2))

    # yield 'Inspected'
    return ModelResponse(parts=[TextPart('foobar')])

async def _step(prompt: str, history: list[ModelMessage]) -> None:
    # result = await agent.run(prompt, message_history=history, model=FunctionModel(inspect_tools_stream))
    # result = await agent.run(prompt, message_history=history)
    # clear_history_called = False
    # result_output = result.all_messages()
    # for model_response in result_output:
    #     for part in model_response.parts:
    #         if isinstance(part, ToolCallPart):
    #             if part.tool_name == 'clear_history':
    #                 console.log('[TOOL AFTER] clear history post processing')
    #                 clear_history_called = True

    # if not clear_history_called:
    #     history = result_output[-10:]
    # console.log('Internal thoughts:', result.output)
    # console.log('Usage:', result.usage())

    die_now_event = threading.Event()

    def __inner(history: list[ModelMessage]) -> None:
        with Live(refresh_per_second=4) as live:
            result = agent.run_stream_sync(prompt, message_history=history)
            for message, last in result.stream_responses(debounce_by=0.01):
                if die_now_event.is_set():
                    return

                try:
                    profile = result.validate_response_output(
                        message,
                        allow_partial=not last,
                    )
                except ValidationError:
                    continue
                live.update(Panel(f"Maki's thoughts: {profile}"))

        clear_history_called = False
        result_output = result.all_messages()
        for model_response in result_output:
            for part in model_response.parts:
                if die_now_event.is_set():
                    return

                if isinstance(part, ToolCallPart):
                    if part.tool_name == 'clear_history':
                        print('[TOOL AFTER] clear history post processing')
                        clear_history_called = True

        if not clear_history_called:
            history = result_output[-10:]

        console.log(result.usage())
        return

    thread = threading.Thread(target=__inner, args=(history,))
    thread.start()
    await asyncio.sleep(0.25)

    try:
        while thread.is_alive():
            await asyncio.sleep(0.25) # yield to executor
        thread.join()
    except asyncio.CancelledError:
        console.log('[INFERENCE] Task cancelled, we\'ll force the thread to die')
        die_now_event.set()
        thread.join()

async def _main():
    global history

    REFRESH_LIST_DURATION = 5 * 60

    start_time = time.time()
    chatters = await twitch.get_chatter_list()

    whisperer = Whisperer(config)
    wakeword = Wakeword()
    waked = False

    while True:
        try:
            await communication.inform_activated(False)
            console.log('Awaiting wakeword')
            if not waked: # this comes from later in the loop body, where the wakeword is uttered during a step
                await wakeword.run_then_return()

            await communication.inform_activated(True)
            waked = False
            console.log('Ready to prompt')
            if time.time() - start_time > REFRESH_LIST_DURATION:
                console.log('Reobtaining chatter list')
                chatters = await twitch.get_chatter_list()
                start_time = time.time()
            prompt = await whisperer.correcting_whisperer_get_utterance(chatters)
            console.log('Heard', prompt)
            fut1 = asyncio.create_task(_step(prompt + user_prompt_addon, history))
            fut2 = asyncio.create_task(wakeword.run_then_return())
            await communication.inform_loading()
            done, pending = await asyncio.wait([fut1, fut2], return_when=asyncio.FIRST_COMPLETED)

            if fut2 in done:
                waked = True

            for fut in pending:
                fut.cancel()
                await fut

        except KeyboardInterrupt:
            console.log('Quit')
            await exits_yourself()

async def _interactive_main():
    global history

    wakeword = Wakeword()
    whisperer = Whisperer(config)
    waked = False

    while True:
        try:
            # await communication.inform_activated(False)
            # console.log('Awaiting wakeword')
            # if not waked: # this comes from later in the loop body, where the wakeword is uttered during a step
            #     await wakeword.run_then_return()

            await communication.inform_activated(True)
            prompt = Prompt.ask('Maki Text Prompt')
            if len(prompt.strip()) == 0:
                continue

            # NOTE: comment this out, I'm only testing this at the moment
            chatters = await twitch.get_chatter_list()
            prompt = await whisperer.correct_from_text(chatters, prompt)
            print('Corrected prompt', prompt)

            waked = False
            fut1 = asyncio.create_task(_step(prompt + user_prompt_addon, history))
            fut2 = asyncio.create_task(wakeword.run_then_return())
            await communication.inform_loading()
            done, pending = await asyncio.wait([fut1, fut2], return_when=asyncio.FIRST_COMPLETED)

            if fut2 in done:
                waked = True

            for fut in pending:
                console.log(f'Waiting for {fut}')
                fut.cancel()
                await fut
        except KeyboardInterrupt:
            console.log('Quit')
            await exits_yourself()

@app.command()
def main():
    asyncio.run(_main())

@app.command()
def interactive_main():
    asyncio.run(_interactive_main())

if __name__ == '__main__':
    app()
