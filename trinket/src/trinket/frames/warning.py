"""
The warning full-screen frames
"""

import logging
import sys
from enum import Enum

from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QGuiApplication, QImage, QPixmap, QCloseEvent
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from PyQt6.QtWidgets import QApplication, QLabel, QWidget

from trinket.frames.shared import RESOURCES_DIR

logger = logging.getLogger(__name__)

_LEVEL_RESOURCES = {
    1: ("first_trumpet.png", "first_trumpet.m4a"),
    2: ("second_trumpet.png", "second_trumpet.m4a"),
    3: ("third_trumpet.png", "third_trumpet.m4a"),
    4: ("fourth_trumpet.png", "fourth_trumpet.m4a"),
}


class WarningLevel(Enum):
    FIRST = 1
    SECOND = 2
    THIRD = 3
    FOURTH = 4


class WarningFrame(QWidget):  # pylint: disable=too-few-public-methods
    """
    A Lobotomy Corporation inspired warning frame
    (No I'm not addicted to the game)
    """

    def __init__(self):
        super().__init__()
        self.playing_ref_count = 0
        self.windows: list[QWidget] = []
        self.setWindowTitle("Thingy")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        screen = QGuiApplication.primaryScreen()
        self.screen_width = screen.size().width()
        self.screen_height = screen.size().height()
        self.setGeometry(0, 0, self.screen_width, self.screen_height)

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
        img_name, audio_name = _LEVEL_RESOURCES[level.value]
        self.image.load(str(RESOURCES_DIR / img_name))
        self.media_player.setSource(QUrl.fromLocalFile(str(RESOURCES_DIR / audio_name)))

        self.image = self.image.scaled(self.screen_width, self.screen_height)
        self.media_player.setLoops(QMediaPlayer.Loops.Infinite)
        self.audio_output.setVolume(0.1)
        self.label.setPixmap(QPixmap(self.image))

    def closeEvent(self, event: QCloseEvent) -> None:
        event.accept()
        super().closeEvent(event)

    def add_frame(self, widget: QWidget) -> None:
        """
        Adds a child frame to this warning. If the child frame has a
        "playing_signal" attribute (a pyqtSignal(bool)), it will be
        wired to pause/resume the warning's audio player.
        """
        widget.setParent(self)
        self.windows.append(widget)
        widget.closed.connect(self._on_closed)

        playing_signal = getattr(widget, "playing_signal", None)
        if playing_signal is not None:
            playing_signal.connect(self._on_playing_changed)

    def show(self) -> None:
        super().show()
        for w in self.windows:
            w.show()
        self.media_player.play()
        QApplication.instance().installEventFilter(self)

    def close(self) -> None:
        QApplication.instance().removeEventFilter(self)
        for w in list(self.windows):
            w.closed.disconnect()
            w.close()

        self.windows = []
        self.playing_ref_count = 0
        self.media_player.stop()
        super().close()

    def eventFilter(self, obj, event) -> bool:
        if event.type() == event.Type.KeyPress and event.key() == Qt.Key.Key_Escape:
            self.close()
            return True
        return super().eventFilter(obj, event)

    def _on_playing_changed(self, playing: bool):
        self.playing_ref_count = max(0, self.playing_ref_count + (1 if playing else -1))
        if self.playing_ref_count > 0:
            self.media_player.pause()
        else:
            self.media_player.play()

    def _on_closed(self, widget: QWidget):
        logger.debug("closing %s", widget)
        self.windows.remove(widget)
        if len(self.windows) == 0:
            self.media_player.stop()
            self.close()


if __name__ == "__main__":
    app = QApplication(sys.argv)

    window = WarningFrame()
    window.show()
    app.exec()
