"""
A frame for the rotation effect.

Takes a screenshot of the current screen, then rotates it.
"""

import sys

from PyQt6.QtCore import QElapsedTimer, Qt, QTimer
from PyQt6.QtGui import QGuiApplication, QTransform
from PyQt6.QtWidgets import QApplication, QLabel, QWidget


class RotateFrame(QWidget): # pylint: disable=too-few-public-methods
    """
    The frame that will perform the rotation
    """

    def __init__(self, speed: int):
        super().__init__()
        self.speed = speed
        self.completed = False
        self.setWindowTitle("Thingy")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setStyleSheet('background-color: black;')

        screen = QGuiApplication.primaryScreen()
        self.shot_pixmap = screen.grabWindow()
        self.width = screen.size().width()
        self.height = screen.size().height()
        self.setGeometry(0, 0, self.width, self.height)

        self.label = QLabel(self)
        self.label.setPixmap(self.shot_pixmap)
        self.label.setGeometry(0, 0, self.width, self.height)

        self.elapsed_timer = QElapsedTimer()
        self.elapsed_timer.start()

        self.fallback_timer = QTimer()
        self.fallback_timer.setInterval(1000)
        self.fallback_timer.timeout.connect(lambda: self.paintEvent(None))
        self.fallback_timer.start()

    def paintEvent(self, _event): # pylint: disable=invalid-name,missing-function-docstring
        elapsed_time = self.elapsed_timer.elapsed() / 1000.0
        angle = elapsed_time * self.speed

        if angle > 360:
            self.completed = True
            self.close()
            self.fallback_timer.stop()
            super().close()
            return

        transform = QTransform()
        transform.rotate(angle)

        rotated_pixmap = self.shot_pixmap.transformed(transform)

        self.label.setPixmap(rotated_pixmap)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setGeometry(0, 0, self.width, self.height)

if __name__ == '__main__':
    app = QApplication(sys.argv)

    window = RotateFrame(100)
    window.show()
    app.exec()
