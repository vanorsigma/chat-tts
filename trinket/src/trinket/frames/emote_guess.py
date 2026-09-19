"""
Guess 7tv emotes
"""

import logging
import random
import sys

from PyQt6.QtCore import Qt, QByteArray, QBuffer
from PyQt6.QtGui import QImage, QPixmap, QMovie
from PyQt6.QtWidgets import QApplication, QLabel, QLayout, QVBoxLayout
from trinket.frames.shared import (
    CloseSignalableWidget,
    GuessTextEdit,
    get_emote_cache,
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
        logger.info("Emoji spawned for %s", correct_name)

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
    Chooses random 7TV Emotes from the Emote Set, fetches only their images,
    then creates an Emote Window for each.
    """
    if seed is not None:
        random.seed(seed)

    cache = get_emote_cache(emote_set_id)
    chosen = cache.sample(no_windows)
    ready = {emote.url: emote for emote in cache.fetch_many(chosen)}

    return [
        EmoteWindow(emote.name, ready[emote.url].data, ready[emote.url].animated)
        for emote in chosen
        if emote.url in ready
    ]


if __name__ == "__main__":
    TESTING_EMOTE_SET = "01J452JCVG0000352W25T9VEND"
    app = QApplication(sys.argv)

    windows = create_emote_window_from_emote_set_id(TESTING_EMOTE_SET, 10)
    for window in windows:
        window.show()

    sys.exit(app.exec())
