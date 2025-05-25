"""
Guess 7tv emotes
"""
import urllib.request
import json
import sys
import random
from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin

from PyQt6.QtWidgets import QApplication, QLabel, QVBoxLayout, QLayout
from PyQt6.QtCore import Qt, QByteArray, QBuffer
from PyQt6.QtGui import QImage, QPixmap, QMovie, QTextCursor, QTextCharFormat, QColor
from trinket.frames.shared import SingleLineTextEdit, CloseSignalableWidget, SevenTVAPI, SevenTVEmoteData, \
    get_emotes_from_emote_set_id

HEADERS = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36'

# pylint: disable=too-few-public-methods, too-many-instance-attributes
class EmoteWindow(CloseSignalableWidget):
    """
    The Emote Window.
    """
    def __init__(self, correct_name: str,
                 image_bytes: bytes,
                 animated: bool = False,
                 seed: int | None = None) -> None:
        super().__init__()

        if seed is not None:
            random.seed(seed)

        self.correct_name = correct_name

        self.setWindowTitle('EmoteGuess')
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)
        self.layout = QVBoxLayout(self)

        self.label = QLabel(self)
        self.layout.addWidget(self.label)

        if animated:
            # constructed this way for refcount reasons
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

        self.text_edit = SingleLineTextEdit(self)
        self.text_edit.setFixedHeight(30)
        self.text_edit.setPlaceholderText('Guess')
        self.text_edit.textChanged.connect(self.__text_edit_changed)


        self.layout.addWidget(self.text_edit)
        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        screen = QApplication.screens()[0].size()
        self.setGeometry(random.randint(0, screen.width() - 300),
                         random.randint(0, screen.height() - 300),
                         300, 300)

    def __text_edit_changed(self) -> None:
        self.text_edit.blockSignals(True)

        correct = self.correct_name.lower()
        inputted = self.text_edit.toPlainText().lower()
        if correct == inputted:
            self.close()

        restore = self.text_edit.textCursor()

        for i, (c1, c2) in enumerate(zip(correct, inputted)):
            cursor = self.text_edit.textCursor()
            cursor.setPosition(i)
            cursor.setPosition(i + 1, QTextCursor.MoveMode.KeepAnchor)

            color = QColor('green') if c1 == c2 else QColor('red')

            font_format = QTextCharFormat()
            font_format.setForeground(color)

            cursor.setCharFormat(font_format)
            cursor.clearSelection()
            self.text_edit.setTextCursor(cursor)

        self.text_edit.setTextCursor(restore)
        self.text_edit.blockSignals(False)


def create_emote_window_from_emote_set_id(emote_set_id: str,
                                          no_windows: int,
                                          seed: int | None = None) -> list[EmoteWindow]:
    """
    Chooses a random 7TV Emote from the Emote Set, then creates an Emote Window.
    """
    if seed is not None:
        random.seed(seed)

    emotes = get_emotes_from_emote_set_id(emote_set_id)
    # NOTE: must do it this way so it doesn't get garbage collected
    window_references = []
    for _ in range(no_windows):
        idx = random.randint(0, len(emotes) - 1)
        request = urllib.request.Request(
            url=emotes[idx].url,
            data=None,
            headers={
                'User-Agent': HEADERS
            }
        )
        with urllib.request.urlopen(request) as response:
            returned_bytes: bytes = response.read()
        window_references.append(EmoteWindow(emotes[idx].name,
                                             returned_bytes, emotes[idx].animated))

    return window_references

if __name__ == '__main__':
    TESTING_EMOTE_SET = "01J452JCVG0000352W25T9VEND"
    app = QApplication(sys.argv)

    windows = create_emote_window_from_emote_set_id(TESTING_EMOTE_SET, 10)
    for window in windows:
        window.show()

    sys.exit(app.exec())
