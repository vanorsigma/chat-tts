"""
Websocket Client
"""

import sys
from typing import Callable
from websocket import create_connection, WebSocketTimeoutException

from trinket.receiver.model import Command
from trinket.support import CancellationToken

class TTSWebsocketClient: # pylint: disable=too-few-public-methods
    """
    TTSWebsocketClient should be run on its own thread
    """
    def __init__(self, url: str, on_message: Callable[[Command], None],
                 cancellation: CancellationToken) -> None:
        self.ws = create_connection(url)
        self.ws.settimeout(5)
        self.on_message = on_message
        self.cancellation = cancellation

    def run_forever(self) -> None:
        """
        Runs forever
        """
        while not self.cancellation.is_cancelled():
            try:
                result = self.ws.recv()
                if self.on_message:
                    self.on_message(Command.from_json(result))
            except (ValueError, TypeError):
                print('cannot deserailize command', file=sys.stderr)
            except WebSocketTimeoutException:
                continue
