"""
Console-based receiver for local development.
Reads JSON commands and chat messages from stdin, one per line.

JSON commands: {"type": "trinket", "command": {"type": "distract"}}
Chat messages:  >keyword
"""

import logging
import select
import sys
from typing import Callable

from trinket.receiver.model import Command
from trinket.support import CancellationToken

logger = logging.getLogger(__name__)

_chat_listeners: list[Callable[[str], None]] = []


def register_chat_listener(callback: Callable[[str], None]) -> None:
    _chat_listeners.append(callback)


def unregister_chat_listener(callback: Callable[[str], None]) -> None:
    if callback in _chat_listeners:
        _chat_listeners.remove(callback)


class ConsoleReceiver:

    def __init__(
        self, on_message: Callable[[Command], None], cancellation: CancellationToken
    ) -> None:
        self.on_message = on_message
        self.cancellation = cancellation

    def run_forever(self) -> None:
        logger.info("Console receiver started; awaiting commands on stdin")
        while not self.cancellation.is_cancelled():
            ready, _, _ = select.select([sys.stdin], [], [], 1.0)
            if not ready:
                continue
            line = sys.stdin.readline()
            if not line:
                break
            line = line.strip()
            if not line:
                continue
            if line.startswith(">"):
                message = line[1:]
                for listener in _chat_listeners:
                    listener(message)
                continue
            try:
                self.on_message(Command.from_json(line))
            except (ValueError, TypeError):
                logger.exception("cannot deserialize command")
