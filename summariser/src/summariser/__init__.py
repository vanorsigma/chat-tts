import asyncio
import time

import aiohttp.web

from shared.bus_logging import install_bus_logging
from shared.bus_receiver import run_receiver

from .audio import Transcriber
from .bus import Bus
from .chat import ChatBuffer
from .config import CategoryTracker, SummariserConfig, fetch_summariser_config
from .memory import Memory
from .screenshot import Screenshot
from .summariser import SummaryAgent

HOST = "127.0.0.1"
PORT = 9126
CORS = {"Access-Control-Allow-Origin": "*"}


class SummariserService:
    def __init__(self, config: SummariserConfig, channel: str) -> None:
        self.config = config
        self.bus = Bus(config)
        self.chat = ChatBuffer(channel, config.window_minutes)
        self.category = CategoryTracker()
        self.memory = Memory(
            config.openrouter_api_key,
            config.rolling_window_size,
            config.blacklisted_categories,
        )
        self.agent = SummaryAgent(config, self.memory)
        self.transcriber = Transcriber(config)
        self.screenshot = Screenshot(config.screenshot_monitor, self.bus)
        self.important = False
        self._generate_lock = asyncio.Lock()

    async def _generate_once(self) -> dict[str, object] | None:
        category = self.category.category
        stream_id = self.category.stream_id
        if not category or self.important:
            return None

        transcript = await self.agent.correct_transcript(self.transcriber.window())
        previous = await self.memory.history(category, stream_id)
        if self.important:
            return None
        screenshot = await self.screenshot.capture()
        text = await self.agent.generate(
            self.chat.window(), transcript, previous, screenshot
        )
        if self.important:
            return None
        created_at = int(time.time() * 1000)
        await self.memory.add(category, stream_id, text, created_at)
        await self.bus.send_summary(category, text, created_at, stream_id)
        print(f"[SUMMARISER] Generated summary for {category!r} ({len(text)} chars)")
        return {
            "category": category,
            "text": text,
            "createdAt": created_at,
            "streamId": stream_id,
        }

    async def generate(self) -> dict[str, object] | None:
        async with self._generate_lock:
            return await self._generate_once()

    async def _latest_or_generate(self) -> dict[str, object] | None:
        category = self.category.category
        stream_id = self.category.stream_id
        if not category or not self.category.is_live:
            return None
        async with self._generate_lock:
            latest = await self.memory.latest(category, stream_id)
            if latest is not None:
                text, created_at, stored_stream_id = latest
                return {
                    "category": category,
                    "text": text,
                    "createdAt": created_at,
                    "streamId": stored_stream_id,
                }
            return await self._generate_once()

    async def handle_summary(
        self, request: aiohttp.web.Request
    ) -> aiohttp.web.Response:
        try:
            payload = await self._latest_or_generate()
        except Exception as e:
            print(f"[SUMMARISER] On-demand generation failed: {e}")
            payload = None
        if payload is None:
            return aiohttp.web.Response(
                status=404, text="no summary available", headers=CORS
            )
        return aiohttp.web.json_response(payload, headers=CORS)

    async def _periodic(self) -> None:
        interval = self.config.summary_interval_minutes * 60
        while True:
            await asyncio.sleep(interval)
            if self.important:
                print("[SUMMARISER] Important mode active, skipping generation")
                continue
            if not self.category.is_live or not self.category.category:
                continue
            try:
                await self.generate()
            except Exception as e:
                print(f"[SUMMARISER] Periodic generation failed: {e}")

    async def on_control(self, msg: dict[str, object]) -> None:
        if msg.get("op") != "important":
            return
        self.important = bool(msg.get("importantActive"))
        print(
            f"[SUMMARISER] Important mode {'enabled' if self.important else 'disabled'}"
        )


async def _serve(service: SummariserService) -> aiohttp.web.AppRunner:
    app = aiohttp.web.Application()
    app.router.add_get("/summary", service.handle_summary)
    runner = aiohttp.web.AppRunner(app)
    await runner.setup()
    site = aiohttp.web.TCPSite(runner, HOST, PORT)
    await site.start()
    print(f"[SUMMARISER] Listening on http://{HOST}:{PORT}/")
    return runner


async def _main() -> None:
    install_bus_logging("[Summariser]")
    config, channel = await fetch_summariser_config()
    service = SummariserService(config, channel)

    try:
        await service.chat.connect()
    except Exception as e:
        print(f"[SUMMARISER] IRC connection failed, summarising without chat: {e}")
    await service.transcriber.start()

    tasks = [
        await run_receiver({"control": service.on_control}),
        asyncio.create_task(service.category.run()),
        asyncio.create_task(service._periodic()),
    ]
    runner = await _serve(service)

    try:
        await asyncio.Event().wait()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await runner.cleanup()
        await service.chat.close()
        await service.transcriber.close()
        await service.bus.close()


def main() -> None:
    asyncio.run(_main())


if __name__ == "__main__":
    main()
