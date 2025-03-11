"""
Guess 7tv emotes
"""
import urllib.request
import json
import sys
import random
from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin

from PyQt6.QtWidgets import QApplication, QWidget, QLabel, QLineEdit, QVBoxLayout, QLayout
from PyQt6.QtCore import Qt, QByteArray, QBuffer
from PyQt6.QtGui import QImage, QPixmap, QMovie

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

class EmoteWindow(QWidget):
    """
    The Emote Window.
    """
    def __init__(self, correct_name: str,
                 image_bytes: bytes, animated: bool = False) -> None:
        super().__init__()

        self.correct_name = correct_name

        self.setWindowTitle('Thingy')
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)
        # self.layout = QVBoxLayout(self)

        self.label = QLabel(self)
        # self.label.setSizePolicy(self.label.sizePolicy().horizontalPolicy().Expanding,
        #                          self.label.sizePolicy().verticalPolicy().Expanding)

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

        self.line_edit = QLineEdit(self)
        self.line_edit.setPlaceholderText('Guess')
        # self.line_edit.setInputMask('*')
        self.line_edit.returnPressed.connect(self.__line_edit_return)

        # self.setLayout(self.layout)
        # self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)
        self.setGeometry(100, 100, 300, 200)

    @staticmethod
    def __levenshtein_distance(str1: str, str2: str) -> None:
        # copied straight from geeks4geeks
        m = len(str1)
        n = len(str2)

        dp = [[0 for _ in range(n + 1)] for _ in range(m + 1)]

        for i in range(m + 1):
            dp[i][0] = i
        for j in range(n + 1):
            dp[0][j] = j

        for i in range(1, m + 1):
            for j in range(1, n + 1):
                if str1[i - 1] == str2[j - 1]:
                    dp[i][j] = dp[i - 1][j - 1]
                else:
                    dp[i][j] = 1 + min(dp[i][j - 1], dp[i - 1][j], dp[i - 1][j - 1])

        return dp[m][n]

    def __line_edit_return(self) -> None:
        correct = self.correct_name.lower()
        inputted = self.line_edit.text().lower()
        highest = max(len(correct), len(inputted))
        score = self.__levenshtein_distance(correct, inputted) / float(highest)

        if score < 0.1:
            self.close()


def create_emote_window_from_emote_set_id(emote_set_id: str,
                                          seed: int | None = None) -> EmoteWindow:
    """
    Chooses a random 7TV Emote from the Emote Set, then creates an Emote Window.
    """
    if seed is not None:
        random.seed(seed)

    api = SevenTVAPI(emote_set_id)
    emotes = api.get_emotes()
    idx = random.randint(0, len(emotes) - 1)
    with urllib.request.urlopen(emotes[idx].url) as response:
        returned_bytes: bytes = response.read()

    return EmoteWindow(emotes[idx].name, returned_bytes, emotes[idx].animated)

if __name__ == '__main__':
    TESTING_EMOTE_SET = "01J452JCVG0000352W25T9VEND"
    app = QApplication(sys.argv)

    # NOTE: must do it this way so it doesn't get garbage collected
    window = create_emote_window_from_emote_set_id(TESTING_EMOTE_SET)
    window.show()

    sys.exit(app.exec())
