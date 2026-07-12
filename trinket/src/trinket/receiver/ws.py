"""
Websocket Client
"""

import logging
from typing import Callable
from websocket import create_connection, WebSocketTimeoutException

from trinket.receiver.model import Command
from trinket.support import CancellationToken

logger = logging.getLogger(__name__)

MAX_BACKOFF = 30


class TTSWebsocketClient:  # pylint: disable=too-few-public-methods
    """
    TTSWebsocketClient should be run on its own thread
    """

    def __init__(
        self,
        url: str,
        on_message: Callable[[Command], None],
        cancellation: CancellationToken,
    ) -> None:
        self._url = url
        self.on_message = on_message
        self.cancellation = cancellation
        self.ws = None

    def _connect(self):
        ws = create_connection(self._url)
        ws.settimeout(5)
        return ws

    def _recv_loop(self):
        while not self.cancellation.is_cancelled():
            try:
                result = self.ws.recv()
                if self.on_message:
                    self.on_message(Command.from_json(result))
            except WebSocketTimeoutException:
                continue
            except (ValueError, TypeError):
                logger.exception("cannot deserialize command")

    def run_forever(self) -> None:
        """
        Reconnects on failure with exponential backoff.
        """
        backoff = 1
        while not self.cancellation.is_cancelled():
            try:
                self.ws = self._connect()
                backoff = 1
                self._recv_loop()
            except WebSocketTimeoutException:
                continue
            except (ConnectionError, OSError) as e:
                logger.warning(
                    "WS connection error: %s; reconnecting in %ds", e, backoff
                )

            if not self.cancellation.is_cancelled():
                self.cancellation.wait(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)
