"""
Guess 7tv emotes
"""

import logging
import random
import sys
import urllib.request

from PyQt6.QtCore import Qt, QByteArray, QBuffer
from PyQt6.QtGui import QImage, QPixmap, QMovie
from PyQt6.QtWidgets import QApplication, QLabel, QLayout, QVBoxLayout
from trinket.frames.shared import (
    CloseSignalableWidget,
    GuessTextEdit,
    HEADERS,
    SevenTVEmoteData,
    get_emotes_from_emote_set_id,
    place_randomly,
)

logger = logging.getLogger(__name__)

# pylint: disable=too-few-public-methods, too-many-instance-attributes
class EmoteWindow(CloseSignalableWidget):
    """
    The Emote Window.
    """

    def __init__(
        self,
        correct_name: str,
        image_bytes: bytes,
        animated: bool = False,
        seed: int | None = None,
    ) -> None:
        super().__init__()

        if seed is not None:
            random.seed(seed)

        self.correct_name = correct_name
        logger.info(f"Emoji spawned for {correct_name}")

        self.setWindowTitle("EmoteGuess")
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )
        self.layout = QVBoxLayout(self)

        self.label = QLabel(self)
        self.layout.addWidget(self.label)

        if animated:
            self.bytearray = QByteArray(image_bytes)
            self.buffer = QBuffer(self.bytearray)
            self.buffer.open(QBuffer.OpenModeFlag.ReadOnly)

            self.movie = QMovie()
            self.movie.setDevice(self.buffer)
            self.movie.start()
            self.label.setMovie(self.movie)
        else:
            self.image = QImage()
            self.image.loadFromData(image_bytes)
            self.label.setPixmap(QPixmap(self.image))

        self.text_edit = GuessTextEdit(self, correct_name=correct_name)
        self.text_edit.setFixedHeight(30)
        self.text_edit.setPlaceholderText("Guess")
        self.text_edit.matched.connect(self.close)

        self.layout.addWidget(self.text_edit)
        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        place_randomly(self)


def create_emote_window_from_emote_set_id(
    emote_set_id: str, no_windows: int, seed: int | None = None
) -> list[EmoteWindow]:
    """
    Chooses a random 7TV Emote from the Emote Set, then creates an Emote Window.
    """
    if seed is not None:
        random.seed(seed)

    emotes = get_emotes_from_emote_set_id(emote_set_id)
    window_references = []
    for _ in range(no_windows):
        emote = random.choice(emotes)
        request = urllib.request.Request(
            url=emote.url, data=None, headers={"User-Agent": HEADERS}
        )
        with urllib.request.urlopen(request) as response:
            returned_bytes: bytes = response.read()
        window_references.append(
            EmoteWindow(emote.name, returned_bytes, emote.animated)
        )

    return window_references


if __name__ == "__main__":
    TESTING_EMOTE_SET = "01J452JCVG0000352W25T9VEND"
    app = QApplication(sys.argv)

    windows = create_emote_window_from_emote_set_id(TESTING_EMOTE_SET, 10)
    for window in windows:
        window.show()

    sys.exit(app.exec())
