"""
Shared Components
"""

from PyQt6.QtWidgets import QTextEdit, QWidget
from PyQt6.QtGui import QCloseEvent
from PyQt6.QtCore import Qt, pyqtSignal

class CloseSignalableWidget(QWidget): # pylint: disable=too-few-public-methods
    """
    A QWidget that emites a closed signal. It also actually closes
    QWidget and calls the default behavior
    """
    closed = pyqtSignal(QWidget)
    def closeEvent(self, event: QCloseEvent) -> None: # pylint: disable=invalid-name,missing-function-docstring
        self.closed.emit(self)
        self.close()
        event.accept()
        super().closeEvent(event)

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
