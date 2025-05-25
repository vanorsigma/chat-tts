"""
Shared Components
"""

import cachetools.func
import urllib
import json

from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin
from PyQt6.QtWidgets import QTextEdit, QWidget
from PyQt6.QtGui import QCloseEvent
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtOpenGLWidgets import QOpenGLWidget

class CloseSignalableWidget(QWidget): # pylint: disable=too-few-public-methods
    """
    A QWidget that emites a closed signal. It also actually closes
    QWidget and calls the default behavior
    """
    closed = pyqtSignal(QWidget)
    def closeEvent(self, event: QCloseEvent) -> None: # pylint: disable=invalid-name,missing-function-docstring
        self.closed.emit(self)
        self.close()
        event.accept()
        super().closeEvent(event)

class CloseSignalableOpenGLWidget(QOpenGLWidget): # pylint: disable=too-few-public-methods
    """
    An QOpenGLWidget that emites a closed signal. It also actually closes
    QWidget and calls the default behavior
    """
    closed = pyqtSignal(QWidget)
    def closeEvent(self, event: QCloseEvent) -> None: # pylint: disable=invalid-name,missing-function-docstring
        self.closed.emit(self)
        self.close()
        event.accept()
        super().closeEvent(event)

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
    headers = \
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36' # pylint: disable=line-too-long

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
        request = urllib.request.Request(
            url=self.url,
            data=json.dumps({'query': self.query}).encode(),
            headers={
                'User-Agent': self.headers
            }
        )
        with urllib.request.urlopen(request) as response:
            raw_data = response.read()
            raw_data_as_json = json.loads(raw_data)

            raw_emotes = [SevenTVRawEmote.from_dict(raw_emote)
                          for raw_emote in raw_data_as_json['data']['emoteSet']['emotes']]
            return self.__transform_emotes(raw_emotes)

@cachetools.func.ttl_cache(1, ttl=3600)
def get_emotes_from_emote_set_id(emote_set_id: str) -> list[SevenTVEmoteData]:
    """
    Cached method to get emote set IDs.
    """
    api = SevenTVAPI(emote_set_id)
    return api.get_emotes()
