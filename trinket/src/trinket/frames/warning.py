"""
The warning full-screen frames
"""

import sys
from enum import Enum

from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QGuiApplication, QImage, QPixmap, QCloseEvent
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from PyQt6.QtWidgets import QApplication, QLabel, QWidget


class WarningLevel(Enum): # pylint: disable=missing-class-docstring
    FIRST = 1
    SECOND = 2
    THIRD = 3
    FOURTH = 4

class WarningFrame(QWidget): # pylint: disable=too-few-public-methods
    """
    A Lobotomy Corporation inspired warning frame
    (No I'm not addicted to the game)
    """

    def __init__(self):
        super().__init__()
        self.playing_ref_count = 0
        self.windows: list[QWidget] = []
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

        self.label = QLabel(self)
        self.set_warning_level(WarningLevel.FIRST)

    def is_completed(self):
        """
        Checks if the current warning is complete
        """
        return not self.isVisible()

    def set_warning_level(self, level: WarningLevel) -> None:
        """
        Sets the warning level of the current warning
        """
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
            case WarningLevel.FOURTH:
                self.image.load("resources/fourth_trumpet.png")
                self.media_player.setSource(QUrl.fromLocalFile("resources/fourth_trumpet.m4a"))

        screen = QGuiApplication.primaryScreen()
        width = screen.size().width()
        height = screen.size().height()
        self.image = self.image.scaled(width, height)
        self.media_player.setLoops(QMediaPlayer.Loops.Infinite)
        self.audio_output.setVolume(0.1)
        self.label.setPixmap(QPixmap(self.image))

    def closeEvent(self, event: QCloseEvent) -> None: # pylint: disable=invalid-name,missing-function-docstring
        self.close()
        event.accept()

    def add_frame(self, widget: QWidget) -> None:
        """
        Adds a child frame to this warning. If the child frame as a
        "playing_signal", it should work in tandem with the warning's
        audio player as well
        """
        widget.setParent(self)
        self.windows.append(widget)
        widget.closed.connect(self.__on_closed)

        if hasattr(widget, 'playing_signal'):
            widget.playing_signal.connect(self.__on_playing_changed)

    def show(self) -> None: # pylint: disable=missing-function-docstring
        super().show()
        for w in self.windows:
            w.show()
        self.media_player.play()

    def close(self) -> None: # pylint: disable=missing-function-docstring
        for w in self.windows:
            w.closed.disconnect()
            w.close()

        self.windows = []
        self.playing_ref_count = 0
        self.media_player.stop()
        super().close()

    def __on_playing_changed(self, playing: bool):
        self.playing_ref_count += 1 if playing else -1
        if self.playing_ref_count > 0:
            self.media_player.pause()
        else:
            self.media_player.play()

    def __on_closed(self, widget: QWidget):
        print(f'closing {widget}')
        self.windows.remove(widget)
        if len(self.windows) == 0:
            self.media_player.stop()
            self.close()

if __name__ == '__main__':
    app = QApplication(sys.argv)

    window = WarningFrame(WarningLevel.THIRD)
    window.show()
    app.exec()
