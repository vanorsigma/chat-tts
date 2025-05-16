"""
Utility classes
"""


class CancellationToken:
    """
    CancellationToken, implemented so that classes can keep a reference to it
    """

    def __init__(self):
        self._cancelled = False

    def cancel(self):  # pylint: disable=missing-function-docstring
        self._cancelled = True

    def is_cancelled(self) -> bool:  # pylint: disable=missing-function-docstring
        return self._cancelled
