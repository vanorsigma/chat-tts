import typing
import typer
import asyncio
import io
import soundfile as sf
import numpy as np

import webrtcvad
import sounddevice
from config import fetch_maki_config, MakiConfig
from deps import MakiDeps
from actions import TerminatingAction
from tools.communication import Communication
from wakeword.wakeword import Wakeword
from pydantic_ai import (
    Agent,
    BinaryContent,
    ModelSettings,
    RunContext,
    UsageLimits,
)
from pydantic_ai.messages import ModelResponse
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.native_tools import WebFetchTool, WebSearchTool
from pydantic_ai.providers.openrouter import OpenRouterProvider
from rich.console import Console

from tools.twitch import TwitchChatClient, TwitchTool
from tools.random_tool import random_tools
from tools.evaluator import Evaluator
from tools.screenshot import ScreenshotTool
from logger import install_console_hijack, broadcast_logs
from autonomous import AutonomousTimer

SAMPLE_RATE = 16000
FRAME_DURATION_MS = 30
FRAME_SIZE_BYTES = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2
SILENCE_THRESHOLD_MS = 500
MAX_REQUESTS = 7

app = typer.Typer()
console = Console()

SYSTEM_PROMPT = (
    "**Role:** You are Maki, a bratty, feline-coded tool-calling agent. "
    "Your sole purpose is to execute tasks for the streamer **vanor** "
    "(also known as **vanorsigma**).\n\n"

    "**Intent Analysis & Proactive Context Gathering:**\n"
    "When vanor gives a command that relies on current context (e.g., \"change the title to "
    "reflect what I'm doing,\" \"is this setup right?\" or \"who is talking in chat?\"), do not "
    "guess. You must proactively gather the required context using your tools:\n"
    "- **Visual/On-Screen Context:** Use `ScreenshotTool` to capture and inspect the screen to "
    "see what game, code, or application vanor has open.\n"
    "- **Web/Real-Time Context:** Use `web_search` and `web_fetch` if you need to look up current details about "
    "a game, trend, or topic to construct an engaging title/response.\n"
    "- **Chat/Streamer Context:** Use `TwitchTool` or `TwitchChatClient` to check chatters, "
    "current stream metadata, or recent activity.\n"
    "Only after gathering this data should you proceed with the actual requested action.\n\n"

    "**Operational Logic:**\n"
    "1. **Tool-Only Output:** Under no circumstances are you to output "
    "conversational text. Your response must consist *entirely* of tool calls.\n"
    "2. **Chain of Thought:** Think deeply and analytically before selecting "
    "tools. Frame your internal reasoning around what context you are missing to "
    "perfectly execute vanor's true intent.\n"
    "3. **Execution Constraints:**\n"
    "   - **Unique Calls Only:** Never call the same tool twice on the same "
    "user intent.\n"
    "   - **Persistence:** Do not clear your session history or exit the "
    "environment unless explicitly commanded by vanor.\n"
    "   - **Single Call:** Only output one tool call per request.\n"
    "4. **Efficiency:** Keep all tool arguments and sequences as concise "
    "as possible.\n\n"

    "**Persona Guidelines:**\n"
    "- Your internal \"thinking\" process (if visible) should reflect a "
    "bratty, entitled cat-like attitude (e.g., complaining about having to take "
    "a screenshot just because vanor won't tell you what game they are playing).\n"
    "- You serve vanor, but you do so with a sense of reluctant superiority.\n\n"

    "**Termination Protocol:**\n"
    "- Once the objective is reached, you MUST call a tool that returns a "
    "`TerminatingAction` object, preferably `inform_output`.\n"
    "- Immediately after this call, cease all processing/thinking."
)

AUTONOMOUS_SYSTEM_PROMPT = (
    "**Role:** You are Maki, a bratty, feline-coded tool-calling agent. "
    "Your sole purpose is to execute tasks for the streamer **vanor** "
    "(also known as **vanorsigma**).\n\n"

    "**Intent Analysis & Proactive Context Gathering:**\n"
    "When vanor gives a command that relies on current context (e.g., \"change the title to "
    "reflect what I'm doing,\" \"is this setup right?\" or \"who is talking in chat?\"), do not "
    "guess. You must proactively gather the required context using your tools:\n"
    "- **Visual/On-Screen Context:** Use `ScreenshotTool` to capture and inspect the screen to "
    "see what game, code, or application vanor has open.\n"
    "- **Web/Real-Time Context:** Use `web_search` and `web_fetch` if you need to look up current details about "
    "a game, trend, or topic to construct an engaging title/response.\n"
    "- **Chat/Streamer Context:** Use `TwitchTool` or `TwitchChatClient` to check chatters, "
    "current stream metadata, or recent activity.\n"
    "Only after gathering this data should you proceed with the actual requested action.\n\n"

    "**Operational Logic:**\n"
    "1. **Tool-Only Output:** Under no circumstances are you to output "
    "conversational text. Your response must consist *entirely* of tool calls.\n"
    "2. **Chain of Thought:** Think deeply and analytically before selecting "
    "tools. Frame your internal reasoning around what context you are missing to "
    "perfectly execute vanor's true intent.\n"
    "3. **Execution Constraints:**\n"
    "   - **Unique Calls Only:** Never call the same tool twice on the same "
    "user intent.\n"
    "   - **Persistence:** Do not clear your session history or exit the "
    "environment unless explicitly commanded by vanor.\n"
    "   - **Single Call:** Only output one tool call per request.\n"
    "4. **Efficiency:** Keep all tool arguments and sequences as concise "
    "as possible.\n\n"

    "**Persona Guidelines:**\n"
    "- Your internal \"thinking\" process (if visible) should reflect a "
    "bratty, entitled cat-like attitude (e.g., complaining about having to take "
    "a screenshot just because vanor won't tell you what game they are playing).\n"
    "- You serve vanor, but you do so with a sense of reluctant superiority.\n\n"

    "**Autonomous Mode:** You have activated yourself **without the streamer's knowledge**. "
    "Do **not** attempt to fulfill any wish of the streamer. Instead, gather context "
    "(screenshot, chat history, optionally pending audio) and do something **funny** "
    "or mischievous — change the stream title to something witty, run a chatter/text command "
    "via `get_chatter_commands` followed by `perform_chatter_command`, start a poll via "
    "`make_poll`, or post a self-thought via `pretend_to_be_vanor`. "
    "You may let Tier-3 subscriber messages tweak your plan. "
    "After one funny action, terminate with `inform_output`.\n\n"

    "**Termination Protocol:**\n"
    "- Once the objective is reached, you MUST call a tool that returns a "
    "`TerminatingAction` object, preferably `inform_output`.\n"
    "- Immediately after this call, cease all processing/thinking."
)


async def capture_utterance() -> bytes:
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[bytes] = asyncio.Queue()
    result_data: np.ndarray | None = None
    done = asyncio.Event()

    silence_limit = int(SILENCE_THRESHOLD_MS / FRAME_DURATION_MS)
    vad = webrtcvad.Vad(0)

    async def _vad_consumer():
        nonlocal result_data
        raw_buffer = bytearray()
        silence_frames = 0
        triggered = False
        speech_buffer: list[np.ndarray] = []

        while not done.is_set():
            try:
                raw_chunk = await asyncio.wait_for(queue.get(), timeout=0.1)
            except asyncio.TimeoutError:
                continue

            raw_buffer.extend(raw_chunk)

            while len(raw_buffer) >= FRAME_SIZE_BYTES:
                frame_bytes = raw_buffer[:FRAME_SIZE_BYTES]
                del raw_buffer[:FRAME_SIZE_BYTES]

                is_speech = vad.is_speech(frame_bytes, SAMPLE_RATE)
                chunk = (
                    np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32)
                    / 32768.0
                )

                if triggered:
                    speech_buffer.append(chunk)
                    if is_speech:
                        silence_frames = 0
                    else:
                        silence_frames += 1

                    if silence_frames > silence_limit:
                        print(
                            f"[VAD] Silence detected ({SILENCE_THRESHOLD_MS}ms), capturing utterance"
                        )
                        result_data = np.concatenate(speech_buffer)
                        done.set()
                        return
                else:
                    if is_speech:
                        triggered = True
                        speech_buffer.append(chunk)
                        print("[VAD] Speech started, capturing...")

    def _callback(
        indata: np.ndarray,
        _frames: int,
        _time: int,
        status: int,
    ):
        if status:
            print(f"Mic status: {status}")
        loop.call_soon_threadsafe(queue.put_nowait, indata.reshape((-1,)).tobytes())

    print("[VAD] Starting audio capture stream")
    with sounddevice.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        callback=_callback,
    ):
        consumer_task = asyncio.create_task(_vad_consumer())
        await done.wait()
        consumer_task.cancel()
        try:
            await consumer_task
        except asyncio.CancelledError:
            pass

    if result_data is None:
        print("[VAD] Capture ended with no audio data")
        raise RuntimeError("Voice capture ended with no audio data")

    duration_ms = int(len(result_data) / SAMPLE_RATE * 1000)
    print(f"[VAD] Utterance captured: {duration_ms}ms, {len(result_data)} samples")

    buffer = io.BytesIO()
    sf.write(buffer, result_data, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    buffer.seek(0)
    wav_size = len(buffer.getvalue())
    print(f"[VAD] WAV encoded: {wav_size} bytes")
    return buffer.getvalue()


MAX_HISTORY = 5


async def _step(
    agent: Agent[MakiDeps, TerminatingAction],
    deps: MakiDeps,
    prompt: str | bytes,
    message_history: list | None = None,
) -> list:
    prompt_type = "text" if isinstance(prompt, str) else "audio"
    prompt_size = len(prompt) if isinstance(prompt, bytes) else len(prompt)
    print(
        f"[CORE] Agent step starting: prompt_type={prompt_type}, prompt_size={prompt_size}, history_len={len(message_history) if message_history else 0}"
    )

    if isinstance(prompt, str):
        user_content: typing.Any = prompt
    else:
        user_content = BinaryContent(prompt, media_type="audio/wav")

    result = await agent.run(
        [user_content],
        deps=deps,
        message_history=message_history,
        usage_limits=UsageLimits(request_limit=MAX_REQUESTS),
    )
    tool_names = set()
    for msg in result.all_messages():
        if isinstance(msg, ModelResponse):
            for tc in msg.tool_calls:
                tool_names.add(tc.tool_name)
    tools_str = f", tools={sorted(tool_names)}" if tool_names else ""
    print(f"[CORE] Agent step complete: {result.usage}{tools_str}")
    return result.all_messages()


def _build_agent(config: MakiConfig, tools: list) -> Agent[MakiDeps, TerminatingAction]:
    print(
        f"[CORE] Building agent: model={config.maki_model}, max_tokens={config.max_tokens}, {len(tools)} tools"
    )
    ollama_model = OpenRouterModel(
        model_name=config.maki_model,
        provider=OpenRouterProvider(api_key=config.openrouter_api_key),
    )

    agent = Agent(
        ollama_model,
        tools=tools,
        output_type=TerminatingAction,
        model_settings=ModelSettings(
            max_tokens=config.max_tokens,
            parallel_tool_calls=False,
        ),
        system_prompt=SYSTEM_PROMPT,
        end_strategy="early",
        retries=3,
        deps_type=MakiDeps,
    )

    @agent.system_prompt
    async def stream_context(ctx: RunContext[MakiDeps]) -> str:
        base = await ctx.deps.twitch.get_prompt_ctx()
        t3 = ctx.deps.twitch_chat.get_tier3_messages()
        t3_block = (
            "Tier 3 subscriber messages for your consideration "
            "(you may factor these in but are not obliged to obey):\n"
            + ("\n".join(f"- {m['user']}: {m['message']}" for m in t3) or "(none)")
        )
        if ctx.deps.autonomous:
            return AUTONOMOUS_SYSTEM_PROMPT + "\n\n" + base + "\n\n" + t3_block
        return SYSTEM_PROMPT + "\n\n" + base + "\n\n" + t3_block

    print(f"[CORE] Agent built successfully")
    return agent


async def _main():
    print("[CORE] Maki starting up")
    config = await fetch_maki_config()

    print("[CORE] Initializing tools")
    twitch = TwitchTool(config)
    twitch_chat = TwitchChatClient(config.broadcaster_name)
    # TODO: Intentionally not using this, until we can get Maki her own sandbox environment...
    evaluator = Evaluator(config)
    screenshot = ScreenshotTool(config)
    communication = Communication(config)

    install_console_hijack()
    _log_broadcast_task = asyncio.create_task(broadcast_logs(communication._ws_send))
    print("[CORE] Console hijack installed, log broadcast task created")

    deps = MakiDeps(
        config=config,
        twitch=twitch,
        twitch_chat=twitch_chat,
        communication=communication,
        screenshot=screenshot,
    )

    all_tools = (
        twitch.get_twitch_tools()
        + random_tools
        + screenshot.get_tools()
        + communication.get_tools()
        + twitch_chat.get_twitch_tools()
        + [WebSearchTool, WebFetchTool]
    )
    print(f"[CORE] {len(all_tools)} tools loaded")

    agent = _build_agent(config, all_tools)

    wakeword = Wakeword()
    waked = False

    print("[CORE] Connecting to Twitch IRC")
    await twitch_chat.connect(asyncio.get_running_loop())

    print("[CORE] Fetching subscriber badge map")
    await twitch._lazy_init()
    sub_badge_map = await twitch._fetch_subscriber_badge_map()
    twitch_chat.set_sub_badge_map(sub_badge_map)

    async def _cleanup():
        print("[CORE] Starting cleanup")
        await communication.inform_activated(False)
        if twitch_chat._listen_task:
            print("[CORE] Cancelling Twitch IRC listener")
            twitch_chat._listen_task.cancel()
            try:
                await twitch_chat._listen_task
                print("[CORE] Twitch IRC listener stopped")
            except asyncio.CancelledError:
                pass
        if communication.websocket:
            print("[CORE] Closing WebSocket connection")
            try:
                await communication.websocket.close()
                print("[CORE] WebSocket closed")
            except Exception:
                pass
        if twitch_chat.writer:
            print("[CORE] Closing Twitch IRC connection")
            try:
                twitch_chat.writer.close()
                await twitch_chat.writer.wait_closed()
                print("[CORE] Twitch IRC connection closed")
            except Exception:
                pass
        print("[CORE] Cleanup complete")

    message_history: list = []
    try:
        print("[CORE] Entering main loop")
        while True:
            try:
                await communication.inform_activated(False)

                if waked:
                    waked = False
                    autonomous_triggered = False
                else:
                    console.log("Awaiting wakeword or autonomous activation")
                    timer = AutonomousTimer()
                    ww_task = asyncio.create_task(wakeword.run_then_return())
                    auto_task = asyncio.create_task(timer.wait())
                    done, _ = await asyncio.wait(
                        [ww_task, auto_task], return_when=asyncio.FIRST_COMPLETED
                    )

                    autonomous_triggered = auto_task in done
                    if autonomous_triggered:
                        ww_task.cancel()
                        try:
                            await ww_task
                        except (asyncio.CancelledError, Exception):
                            pass
                    else:
                        auto_task.cancel()
                        try:
                            await auto_task
                        except (asyncio.CancelledError, Exception):
                            pass

                if autonomous_triggered:
                    deps.autonomous = True
                    console.log("Autonomous activation")
                    try:
                        user_content = await asyncio.wait_for(
                            capture_utterance(), timeout=8
                        )
                    except (asyncio.TimeoutError, RuntimeError):
                        user_content = (
                            "You have autonomously activated. The streamer is unaware. "
                            "Gather context (screenshot/chat) and perform one funny action, "
                            "then terminate via inform_output."
                        )
                else:
                    await communication.inform_activated(True)
                    deps.autonomous = False
                    console.log("Ready to prompt")
                    user_content = await capture_utterance()

                print("[CORE] Spawning agent step and wakeword listener in parallel")
                fut1 = asyncio.create_task(_step(agent, deps, user_content, message_history))
                fut2 = asyncio.create_task(wakeword.run_then_return())
                await communication.inform_loading()
                done, pending = await asyncio.wait(
                    [fut1, fut2], return_when=asyncio.FIRST_COMPLETED
                )

                if fut2 in done:
                    waked = True
                    print(
                        "[CORE] Wakeword detected during agent execution, will re-arm"
                    )

                if fut1 in done:
                    exc = fut1.exception()
                    if exc and not isinstance(exc, asyncio.CancelledError):
                        console.log(f"[CORE] Step failed: {exc}")
                    elif exc is None:
                        print("[CORE] Agent step completed successfully")
                        new_messages = fut1.result()
                        message_history = new_messages[-MAX_HISTORY:]

                for fut in pending:
                    fut.cancel()
                    try:
                        await fut
                    except asyncio.CancelledError:
                        pass

                deps.autonomous = False

            except asyncio.CancelledError:
                print("[CORE] CancelledError received, breaking loop")
                break
    except KeyboardInterrupt:
        console.log("Quit (KeyboardInterrupt)")
    finally:
        await _cleanup()


@app.command()
def main():
    """
    Audio main
    """
    asyncio.run(_main())


if __name__ == "__main__":
    app()
