"""
Guess songs in the song folder
"""

import logging
import os
import random
import sys

from PyQt6.QtCore import Qt, QUrl, pyqtSignal
from PyQt6.QtMultimedia import QAudioOutput, QMediaPlayer
from PyQt6.QtWidgets import QApplication, QLayout, QPushButton, QVBoxLayout
from trinket.frames.shared import (
    CloseSignalableWidget,
    GuessTextEdit,
    RESOURCES_DIR,
    place_randomly,
)

RESOURCES_SONG_PATH = str(RESOURCES_DIR / "songs")

logger = logging.getLogger(__name__)


class SongWindow(CloseSignalableWidget):  # pylint: disable=too-few-public-methods
    """
    The Song Window, pepega
    """

    playing_signal = pyqtSignal(bool)

    def __init__(self, song_path: str):
        super().__init__()

        self.playing = False

        self.song_name = os.path.splitext(song_path)[0].replace("_", " ")
        self.setWindowTitle("SongGuess")
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )
        self.layout = QVBoxLayout(self)

        self.play_button = QPushButton("\u25b6")
        self.play_button.clicked.connect(self._btn_clicked)
        self.layout.addWidget(self.play_button)

        self.text_edit = GuessTextEdit(self, correct_name=self.song_name)
        self.text_edit.setFixedHeight(30)
        self.text_edit.setPlaceholderText("Guess")
        self.text_edit.matched.connect(self._on_match)
        self.layout.addWidget(self.text_edit)

        self.media_player = QMediaPlayer()
        self.audio_output = QAudioOutput()
        self.media_player.setAudioOutput(self.audio_output)
        self.media_player.setSource(
            QUrl.fromLocalFile(f"{RESOURCES_SONG_PATH}/{song_path}")
        )
        self.media_player.setLoops(QMediaPlayer.Loops.Infinite)
        self.audio_output.setVolume(0.5)

        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        place_randomly(self)

    def close(self) -> None:
        self.media_player.stop()
        super().close()

    def _btn_clicked(self) -> None:
        if not self.playing:
            self.play_button.setText("\u23f8")
            self.media_player.play()
            self.playing = True
        else:
            self.play_button.setText("\u25b6")
            self.media_player.pause()
            self.playing = False

        self.playing_signal.emit(self.playing)

    def _on_match(self) -> None:
        self.media_player.pause()
        self.playing_signal.emit(False)
        self.close()


def make_song_windows(no_windows: int, seed: int | None = None) -> list[SongWindow]:
    """
    Creates song windows from the songs in the resources folder
    """
    if seed is not None:
        random.seed(seed)

    ws = []
    for _ in range(no_windows):
        song_path = random.choice(os.listdir(RESOURCES_SONG_PATH))
        ws.append(SongWindow(song_path))
    return ws


if __name__ == "__main__":
    app = QApplication(sys.argv)

    windows = make_song_windows(1)
    for w in windows:
        w.show()

    app.exec()
