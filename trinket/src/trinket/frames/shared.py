"""
Shared Components
"""

import json
import logging
import random
import threading
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from dataclasses import dataclass
from dataclasses_json import DataClassJsonMixin
from PyQt6.QtCore import Qt, QSize, pyqtSignal
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


def place_randomly(widget: QWidget, bounds: QSize | None = None) -> None:
    """
    Put `widget` at random places within `bounds`. Defaults to the first screen.
    """
    area = bounds if bounds is not None else QApplication.screens()[0].size()
    size = widget.sizeHint()
    widget.move(
        random.randint(0, max(0, area.width() - size.width())),
        random.randint(0, max(0, area.height() - size.height())),
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
class CachedEmote:
    name: str
    url: str
    animated: bool
    data: bytes


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
            headers={"User-Agent": HEADERS, "Content-Type": "application/json"},
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


@lru_cache(maxsize=None)
def get_emotes_from_emote_set_id(emote_set_id: str) -> list[SevenTVEmoteData]:
    """
    Get an emote set once per process lifetime.
    """
    api = SevenTVAPI(emote_set_id)
    return api.get_emotes()


class EmoteImageCache:
    """
    A much better emote cache, complete with futures & thread parallelism.

    Although emote sets can theoretically hold hundreds of emotes, we
    realistically only ever use a handful of them at a time.
    """

    DOWNLOAD_TIMEOUT = 15
    MAX_WORKERS = 12
    PREFETCH_WORKERS = 4

    def __init__(self, emote_set_id: str) -> None:
        self.emote_set_id = emote_set_id
        self._emotes: list[SevenTVEmoteData] | None = None
        self._emotes_lock = threading.Lock()
        self._images: dict[str, CachedEmote] = {}
        self._inflight: dict[str, Future[CachedEmote | None]] = {}
        self._prefetch_queue: deque[SevenTVEmoteData] = deque()
        self._prefetch_inflight = 0
        self._images_lock = threading.Lock()
        self._pool = ThreadPoolExecutor(
            max_workers=self.MAX_WORKERS, thread_name_prefix="emote-fetch"
        )
        self._prefetch_pool = ThreadPoolExecutor(
            max_workers=self.PREFETCH_WORKERS, thread_name_prefix="emote-prefetch"
        )

    @property
    def emotes(self) -> list[SevenTVEmoteData]:
        with self._emotes_lock:
            if self._emotes is None:
                self._emotes = get_emotes_from_emote_set_id(self.emote_set_id)
            return self._emotes

    def sample(self, count: int) -> list[SevenTVEmoteData]:
        return random.choices(self.emotes, k=count)

    def sample_uncached(self, count: int) -> list[SevenTVEmoteData]:
        with self._images_lock:
            ready = set(self._images)
        remaining = [emote for emote in self.emotes if emote.url not in ready]
        return random.sample(remaining, k=min(count, len(remaining)))

    def cached(self) -> list[CachedEmote]:
        with self._images_lock:
            return list(self._images.values())

    def _download(self, emote: SevenTVEmoteData) -> CachedEmote | None:
        request = urllib.request.Request(
            url=emote.url, data=None, headers={"User-Agent": HEADERS}
        )
        try:
            with urllib.request.urlopen(
                request, timeout=self.DOWNLOAD_TIMEOUT
            ) as response:
                data = response.read()
        except (urllib.error.URLError, OSError) as exc:
            logger.warning("Failed to prefetch emote %s: %s", emote.name, exc)
            return None

        return CachedEmote(
            name=emote.name, url=emote.url, animated=emote.animated, data=data
        )

    def _resolve(self, emote: SevenTVEmoteData) -> CachedEmote | None:
        """Download an emote and retain it. Runs on a worker thread."""
        result = self._download(emote)
        with self._images_lock:
            self._inflight.pop(emote.url, None)
            if result is not None:
                self._images[emote.url] = result
        return result

    def _future(self, emote: SevenTVEmoteData) -> Future[CachedEmote | None]:
        with self._images_lock:
            cached = self._images.get(emote.url)
            if cached is not None:
                done: Future[CachedEmote | None] = Future()
                done.set_result(cached)
                return done

            inflight = self._inflight.get(emote.url)
            if inflight is not None:
                return inflight

            future = self._pool.submit(self._resolve, emote)
            self._inflight[emote.url] = future
            return future

    def fetch(self, emote: SevenTVEmoteData) -> CachedEmote | None:
        return self._future(emote).result()

    def fetch_many(self, emotes: list[SevenTVEmoteData]) -> list[CachedEmote]:
        results = {emote.url: self._future(emote) for emote in emotes}
        resolved = {url: future.result() for url, future in results.items()}
        return [
            cached for emote in emotes if (cached := resolved[emote.url]) is not None
        ]

    def prefetch(self, emotes: list[SevenTVEmoteData]) -> None:
        with self._images_lock:
            self._prefetch_queue.extend(
                emote for emote in emotes if emote.url not in self._images
            )
            self._drain_prefetch()

    def _drain_prefetch(self) -> None:
        while self._prefetch_queue and self._prefetch_inflight < self.PREFETCH_WORKERS:
            emote = self._prefetch_queue.popleft()
            if emote.url in self._images or emote.url in self._inflight:
                continue
            self._prefetch_inflight += 1
            future = self._prefetch_pool.submit(self._resolve_prefetch, emote)
            self._inflight[emote.url] = future

    def _resolve_prefetch(self, emote: SevenTVEmoteData) -> CachedEmote | None:
        try:
            return self._resolve(emote)
        finally:
            with self._images_lock:
                self._prefetch_inflight -= 1
                self._drain_prefetch()


@lru_cache(maxsize=None)
def get_emote_cache(emote_set_id: str) -> EmoteImageCache:
    return EmoteImageCache(emote_set_id)
