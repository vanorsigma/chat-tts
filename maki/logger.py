import asyncio
import json
import time
import builtins as _builtins
from typing import Any, Callable, Awaitable

from rich.console import Console

LogMessage = dict[str, Any]

_log_queue: asyncio.Queue[str] = asyncio.Queue(maxsize=1000)
_hijacked = False
_orig_print = _builtins.print
_orig_console_log = Console.log


def _build_entry(level: str, *args: Any) -> str:
    msg_text = "[Maki] " + " ".join(str(a) for a in args)
    return json.dumps(
        {
            "type": "log",
            "level": level,
            "ts": int(time.time() * 1000),
            "msg": msg_text,
        }
    )


def _enqueue(level: str, *args: Any):
    try:
        _log_queue.put_nowait(_build_entry(level, *args))
    except asyncio.QueueFull:
        _orig_print("[LOGGER] Log queue full, dropping message")


def install_console_hijack():
    global _hijacked
    if _hijacked:
        return
    _hijacked = True

    def _patched_print(*args: Any, **kwargs: Any):
        _orig_print(*args, **kwargs)
        _enqueue("info", *args)

    _builtins.print = _patched_print

    def _patched_console_log(self: Console, *args: Any, **kwargs: Any):
        _orig_console_log(self, *args, **kwargs)
        _enqueue("info", *args)

    Console.log = _patched_console_log
    _orig_print("[LOGGER] Console hijack installed")


async def broadcast_logs(
    ws_send: Callable[[str], Awaitable[None]],
) -> None:
    while True:
        msg = await _log_queue.get()
        try:
            await ws_send(msg)
        except Exception as exc:
            _orig_print(f"[LOGGER] Broadcast failed: {exc}")
        _log_queue.task_done()
