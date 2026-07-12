"""
A possible sub-frame of the warning frame
"""

import logging
import os
import random
import urllib
from queue import Empty, Queue
from threading import Thread
from typing import Callable

from irc.client import Event, Reactor, ServerConnection, ServerConnectionError
from PyQt6.QtCore import Qt, QTimer, QByteArray, QBuffer, QSize
from PyQt6.QtGui import QImage, QMovie, QPixmap
from PyQt6.QtWidgets import QApplication, QLabel, QLayout, QProgressBar, QVBoxLayout
from trinket.frames.shared import (
    CloseSignalableOpenGLWidget,
    HEADERS,
    RESOURCES_DIR,
    SevenTVEmoteData,
    get_emotes_from_emote_set_id,
    place_randomly,
)
from trinket.receiver.console import register_chat_listener, unregister_chat_listener

BOSS_SPRITE = str(RESOURCES_DIR / "sbird.gif")

logger = logging.getLogger(__name__)


class TwitchIRCKeywordListener:
    def __init__(
        self, channel: str, keyword: str, callback: Callable[[str], None]
    ) -> None:
        self.channel = channel
        self.callback = callback
        self.keyword = keyword
        self.reactor = Reactor()
        self.disconnected = False

        try:
            self.c: ServerConnection = self.reactor.server().connect(
                "irc.chat.twitch.tv", 6667, "justinfan123"
            )
        except ServerConnectionError as e:
            raise RuntimeError(f"Failed to connect to Twitch IRC: {e}") from e

        self.c.add_global_handler("welcome", self.on_connect)
        self.c.add_global_handler("join", self.on_join)
        self.c.add_global_handler("disconnect", self.on_disconnect)
        self.c.add_global_handler("all_events", self.on_event)

    def set_keyword(self, keyword: str) -> None:
        self.keyword = keyword

    def run_forever_until_disconnected(self):
        while self.c.is_connected():
            self.reactor.process_once(timeout=1)

    def disconnect(self):
        self.c.disconnect()
        self.c.close()

    def on_connect(self, connection, event):
        logger.info("Connected to twitch, joining channel")
        self.c.join(f"#{self.channel}")

    def on_event(self, connection: ServerConnection, event: Event):
        if event.type != "pubmsg":
            return
        message = event.arguments[0]
        if self.keyword in message:
            self.callback(message)

    def on_disconnect(self, connection: ServerConnection, event: Event):
        logger.info("Disconnected from twitch")

    def on_join(self, connection: ServerConnection, event: Event):
        logger.info("Listening to channel %s", self.channel)


class EmoteRenderer:
    def __init__(self, emote_labels: list[QLabel]):
        self._labels = emote_labels
        self.emote_pictures: list[QImage] = [QImage() for _ in emote_labels]
        self._other_references: list[tuple | None] = [None] * len(emote_labels)

    def render(self, emote_data: tuple[str, bool, bytes], idx: int) -> None:
        _name, animated, data = emote_data
        label = self._labels[idx]

        if animated:
            bytearray = QByteArray(data)
            buffer = QBuffer(bytearray)
            buffer.open(QBuffer.OpenModeFlag.ReadOnly)

            movie = QMovie()
            movie.setDevice(buffer)
            movie.start()
            aspect_ratio = movie.scaledSize().height() / movie.scaledSize().width()
            movie.setScaledSize(QSize(50, int(50 * aspect_ratio)))
            label.setMovie(movie)

            self._other_references[idx] = (bytearray, buffer, movie)
        else:
            picture = QImage()
            picture.loadFromData(data)
            picture = picture.scaledToWidth(50)
            label.setPixmap(QPixmap(picture))
            self.emote_pictures[idx] = picture


class BossMovement:
    def __init__(self):
        screen = QApplication.screens()[0].size()
        self.target_pos = (
            random.randint(0, screen.width() - 300),
            random.randint(0, screen.height() - 300),
        )

    def step(self, x: int, y: int) -> tuple[int, int]:
        t_x, t_y = self.target_pos
        if (t_x, t_y) == (x, y):
            screen = QApplication.screens()[0].size()
            self.target_pos = (
                random.randint(0, screen.width() - 300),
                random.randint(0, screen.height() - 300),
            )

        d_x = max(-20, min(t_x - x, 20))
        d_y = max(-20, min(t_y - y, 20))
        return d_x, d_y


# pylint: disable=too-many-instance-attributes
class BossFightFrame(CloseSignalableOpenGLWidget):
    """
    A boss fight.

    To deal damage, chatters must find the keyword.
    """

    PROGRESS_BAR_STYLE = """
    QProgressBar {
        background-color: grey;
    }

    QProgressBar::chunk {
        background-color: red;
        width: 20px;
    }
    """

    EMOTE_QUEUE = 4

    def __init__(
        self, channel_name: str, max_health: int, emotes: list[SevenTVEmoteData]
    ):
        super().__init__()
        self.emotes = emotes
        self.current_emotes = [
            self.choose_random_emote() for _ in range(self.EMOTE_QUEUE)
        ]

        self.health = max_health
        if os.environ.get("TRINKET_DEV_MODE"):
            self.irc = None
            self.irc_thread = None
            register_chat_listener(self._dev_chat_callback)
        else:
            self.irc = TwitchIRCKeywordListener(
                channel_name, self.current_emotes[0][0], self.irc_message_callback
            )
            self.irc_thread = Thread(target=self.irc.run_forever_until_disconnected)
            self.irc_thread.start()

        self.setWindowTitle("BossFight")
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )

        self.layout = QVBoxLayout(self)

        self.emote_labels = [QLabel(self) for _ in range(self.EMOTE_QUEUE)]

        for idx, label in enumerate(self.emote_labels):
            label.setGeometry(120, 50 * idx, 50, 50)
            label.raise_()
            label.raise_()
            label.raise_()
            label.raise_()

        self.boss_label = QLabel(self)
        self.boss_sprite = QMovie(BOSS_SPRITE)
        self.boss_sprite.start()
        self.boss_label.setMovie(self.boss_sprite)
        self.layout.addWidget(self.boss_label)

        self.health_bar = QProgressBar()
        self.health_bar.setMaximum(max_health)
        self.health_bar.setMinimum(0)
        self.health_bar.setValue(max_health + 1)
        self.health_bar.setTextVisible(False)
        self.health_bar.setStyleSheet(self.PROGRESS_BAR_STYLE)
        self.layout.addWidget(self.health_bar)

        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        self.boss_tick = QTimer()
        self.boss_tick.timeout.connect(self.update_boss)
        self.boss_tick.start(int(1000 / 30))

        self.irc_msg_callback_queue: Queue[str] = Queue()

        self.emote_renderer = EmoteRenderer(self.emote_labels)
        self.movement = BossMovement()

        place_randomly(self, width=300, height=300)

    def choose_random_emote(self) -> tuple[str, bool, bytes]:
        emote = random.choice(self.emotes)
        request = urllib.request.Request(
            url=emote.url, data=None, headers={"User-Agent": HEADERS}
        )
        with urllib.request.urlopen(request) as response:
            return (emote.name, emote.animated, response.read())

    def irc_message_callback(self, message: str) -> None:
        """
        Callback whenever twitch sends a matching message.
        Call this in the IRC thread.
        """
        self.irc_msg_callback_queue.put(message)

    def _dev_chat_callback(self, message: str) -> None:
        if self.current_emotes[0][0] in message:
            self.irc_msg_callback_queue.put(message)

    def _handle_irc_message_callback(self, message: str) -> None:
        """
        Actually handles the twitch message callback.
        Called by the GUI thread.
        """
        logger.debug("Damage will be taken for %s", message)
        self.health -= 10 + (0 if random.randint(0, 100) < 70 else 1) * random.randint(
            0, 50
        )
        logger.debug("Health: %s", self.health)

        self.current_emotes.pop(0)
        self.current_emotes.append(self.choose_random_emote())
        if self.irc is not None:
            self.irc.set_keyword(self.current_emotes[0][0])

    def update_boss(self):
        """
        Moves the boss towards the target, regenerating new coordinates if needed.
        Also updates the health bar.
        Also handles IRC message callbacks
        """
        while True:
            try:
                msg = self.irc_msg_callback_queue.get_nowait()
                self._handle_irc_message_callback(msg)
            except Empty:
                break

        display_changes = self.health_bar.value() != self.health

        if display_changes:
            self.health_bar.setValue(self.health)
            if self.health <= 0:
                self.boss_tick.stop()
                self.close()
                return

            for idx in range(self.EMOTE_QUEUE - 1):
                self.emote_renderer.render(self.current_emotes[idx], idx)

        geo = self.geometry()
        d_x, d_y = self.movement.step(geo.x(), geo.y())
        self.setGeometry(geo.x() + d_x, geo.y() + d_y, geo.width(), geo.height())
        self.update()

    def closeEvent(self, event):
        self.boss_tick.stop()
        if self.irc is not None and self.irc_thread is not None:
            if self.irc_thread.is_alive():
                logger.info("IRC thread still alive, joining...")
                self.irc.disconnect()
                self.irc_thread.join()
                self.irc.reactor.process_once()
        unregister_chat_listener(self._dev_chat_callback)
        super().closeEvent(event)


def make_boss_fight(emote_set_id: str) -> BossFightFrame:
    emotes = get_emotes_from_emote_set_id(emote_set_id)
    health = random.randint(1, 500)

    return BossFightFrame("vanorsigma", health, emotes)


if __name__ == "__main__":
    app = QApplication([])

    emotes = get_emotes_from_emote_set_id("01J452JCVG0000352W25T9VEND")
    bossfight = BossFightFrame("vanorsigma", 100, emotes)
    bossfight.show()

    app.exec()
