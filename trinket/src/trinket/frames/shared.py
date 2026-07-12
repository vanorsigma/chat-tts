"""
Shared Components
"""

import cachetools.func
import json
import logging
import random
import urllib
from pathlib import Path
from typing import Protocol

from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QCloseEvent, QColor, QTextCharFormat, QTextCursor
from PyQt6.QtOpenGLWidgets import QOpenGLWidget
from PyQt6.QtWidgets import QApplication, QTextEdit, QWidget

HEADERS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36"

RESOURCES_DIR = Path(__file__).resolve().parent.parent / "resources"

logger = logging.getLogger(__name__)


class PlayableFrame(Protocol):
    playing_signal: pyqtSignal

    def close(self) -> None: ...


class CloseSignalMixin:
    """
    Mixin that emits a closed signal on closeEvent.
    Must be used with a QWidget subclass.
    """

    closed = pyqtSignal(QWidget)

    def closeEvent(self, event: QCloseEvent) -> None:
        self.closed.emit(self)  # type: ignore[attr-defined]
        event.accept()
        super().closeEvent(event)  # type: ignore[misc]


class CloseSignalableWidget(
    CloseSignalMixin, QWidget
):  # pylint: disable=too-few-public-methods
    """
    A QWidget that emits a closed signal on close.
    """


class CloseSignalableOpenGLWidget(
    CloseSignalMixin, QOpenGLWidget
):  # pylint: disable=too-few-public-methods
    """
    A QOpenGLWidget that emits a closed signal on close.
    """


def place_randomly(widget: QWidget, width: int = 300, height: int = 300) -> None:
    screen = QApplication.screens()[0].size()
    widget.setGeometry(
        random.randint(0, max(0, screen.width() - width)),
        random.randint(0, max(0, screen.height() - height)),
        width,
        height,
    )


# pylint: disable=too-few-public-methods
class SingleLineTextEdit(QTextEdit):
    """
    A QTextEdit that only allows one line of text.
    """

    def keyPressEvent(self, event) -> None:  # pylint: disable=invalid-name
        if event.key() == Qt.Key.Key_Return:
            event.ignore()
        else:
            super().keyPressEvent(event)

    def insertFromMimeData(self, source) -> None:  # pylint: disable=invalid-name
        if source.hasText():
            text = source.text().replace("\n", "").replace("\r", "")
            cursor = self.textCursor()
            cursor.insertText(text)
        else:
            super().insertFromMimeData(source)


class GuessTextEdit(SingleLineTextEdit):
    """
    A single-line text edit that colors each character green/red
    against the correct answer and emits matched on a full match.
    """

    matched = pyqtSignal()

    def __init__(self, parent=None, correct_name: str = ""):
        super().__init__(parent)
        self._correct_name = correct_name
        self.textChanged.connect(self._text_edit_changed)

    def set_correct_name(self, name: str) -> None:
        self._correct_name = name

    def _text_edit_changed(self) -> None:
        self.blockSignals(True)

        correct = self._correct_name.lower()
        inputted = self.toPlainText().lower()
        if correct == inputted:
            self.blockSignals(False)
            self.matched.emit()
            self.blockSignals(True)

        restore = self.textCursor()

        for i, (c1, c2) in enumerate(zip(correct, inputted)):
            cursor = self.textCursor()
            cursor.setPosition(i)
            cursor.setPosition(i + 1, QTextCursor.MoveMode.KeepAnchor)

            color = QColor("green") if c1 == c2 else QColor("red")

            font_format = QTextCharFormat()
            font_format.setForeground(color)

            cursor.setCharFormat(font_format)
            cursor.clearSelection()
            self.setTextCursor(cursor)

        self.setTextCursor(restore)
        self.blockSignals(False)


@dataclass
class SevenTVRawEmoteData(DataClassJsonMixin):
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
class SevenTVRawEmote(DataClassJsonMixin):
    name: str
    data: SevenTVRawEmoteData


class SevenTVAPI:  # pylint: disable=too-few-public-methods
    """
    Gets emote set via 7TV API
    """

    url = "https://7tv.io/v3/gql"
    query_template = (
        'query { emoteSet(id: "%s") { emotes { name, data { id, animated } } } }'
    )

    def __init__(self, emote_set_id: str):
        self.query = self.query_template % (emote_set_id,)

    def __make_emote_url(self, emote_id: str, animated: bool) -> str:
        return (
            f'https://cdn.7tv.app/emote/{emote_id}/{"4x.gif" if animated else "4x.png"}'
        )

    def __transform_emotes(
        self, raw_emotes: list[SevenTVRawEmote]
    ) -> list[SevenTVEmoteData]:
        return [
            SevenTVEmoteData(
                name=emote.name,
                url=self.__make_emote_url(emote.data.id, emote.data.animated),
                animated=emote.data.animated,
            )
            for emote in raw_emotes
        ]

    def get_emotes(self) -> list[SevenTVEmoteData]:
        """
        Get the emotes from the 7TV API
        """
        request = urllib.request.Request(
            url=self.url,
            data=json.dumps({"query": self.query}).encode(),
            headers={"User-Agent": HEADERS},
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                raw_data = response.read()
                raw_data_as_json = json.loads(raw_data)

                raw_emotes = [
                    SevenTVRawEmote.from_dict(raw_emote)
                    for raw_emote in raw_data_as_json["data"]["emoteSet"]["emotes"]
                ]
                return self.__transform_emotes(raw_emotes)
        except (urllib.error.URLError, json.JSONDecodeError, KeyError) as e:
            raise RuntimeError(f"Failed to fetch 7TV emote set: {e}") from e


@cachetools.func.ttl_cache(1, ttl=3600)
def get_emotes_from_emote_set_id(emote_set_id: str) -> list[SevenTVEmoteData]:
    """
    Cached method to get emote set IDs.
    """
    api = SevenTVAPI(emote_set_id)
    return api.get_emotes()
