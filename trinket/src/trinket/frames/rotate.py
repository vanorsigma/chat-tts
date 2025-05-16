"""
A frame for the rotation effect.

Takes a screenshot of the current screen, then rotates it.
"""

import sys

from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QGuiApplication, QTransform
from PyQt6.QtWidgets import QApplication, QLabel
from PyQt6.QtOpenGLWidgets import QOpenGLWidget


class RotateFrame(QOpenGLWidget): # pylint: disable=too-few-public-methods,too-many-instance-attributes
    """
    The frame that will perform the rotation
    """

    def __init__(self, speed: int):
        super().__init__()
        self.speed = speed
        self.completed = False
        self.angle = 0
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

        self.angle_timer = QTimer()
        self.angle_timer.timeout.connect(self.update_angle)
        self.angle_timer.start(int(1000 / 60)) # 60fps rotations

    def update_angle(self): # pylint: disable=missing-function-docstring
        self.angle = self.angle + self.speed * 0.1
        if self.angle >= 360:
            self.completed = True
            self.angle_timer.stop()
            self.close()
            return
        self.update()

    def paintEvent(self, _event): # pylint: disable=invalid-name,missing-function-docstring
        transform = QTransform()
        transform.rotate(self.angle)

        rotated_pixmap = self.shot_pixmap.transformed(transform)

        self.label.setPixmap(rotated_pixmap)
        self.label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.label.setGeometry(0, 0, self.width, self.height)

if __name__ == '__main__':
    app = QApplication(sys.argv)

    window = RotateFrame(100)
    window.show()
    app.exec()
