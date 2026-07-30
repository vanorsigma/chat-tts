import typing
import typer
import asyncio

from config import fetch_maki_config, fetch_bot_token, MakiConfig
from deps import MakiDeps
from actions import TerminatingAction
from memory import Memory
from tools.communication import Communication
from wakeword.wakeword import Wakeword
from prompts import PERSONALITY_PROMPT, TERMINATION_PROTOCOL
from triggers import VadTrigger, AutonomousTrigger
from triggers.base import TriggerContext
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
from tools.deep_reasoning import DeepReasoning
from tools.evaluator import Evaluator
from tools.screenshot import ScreenshotTool
from logger import install_console_hijack, broadcast_logs
from shared.bus_receiver import run_receiver

MAX_REQUESTS = 7

app = typer.Typer()
console = Console()


async def _step(
    agent: Agent[MakiDeps, TerminatingAction],
    deps: MakiDeps,
    ctx: TriggerContext,
) -> list:
    prompt_size = len(ctx.prompt)
    print(
        f"[CORE] Agent step starting: prompt_type={ctx.modality}, prompt_size={prompt_size}"
    )

    if ctx.modality == "text":
        prompt_str = typing.cast(str, ctx.prompt)
        user_content: typing.Any = prompt_str
        deps.recall_context = await deps.memory.recall(prompt_str)
        asyncio.create_task(deps.memory.prune_expired())
    else:
        prompt_bytes = typing.cast(bytes, ctx.prompt)
        user_content = BinaryContent(prompt_bytes, media_type="audio/wav")
        deps.recall_context = ""

    result = await agent.run(
        [user_content],
        deps=deps,
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
        recall_text = ctx.deps.recall_context
        recall_block = ""
        if recall_text:
            recall_block = (
                "\n\nRelevant long-term memories (JSON list, newest first):\n"
                + recall_text
            )
        addendum_label = ""
        if ctx.deps.trigger_context and ctx.deps.trigger_context.addendum_prompt:
            addendum_label = ctx.deps.trigger_context.addendum_prompt + "\n\n"
        return (
            PERSONALITY_PROMPT
            + "\n\n"
            + addendum_label
            + TERMINATION_PROTOCOL
            + "\n\n"
            + base
            + recall_block
            + "\n\n"
            + t3_block
        )

    print(f"[CORE] Agent built successfully")
    return agent


async def _main():
    print("[CORE] Maki starting up")
    config = await fetch_maki_config()
    bot_token = await fetch_bot_token()

    print("[CORE] Initializing tools")
    twitch = TwitchTool(config, bot_token)
    twitch_chat = TwitchChatClient(config.broadcaster_name)
    evaluator = Evaluator(config)
    deep_reasoning = DeepReasoning(config)
    screenshot = ScreenshotTool(config)
    communication = Communication(config)

    memory = Memory(config.openrouter_api_key)

    install_console_hijack()
    _log_broadcast_task = asyncio.create_task(broadcast_logs(communication._ws_send))
    print("[CORE] Console hijack installed, log broadcast task created")

    _IMPORTANT_ACTIVE = False

    async def _on_control_important(msg: dict) -> None:
        nonlocal _IMPORTANT_ACTIVE
        if msg.get("op") != "important":
            return
        _IMPORTANT_ACTIVE = bool(msg.get("importantActive"))
        communication.set_important_guard(_IMPORTANT_ACTIVE)
        print(f"[CORE] Important mode {'enabled' if _IMPORTANT_ACTIVE else 'disabled'}")

    async def _on_token_refreshed(msg: dict) -> None:
        print("[CORE] Received tokenRefreshed bus message, re-fetching bot token")
        try:
            new_token = await fetch_bot_token()
            await twitch.apply_refreshed_token(new_token)
            print("[CORE] Bot token updated from Captain")
        except Exception as e:
            print(f"[CORE] Failed to refresh bot token from bus notification: {e}")

    _receiver_task = await run_receiver(
        {
            "tokenRefreshed": _on_token_refreshed,
            "control": _on_control_important,
        }
    )
    print("[CORE] Bus receiver started")

    deps = MakiDeps(
        config=config,
        twitch=twitch,
        twitch_chat=twitch_chat,
        communication=communication,
        screenshot=screenshot,
        memory=memory,
    )

    all_tools = (
        twitch.get_twitch_tools()
        + random_tools
        + screenshot.get_tools()
        + deep_reasoning.get_tools()
        + communication.get_tools()
        + twitch_chat.get_twitch_tools()
        + memory.get_tools()
        + [WebSearchTool, WebFetchTool]
    )
    print(f"[CORE] {len(all_tools)} tools loaded")

    agent = _build_agent(config, all_tools)

    wakeword = Wakeword()

    print("[CORE] Connecting to Twitch IRC")
    await twitch_chat.connect(asyncio.get_running_loop())

    print("[CORE] Fetching subscriber badge map")
    await twitch._lazy_init()
    sub_badge_map = await twitch._fetch_subscriber_badge_map()
    twitch_chat.set_sub_badge_map(sub_badge_map)

    async def _cleanup():
        print("[CORE] Starting cleanup")
        _receiver_task.cancel()
        try:
            await _receiver_task
        except asyncio.CancelledError:
            pass
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

    triggers = [
        VadTrigger(wakeword=wakeword, communication=communication),
        AutonomousTrigger(),
    ]

    arm_tasks: dict = {}
    current_task: asyncio.Task | None = None
    current_priority: int = -1

    try:
        for trigger in triggers:
            arm_tasks[trigger] = asyncio.create_task(trigger.arm())

        print("[CORE] Entering orchestrator loop")

        while True:
            wait_set = list(arm_tasks.values())
            if current_task and not current_task.done():
                wait_set.append(current_task)
            done, _ = await asyncio.wait(wait_set, return_when=asyncio.FIRST_COMPLETED)

            for d in done:
                if d is current_task:
                    try:
                        d.result()
                        print("[CORE] Agent step completed successfully")
                    except asyncio.CancelledError:
                        print("[CORE] Agent step cancelled (preempted)")
                    except Exception as e:
                        console.log(f"[CORE] Step failed: {e}")
                    current_task = None
                    current_priority = -1
                    try:
                        await communication.inform_activated(False)
                    except Exception:
                        pass
                    continue

                trigger = next(t for t in triggers if arm_tasks[t] is d)
                try:
                    ctx = d.result()
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"[{trigger.name}] arm failed: {e}")
                    arm_tasks[trigger] = asyncio.create_task(trigger.arm())
                    continue

                if _IMPORTANT_ACTIVE:
                    print(f"[{trigger.name}] skipped — important mode active")
                    arm_tasks[trigger] = asyncio.create_task(trigger.arm())
                    continue

                if current_task is not None and ctx.priority <= current_priority:
                    print(
                        f"[CORE] {trigger.name} ignored (prio {ctx.priority} <= {current_priority})"
                    )
                else:
                    if current_task and not current_task.done():
                        print(
                            f"[CORE] Preempting in-flight run (prio {current_priority} -> {ctx.priority})"
                        )
                        current_task.cancel()
                        try:
                            await current_task
                        except asyncio.CancelledError:
                            pass
                        current_task = None
                        current_priority = -1
                        try:
                            await communication.inform_activated(False)
                        except Exception:
                            pass

                    current_priority = ctx.priority
                    deps.trigger_context = ctx
                    current_task = asyncio.create_task(_step(agent, deps, ctx))

                arm_tasks[trigger] = asyncio.create_task(trigger.arm())

    except KeyboardInterrupt:
        console.log("Quit (KeyboardInterrupt)")
    finally:
        print("[CORE] Shutting down orchestrator tasks")
        for task in arm_tasks.values():
            task.cancel()
        if current_task and not current_task.done():
            current_task.cancel()
        shutdown_tasks = list(arm_tasks.values())
        if current_task:
            shutdown_tasks.append(current_task)
        for task in shutdown_tasks:
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        await _cleanup()


@app.command()
def main():
    """
    Audio main
    """
    asyncio.run(_main())


if __name__ == "__main__":
    app()
