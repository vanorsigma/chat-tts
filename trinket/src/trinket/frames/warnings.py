"""
The warning full-screen frames
"""

import sys
from enum import Enum

from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QGuiApplication, QImage, QPixmap
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from PyQt6.QtWidgets import QApplication, QLabel, QWidget

from trinket.frames.emote_guess import create_emote_window_from_emote_set_id


class WarningLevel(Enum): # pylint: disable=missing-class-docstring
    FIRST = 1
    SECOND = 2
    THIRD = 3

class WarningFrame(QWidget): # pylint: disable=too-few-public-methods
    """
    A Lobotomy Corporation inspired warning frame
    (No I'm not addicted to the game)
    """

    def __init__(self, level: WarningLevel):
        super().__init__()
        self.setWindowTitle("Thingy")
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        screen = QGuiApplication.primaryScreen()
        width = screen.size().width()
        height = screen.size().height()
        self.setGeometry(0, 0, width, height)

        self.image = QImage()
        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)

        match level:
            case WarningLevel.FIRST:
                self.image.load("resources/first_trumpet.png")
                self.media_player.setSource(QUrl.fromLocalFile("resources/first_trumpet.m4a"))
            case WarningLevel.SECOND:
                self.image.load("resources/second_trumpet.png")
                self.media_player.setSource(QUrl.fromLocalFile("resources/second_trumpet.m4a"))
            case WarningLevel.THIRD:
                self.image.load("resources/third_trumpet.png")
                self.media_player.setSource(QUrl.fromLocalFile("resources/third_trumpet.m4a"))

        self.image = self.image.scaled(width, height)
        self.media_player.setLoops(QMediaPlayer.Loops.Infinite)
        self.media_player.play()

        self.label = QLabel(self)
        self.label.setPixmap(QPixmap(self.image))

if __name__ == '__main__':
    app = QApplication(sys.argv)

    window = WarningFrame(WarningLevel.THIRD)
    window.show()
    app.exec()
