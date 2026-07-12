"""
Utility classes
"""

import threading


class CancellationToken(threading.Event):
    """
    Thread-safe cancellation signal backed by threading.Event.
    """

    def is_cancelled(self) -> bool:
        return self.is_set()

    def cancel(self) -> None:
        self.set()
