"""
Guess 7tv emotes
"""
import urllib.request
import json
import sys
import random
from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin

from PyQt6.QtWidgets import QApplication, QWidget, QLabel, QVBoxLayout, QLayout, QTextEdit
from PyQt6.QtCore import Qt, QByteArray, QBuffer
from PyQt6.QtGui import QImage, QPixmap, QMovie, QTextCursor, QTextCharFormat, QColor

@dataclass
class SevenTVRawEmoteData(DataClassJsonMixin): # pylint: disable=missing-class-docstring
    id: str
    animated: bool

@dataclass
class SevenTVEmoteData:
    """
    The transformed version of the raw 7TV emote.
    If the raw suggested animated emotes, then .gif. Else, .png
    """
    name: str
    url: str
    animated: bool

@dataclass
class SevenTVRawEmote(DataClassJsonMixin): # pylint: disable=missing-class-docstring
    name: str
    data: SevenTVRawEmoteData

class SevenTVAPI: # pylint: disable=too-few-public-methods
    """
    Gets emote set via 7TV API
    """

    url = 'https://7tv.io/v3/gql'
    query_template = 'query { emoteSet(id: "%s") { emotes { name, data { id, animated } } } }'

    def __init__(self, emote_set_id: str):
        self.query = self.query_template % (emote_set_id,)

    def __make_emote_url(self, emote_id: str, animated: bool) -> str:
        return f'https://cdn.7tv.app/emote/{emote_id}/{"4x.gif" if animated else "4x.png"}'

    def __transform_emotes(self, raw_emotes: list[SevenTVRawEmote]) -> list[SevenTVEmoteData]:
        return [
            SevenTVEmoteData(name=emote.name,
                             url=self.__make_emote_url(emote.data.id, emote.data.animated),
                             animated=emote.data.animated)
            for emote in raw_emotes
        ]

    def get_emotes(self) -> list[SevenTVEmoteData]:
        """
        Get the emotes from the 7TV API
        """
        with urllib.request.urlopen(self.url,
                                    json.dumps({'query': self.query}).encode()) as response:
            raw_data = response.read()
            raw_data_as_json = json.loads(raw_data)

            raw_emotes = [SevenTVRawEmote.from_dict(raw_emote)
                          for raw_emote in raw_data_as_json['data']['emoteSet']['emotes']]
            return self.__transform_emotes(raw_emotes)

# pylint: disable=too-few-public-methods
class SingleLineTextEdit(QTextEdit):
    """
    A QTextEdit that only allows one line of text.
    """
    def keyPressEvent(self, event) -> None: # pylint: disable=invalid-name,missing-function-docstring
        if event.key() == Qt.Key.Key_Return:
            event.ignore()
        else:
            super().keyPressEvent(event)


# pylint: disable=too-few-public-methods, too-many-instance-attributes
class EmoteWindow(QWidget):
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
        x = random.randint(0, screen.width())
        y = random.randint(0, screen.height())

        self.setGeometry(random.randint(350, screen.width() - 350),
                         random.randint(350, screen.height() - 350),
                         300, 300)
        self.move(x, y)

    def __text_edit_changed(self) -> None:
        self.text_edit.blockSignals(True)

        correct = self.correct_name.lower()
        inputted = self.text_edit.toPlainText().lower()
        if correct == inputted:
            self.close()

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

        self.text_edit.blockSignals(False)



def create_emote_window_from_emote_set_id(emote_set_id: str,
                                          no_windows: int,
                                          seed: int | None = None) -> list[EmoteWindow]:
    """
    Chooses a random 7TV Emote from the Emote Set, then creates an Emote Window.
    """
    if seed is not None:
        random.seed(seed)

    api = SevenTVAPI(emote_set_id)
    emotes = api.get_emotes()
    # NOTE: must do it this way so it doesn't get garbage collected
    window_references = []
    for _ in range(no_windows):
        idx = random.randint(0, len(emotes) - 1)
        with urllib.request.urlopen(emotes[idx].url) as response:
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
