from __future__ import annotations

import asyncio
import builtins
import logging
import re
import time

BUS_URL = "ws://localhost:3001/senders"

_bus_queue: asyncio.Queue[dict] | None = None
_bus_task: asyncio.Task | None = None
_original_print = builtins.print
_hijacked = False
_prefix: str = ""


def _strip_ansi(s: str) -> str:
    return re.sub(r"\x1b\[[\d;]*[a-zA-Z]", "", s)


def _broadcast_entry(entry: dict) -> None:
    if _bus_queue is not None:
        try:
            _bus_queue.put_nowait(entry)
        except asyncio.QueueFull:
            pass


async def _sender_loop() -> None:
    import aiohttp

    assert _bus_queue is not None
    while True:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(BUS_URL) as ws:
                    while True:
                        entry = await _bus_queue.get()
                        try:
                            await ws.send_json(entry)
                        except Exception:
                            break
        except asyncio.CancelledError:
            break
        except Exception:
            pass
        await asyncio.sleep(2)


class BusLogHandler(logging.Handler):
    LEVEL_MAP = {
        logging.DEBUG: "debug",
        logging.INFO: "info",
        logging.WARNING: "warn",
        logging.ERROR: "error",
        logging.CRITICAL: "error",
    }

    def __init__(self, prefix: str = "") -> None:
        super().__init__()
        self.prefix = prefix

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = _strip_ansi(f"{self.prefix} {record.getMessage()}")
        except Exception:
            msg = _strip_ansi(f"{self.prefix} {record.msg}")
        entry = {
            "type": "log",
            "level": self.LEVEL_MAP.get(record.levelno, "info"),
            "ts": int(record.created * 1000),
            "msg": msg,
        }
        _broadcast_entry(entry)


def _hijacked_print(*args, **kwargs) -> None:
    _original_print(*args, **kwargs)
    try:
        msg = _strip_ansi(
            f"{_prefix} {' '.join(str(a) if isinstance(a, str) else repr(a) for a in args)}"
        )
    except Exception:
        msg = f"{_prefix} <print error>"
    entry = {
        "type": "log",
        "level": "info",
        "ts": int(time.time_ns() // 1_000_000),
        "msg": msg,
    }
    _broadcast_entry(entry)


def install_bus_logging(prefix: str = "") -> None:
    global _bus_queue, _bus_task, _hijacked, _prefix

    if _bus_task is not None:
        return

    _prefix = prefix

    _bus_queue = asyncio.Queue()

    root_logger = logging.getLogger()
    handler = BusLogHandler(prefix)
    handler.setLevel(logging.DEBUG)
    root_logger.addHandler(handler)

    if not _hijacked:
        _hijacked = True
        builtins.print = _hijacked_print

    _bus_task = asyncio.create_task(_sender_loop())

    print(f"Bus logging installed [{prefix}]")
