"""
Brainrot Windows
"""

import urllib.request
import json
import sys
import random
import os
from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin

from PyQt6.QtWidgets import QApplication, QLabel, QVBoxLayout, QLayout, QProgressBar
from PyQt6.QtCore import Qt, QByteArray, QBuffer, QUrl, QTimer, QElapsedTimer
from PyQt6.QtGui import QImage, QPixmap, QMovie, QTextCursor, QTextCharFormat, QColor
from PyQt6.QtMultimedia import QMediaPlayer, QAudioOutput
from PyQt6.QtMultimediaWidgets import QVideoWidget
from trinket.frames.shared import (
    SingleLineTextEdit,
    CloseSignalableWidget,
    SevenTVAPI,
    SevenTVEmoteData,
    get_emotes_from_emote_set_id,
)

BRAINROT_FOLDER = "./resources/brainrot"
PROGRESS_BAR_STYLE = """
    QProgressBar {
        background-color: grey;
    }

    QProgressBar::chunk {
        background-color: blue;
        width: 20px;
    }
"""


# pylint: disable=too-few-public-methods, too-many-instance-attributes
class BrainrotFrame(CloseSignalableWidget):
    """
    The Emote Window.
    """

    def __init__(self, seed: int | None = None) -> None:
        super().__init__()

        if seed is not None:
            random.seed(seed)

        eligible_files = [p for p in os.listdir(BRAINROT_FOLDER)]
        chosen_file = random.choice(eligible_files)

        self.setWindowTitle("Brainrot")
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )

        self.layout = QVBoxLayout(self)

        media_path = os.path.join(BRAINROT_FOLDER, chosen_file)
        self.video_widget = QVideoWidget(self)
        self.media_player = QMediaPlayer(self)
        self.audio_output = QAudioOutput()
        self.media_player.setSource(QUrl.fromLocalFile(media_path))
        self.media_player.setVideoOutput(self.video_widget)
        self.media_player.setLoops(-1)
        self.media_player.play()
        self.layout.addWidget(self.video_widget)

        scalar = random.random()
        w = int(480 * scalar)
        h = int(640 * scalar)
        self.video_widget.resize(w, h)

        self.max_time = random.randint(10, 600)
        print(self.max_time)

        self.progress = QProgressBar()
        self.progress_value = self.max_time * 1000 + 1
        self.progress.setMaximum(self.max_time * 1000)
        self.progress.setMinimum(0)
        self.progress.setValue(
            self.progress_value
        )  # HACK: make progress do something once
        self.progress.setTextVisible(False)
        self.progress.setStyleSheet(PROGRESS_BAR_STYLE)
        self.layout.addWidget(self.progress)

        self.elapsed = QElapsedTimer()
        self.elapsed.start()
        self.last_time = self.elapsed.elapsed()

        self.timer = QTimer()
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self.__timer_callback)
        self.timer.start()

        self.setLayout(self.layout)
        # self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        self.resize(w, h + 30)
        screen = QApplication.screens()[0].size()
        self.move(
            random.randint(0, screen.width() - 300),
            random.randint(0, screen.height() - 300),
        )

    def __timer_callback(self):
        elapsed = self.elapsed.elapsed() - self.last_time
        print(self.progress_value, elapsed)
        self.progress_value = self.progress_value - elapsed
        self.progress.setValue(self.progress_value)
        self.last_time = self.elapsed.elapsed()

        if self.progress_value <= 0:
            self.media_player.pause()
            self.close()


if __name__ == "__main__":
    app = QApplication(sys.argv)

    brainrot = BrainrotFrame()
    brainrot.show()

    app.exec()
