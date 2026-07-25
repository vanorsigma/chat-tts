from __future__ import annotations

import asyncio
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal


class Priority:
    AUTONOMOUS = 10
    VAD = 100


@dataclass
class TriggerContext:
    priority: int
    prompt: str | bytes = b""
    modality: Literal["text", "audio"] = "text"
    addendum_prompt: str = ""


class Trigger(ABC):
    name: str = "trigger"
    priority: int = 0

    @abstractmethod
    async def arm(self) -> TriggerContext: ...


class ThreadedTrigger(Trigger):
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stop_event: threading.Event | None = None
        self._fire_event: asyncio.Event | None = None
        self._thread: threading.Thread | None = None

    def _prepare(self) -> None:
        self._loop = asyncio.get_running_loop()
        self._fire_event = asyncio.Event()
        self._stop_event = threading.Event()

    def _start_thread(self, target) -> None:
        self._thread = threading.Thread(target=target, daemon=True)
        self._thread.start()

    async def _await_fire(self) -> None:
        assert self._fire_event is not None
        assert self._stop_event is not None
        try:
            await self._fire_event.wait()
        except asyncio.CancelledError:
            self._stop_event.set()
            if self._thread:
                self._thread.join()
            raise
        if self._thread:
            self._thread.join()
