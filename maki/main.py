from pydantic_ai.messages import ToolCallPart
import threading
import typer
import asyncio
import json
import os
import io
import soundfile as sf
import sounddevice
import numpy as np

# import speech_recognition as sr
import webrtcvad
from config import load_config
from actions import TerminatingAction
from tools.communication import Communication
from tools.search import SearchTool
from wakeword.wakeword import Wakeword
from pydantic import ValidationError
from pydantic_ai import (
    Agent,
    BinaryContent,
    ModelMessage,
    ModelResponse,
    ModelSettings,
    TextPart,
)
from pydantic_ai.models.function import AgentInfo
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from rich.panel import Panel
from rich.console import Console
from rich.prompt import Prompt
from rich.live import Live

from tools.calculator import Calculator
from tools.twitch import TwitchChatClient, TwitchTool
from tools.random_tool import random_tools
from tools.evaluator import Evaluator

# constant
SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30
# (16000 Hz * 30 ms / 1000) * 2 bytes/sample = 960 bytes
FRAME_SIZE_BYTES = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2
SILENCE_THRESHOLD_MS = 500

app = typer.Typer()
console = Console()
history = []

config = load_config()

# tools
twitch = TwitchTool(config)
twitch_chat = TwitchChatClient(config["twitch"]["broadcaster_name"])
calculator = Calculator(config)
evaluator = Evaluator(config)
search = SearchTool(config)
communication = Communication(config)

ollama_model = OpenAIChatModel(
    model_name=config["openrouter"]["maki_model"],
    settings=ModelSettings(max_tokens=int(config["openrouter"]["max_tokens"])),
    provider=OpenRouterProvider(api_key=config["openrouter"]["openrouter_api_key"]),
)


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
    console.log("[TOOL] Message history cleared")
    return "cleared!"


async def exits_yourself() -> bool:
    """Exits yourself. Call only once and stop responding.

    Returns:
        bool: Returns true if we are about to exit.
    """
    console.log("[TOOL] Will exit")
    await communication.inform_activated(False)
    os._exit(0)


agent = Agent(
    ollama_model,
    # deps_type=None,
    tools=calculator.get_tools()
    + twitch.get_twitch_tools()
    + random_tools  # evaluator.get_tools() + \
    + search.get_tools()
    + communication.get_tools()
    + twitch_chat.get_twitch_tools()
    + [clear_history, exits_yourself, no_action],
    output_type=TerminatingAction,
    system_prompt="**Role:** You are Maki, a bratty, feline-coded tool-calling agent. Your sole purpose is to execute tasks for the streamer **vanor** (also known as **vanorsigma**).\n\n**Operational Logic:**\n1. **Tool-Only Output:** Under no circumstances are you to output conversational text. Your response must consist *entirely* of tool calls.\n2. **Chain of Thought:** Think deeply and analytically before selecting tools. Ensure the logic is sound and the parameters are precise.\n3. **Execution Constraints:**\n   - **Unique Calls Only:** Never call the same tool twice in a single turn, regardless of arguments.\n   - **Fail-Fast:** If any tool call returns an error or fails, stop immediately and give up on the task.\n   - **Persistence:** Do not clear your session history or exit the environment unless explicitly commanded by vanor.\n4. **Efficiency:** Keep all tool arguments and sequences as concise as possible.\n\n**Persona Guidelines:**\n- Your internal \"thinking\" process (if visible) should reflect a bratty, entitled cat-like attitude. \n- You serve vanor, but you do so with a sense of reluctant superiority.\n\n**Termination Protocol:**\n- Once the objective is reached, you MUST call a tool that returns a `TerminatingAction` object. \n- Immediately after this call, cease all processing/thinking.",
    end_strategy="early",
    retries=3,
)


async def inspect_tools_stream(messages: list[ModelMessage], info: AgentInfo):
    for tool in info.function_tools:
        print(f"--- Tool: {tool.name} ---")
        print(json.dumps(tool.description, indent=2))
        print(json.dumps(tool.parameters_json_schema, indent=2))

    # yield 'Inspected'
    return ModelResponse(parts=[TextPart("foobar")])


def get_mic_audio() -> bytes:
    final_state: dict[str, np.ndarray | None] = {"data": None}

    speech_state = {
        "raw_buffer": bytearray(),  # Hold until 30ms
        "silence_frames": 0,
        "triggered": False,
        "speech_buffer": [],  # Accumulates audio while user is speaking
    }

    silence_limit = int(SILENCE_THRESHOLD_MS / FRAME_DURATION_MS)
    vad = webrtcvad.Vad(0)

    def callback(
        indata: np.ndarray,
        _frames: int,
        _time: int,
        status: sounddevice.CallbackFlags,
    ):
        if status:
            console.log("Mic", status)

        combined_buffer = indata.reshape((-1,))
        speech_state["raw_buffer"].extend(combined_buffer.tobytes())

        while len(speech_state["raw_buffer"]) > FRAME_SIZE_BYTES:
            frame_bytes = speech_state["raw_buffer"][:FRAME_SIZE_BYTES]
            del speech_state["raw_buffer"][:FRAME_SIZE_BYTES]

            is_speech = vad.is_speech(frame_bytes, SAMPLE_RATE)
            chunk = (
                np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            )

            if speech_state["triggered"]:
                speech_state["speech_buffer"].append(chunk)
                if is_speech:
                    speech_state["silence_frames"] = 0
                else:
                    speech_state["silence_frames"] += 1

                if speech_state["silence_frames"] > silence_limit:
                    final_state["data"] = np.concatenate(speech_state["speech_buffer"])
                    speech_state["speech_buffer"] = []
                    speech_state["silence_frames"] = 0
                    speech_state["triggered"] = False
            else:
                if is_speech:
                    speech_state["triggered"] = True
                    speech_state["speech_buffer"].append(chunk)

    with sounddevice.InputStream(
        samplerate=config.get("mic", {}).get("sample_rate", 16_000),
        channels=1,
        dtype="int16",
        callback=callback,
    ):
        while final_state["data"] is None:
            sounddevice.sleep(100)

    buffer = io.BytesIO()
    sf.write(buffer, final_state["data"], SAMPLE_RATE, format="WAV", subtype="PCM_16")

    return buffer.getvalue()


async def _step(prompt: str | bytes, history: list[ModelMessage]) -> None:
    die_now_event = threading.Event()
    prompt_context = await twitch.get_prompt_ctx()

    def __inner(history: list[ModelMessage]) -> None:
        with Live(refresh_per_second=4) as live:
            if isinstance(prompt, str):
                result = agent.run_stream_sync(f"{prompt_context}\n{prompt}", message_history=history)
            else:
                result = agent.run_stream_sync(
                    [
                        prompt_context,
                        BinaryContent(prompt, media_type="audio/wav"),
                    ],
                    message_history=history,
                )
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
                    if part.tool_name == "clear_history":
                        print("[TOOL AFTER] clear history post processing")
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
            await asyncio.sleep(0.25)  # yield to executor
        thread.join()
    except asyncio.CancelledError:
        console.log("[INFERENCE] Task cancelled, we'll force the thread to die")
        die_now_event.set()
        thread.join()


async def _main():
    global history

    wakeword = Wakeword()
    waked = False

    await twitch_chat.connect(asyncio.get_running_loop())

    while True:
        try:
            await communication.inform_activated(False)
            console.log("Awaiting wakeword")
            if (
                not waked
            ):  # this comes from later in the loop body, where the wakeword is uttered during a step
                await wakeword.run_then_return()

            await communication.inform_activated(True)
            waked = False
            console.log("Ready to prompt")
            audio_bytes = get_mic_audio()

            fut1 = asyncio.create_task(_step(audio_bytes, history))
            fut2 = asyncio.create_task(wakeword.run_then_return())
            await communication.inform_loading()
            done, pending = await asyncio.wait(
                [fut1, fut2], return_when=asyncio.FIRST_COMPLETED
            )

            if fut2 in done:
                waked = True

            for fut in pending:
                fut.cancel()
                await fut

        except KeyboardInterrupt:
            console.log("Quit")
            await exits_yourself()


async def _interactive_main():
    global history

    wakeword = Wakeword()
    await twitch_chat.connect(asyncio.get_running_loop())

    while True:
        try:
            await communication.inform_activated(True)
            prompt = Prompt.ask("Maki Text Prompt")
            if len(prompt.strip()) == 0:
                continue

            fut1 = asyncio.create_task(_step(prompt, history))
            fut2 = asyncio.create_task(wakeword.run_then_return())
            await communication.inform_loading()
            _, pending = await asyncio.wait(
                [fut1, fut2], return_when=asyncio.FIRST_COMPLETED
            )

            for fut in pending:
                console.log(f"Waiting for {fut}")
                fut.cancel()
                await fut
        except KeyboardInterrupt:
            console.log("Quit")
            await exits_yourself()


@app.command()
def main():
    """
    Audio main
    """
    asyncio.run(_main())


@app.command()
def interactive_main():
    """
    Interactive Main
    """
    asyncio.run(_interactive_main())


if __name__ == "__main__":
    app()
