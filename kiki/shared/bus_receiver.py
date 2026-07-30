from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Awaitable, Callable
from typing import Any

BUS_RECEIVER_URL = os.getenv("BUS_RECEIVER_URL", "ws://localhost:3001/receivers")

Handler = Callable[[dict[str, Any]], Awaitable[None] | None]


async def run_receiver(handlers: dict[str, Handler]) -> asyncio.Task[None]:
    loop = asyncio.get_running_loop()
    task = loop.create_task(_receiver_loop(handlers))
    return task


async def _receiver_loop(handlers: dict[str, Handler]) -> None:
    import aiohttp

    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(BUS_RECEIVER_URL) as ws:
                    async for msg in ws:
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            continue
                        try:
                            payload = json.loads(msg.data)
                        except json.JSONDecodeError:
                            continue
                        handler = handlers.get(payload.get("type"))
                        if handler:
                            try:
                                result = handler(payload)
                                if result is not None:
                                    await result
                            except Exception:
                                pass
        except asyncio.CancelledError:
            break
        except Exception:
            pass
        await asyncio.sleep(2)
