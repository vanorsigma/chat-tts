"""
Shared Components
"""

from PyQt6.QtWidgets import QTextEdit
from PyQt6.QtCore import Qt

# pylint: disable=too-few-public-methods
class SingleLineTextEdit(QTextEdit):
    """
    A QTextEdit that only allows one line of text.
    """
    def keyPressEvent(self, event) -> None: # pylint: disable=invalid-name,missing-function-docstring
        if event.key() == Qt.Key.Key_Return:
            event.ignore()
        else:
            super().keyPressEvent(event)
