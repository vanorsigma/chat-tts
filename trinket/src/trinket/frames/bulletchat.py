"""
Bullet Chat Windows
"""

import sys
import random
import urllib.request
import threading

from queue import Queue
from irc.client import Event, Reactor, ServerConnection, ServerConnectionError
from PyQt6.QtCore import (
    Qt,
    QTimer,
    QElapsedTimer,
    QObject,
    QThread,
    QRunnable,
    pyqtSlot,
)
from PyQt6.QtGui import (
    QGuiApplication,
    QTransform,
    QImage,
    QMovie,
    QPixmap,
    QCloseEvent,
)
from PyQt6.QtWidgets import QApplication, QLabel, QLayout, QHBoxLayout, QWidget
from PyQt6.QtOpenGLWidgets import QOpenGLWidget
from trinket.frames.shared import (
    SevenTVAPI,
    SevenTVEmoteData,
    CloseSignalableOpenGLWidget,
)
from typing import Union, Callable

EMOTE_SET_ID = "01J452JCVG0000352W25T9VEND"
HEADERS = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/35.0.1916.47 Safari/537.36"
DESPAWN_AFTER = 30


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url=url, data=None, headers={"User-Agent": HEADERS}
    )

    with urllib.request.urlopen(request) as response:
        return response.read()


def break_message_into_text_and_emotes(message: str) -> list[Union[str | bytes]]:
    api = SevenTVAPI(EMOTE_SET_ID)
    emotes = {emote.name: emote for emote in api.get_emotes()}
    combined_objects = []

    for text in message.split():
        if text in emotes:
            combined_objects.append(finalize_message(emotes[text]))
        else:
            if len(combined_objects) > 0 and isinstance(combined_objects[-1], str):
                combined_objects[-1] += f" {text}"
            else:
                combined_objects.append(text)

    return combined_objects


def finalize_message(obj: str | SevenTVEmoteData) -> Union[str | bytes]:
    if isinstance(obj, SevenTVEmoteData):
        return fetch_bytes(obj.url)
    return obj


def add_labels_to_layout(
    root: QWidget, layout: QHBoxLayout, objs: list[Union[str | bytes]]
) -> list[QWidget]:
    references = []

    for obj in objs:
        label = QLabel()

        if isinstance(obj, bytes):
            picture = QImage()
            picture.loadFromData(obj)
            picture = picture.scaledToWidth(50)
            label.setPixmap(QPixmap(picture))
        else:
            label.setText(obj)

        references.append(obj)
        label.setStyleSheet("color: white; font-size: 64px;")
        layout.addWidget(label)

    return references


class TwitchIRCMessageEmitter:
    def __init__(self, channel: str, callback: Callable[[str], None]) -> None:
        self.channel = channel
        self.callback = callback
        self.reactor = Reactor()
        self.disconnected = False

        try:
            self.c: ServerConnection = self.reactor.server().connect(
                "irc.chat.twitch.tv", 6667, "justinfan123"
            )
        except ServerConnectionError as e:
            raise RuntimeError from e

        self.c.add_global_handler("welcome", self.on_connect)
        self.c.add_global_handler("join", self.on_join)
        self.c.add_global_handler("disconnect", self.on_disconnect)
        self.c.add_global_handler("all_events", self.on_event)

    def run_forever_until_disconnected(self):
        while self.c.is_connected():
            self.reactor.process_once(timeout=1)

    def disconnect(self):
        self.c.disconnect()
        self.c.close()

    def on_connect(self, connection, event):
        print("Connected to twitch, joining channel")
        self.c.join(f"#{self.channel}")

    def on_event(self, connection: ServerConnection, event: Event):
        if event.type != "pubmsg":
            return
        message = event.arguments[0]
        self.callback(message)

    def on_disconnect(self, connection: ServerConnection, event: Event):
        print("Disconnected from twitch")

    def on_join(self, connection: ServerConnection, event: Event):
        print(f"Listening to channel {self.channel}")


class SingleBulletChat(
    CloseSignalableOpenGLWidget
):  # pylint: disable=too-few-public-methods,too-many-instance-attributes
    """
    A small window containing a single chat message
    """

    def __init__(
        self,
        message: list[Union[str | bytes]],
        speed: int,
        x_range: tuple[int, int],
        y_range: tuple[int, int],
        start_time=0,
    ):
        super().__init__()
        self.speed = speed
        self.setWindowTitle("BulletChat")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.WindowTransparentForInput
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_InputMethodTransparent, True)

        self.hlayout = QHBoxLayout()
        self.hlayout.addStretch()
        self.references = add_labels_to_layout(self, self.hlayout, message)
        self.hlayout.addStretch()
        self.setLayout(self.hlayout)
        self.hlayout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        self.start_time = start_time

        self.x_range = x_range
        self.y_range = y_range
        self.x = x_range[1] + self.width()
        self.y = random.randint(y_range[0], y_range[1])
        self.move(self.x, self.y)


class BulletChatContainer(
    QWidget
):  # pylint: disable=too-few-public-methods,too-many-instance-attributes
    """
    A big window that will spawn the SingleBUlletChat messages.
    Note that the windows does not spawn in this window.
    """

    def __init__(self, channel: str):
        super().__init__()
        self.setWindowTitle("BulletChat")
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_InputMethodTransparent, True)
        self.active_bullets = []
        self.messages_queue = Queue[str | bytes]()
        self.irc = TwitchIRCMessageEmitter(channel, self.__irc_callback)

        self.timer = QTimer()
        self.timer.setInterval(1000)
        self.timer.timeout.connect(self.__timer_callback)
        self.timer.start()
        self.irc_thread = threading.Thread(
            target=self.irc.run_forever_until_disconnected
        )
        self.irc_thread.start()

        self.pos_timer = QTimer()
        self.pos_timer.timeout.connect(self.update_position)
        self.pos_timer.setInterval(int(1000 / 30))
        self.pos_timer.start()

        self.elapsed = QElapsedTimer()
        self.elapsed.start()
        self.last_time = self.elapsed.elapsed()

        screen = QApplication.screens()[0].size()
        self.resize(0, 0)

        self.min_x = 0
        self.max_x = self.min_x + screen.width()
        self.min_y = 256
        self.max_y = self.min_y + screen.height() - 256

        # TODO: remove these debug messages
        DEBUG_MESSAGES = ["Chat Bullet Started", "Good Luck Bro", "xdx"]
        for msg in DEBUG_MESSAGES:
            self.messages_queue.put(break_message_into_text_and_emotes(msg))

    def update_position(self):
        elapsed = self.last_time - self.elapsed.elapsed()
        for bullet in self.active_bullets:
            bullet.x = max(
                bullet.x_range[0] - bullet.width() - 20,
                min(int(bullet.x + bullet.speed * (elapsed / 1000)), bullet.x_range[1]),
            )
            bullet.last_time = self.elapsed.elapsed()
            bullet.move(bullet.x, bullet.y)
            if (
                bullet.x <= bullet.x_range[0] - bullet.width() - 20
                or self.elapsed.elapsed() - bullet.start_time > DESPAWN_AFTER * 1000
            ):
                bullet.close()

        self.last_time = self.elapsed.elapsed()
        self.update()

    def __irc_callback(self, message: str):
        self.messages_queue.put(break_message_into_text_and_emotes(message))

    def __timer_callback(self):
        while not self.messages_queue.empty():
            msg = self.messages_queue.get()
            speed = random.randint(50, 200)
            chat = SingleBulletChat(
                msg,
                speed,
                (self.min_x, self.max_x),
                (self.min_y, self.max_y),
                self.elapsed.elapsed(),
            )
            chat.closed.connect(self.bullet_died)
            # chat.setParent(self)
            chat.show()
            self.active_bullets.append(chat)

    def bullet_died(self, obj: CloseSignalableOpenGLWidget):
        if obj in self.active_bullets:
            self.active_bullets.remove(obj)
        print("Active Bullets: ", len(self.active_bullets))

    def closeEvent(self, __event):
        self.timer.stop()
        if self.irc_thread.is_alive():
            self.irc.disconnect()
            self.irc_thread.join()
            self.irc.reactor.process_once()

        super().closeEvent(__event)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)
    container = BulletChatContainer("vanorsigma")
    container.show()

    app.exec()
