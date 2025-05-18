"""
A possible sub-frame of the warning frame
"""

import random
import sys
import urllib
from threading import Thread
from typing import Callable

from irc.client import Event, Reactor, ServerConnection, ServerConnectionError
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QImage, QMovie, QPixmap
from PyQt6.QtWidgets import (QApplication, QLabel, QLayout, QProgressBar,
                             QVBoxLayout)
from trinket.frames.shared import (CloseSignalableOpenGLWidget,
                                   SevenTVEmoteData,
                                   get_emotes_from_emote_set_id)


class TwitchIRCKeywordListener:
    def __init__(self, channel: str, keyword: str, callback: Callable[[str], None]) -> None:
        self.channel = channel
        self.callback = callback
        self.keyword = keyword
        self.reactor = Reactor()
        self.disconnected = False

        try:
            self.c: ServerConnection = self.reactor.server().connect(
                'irc.chat.twitch.tv', 6667, 'justinfan123')
        except ServerConnectionError as e:
            raise RuntimeError from e

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
        print('Connected to twitch, joining channel')
        self.c.join(f'#{self.channel}')

    def on_event(self, connection: ServerConnection, event: Event):
        if event.type != 'pubmsg':
            return
        message = event.arguments[0]
        if self.keyword in message:
            self.callback(message)

    def on_disconnect(self, connection: ServerConnection, event: Event):
        print('Disconnected from twitch')

    def on_join(self, connection: ServerConnection, event: Event):
        print(f'Listening to channel {self.channel}')


# pylint: disable=too-few-public-methods, too-many-instance-attributes
class BossFightFrame(CloseSignalableOpenGLWidget):
    """
    A boss fight.

    To deal damage, chatters must find the keyword.
    """

    BOSS_SPRITE = "resources/sbird.gif"
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

    def __init__(self, channel_name: str, max_health: int, emotes: list[SevenTVEmoteData]):
        super().__init__()
        self.emotes = emotes
        self.current_emotes = [self.choose_random_emote() for _ in range(self.EMOTE_QUEUE)]

        self.health = max_health
        self.irc = TwitchIRCKeywordListener(channel_name,
                                            self.current_emotes[0][0], self.irc_message_callback)
        self.irc_thread = Thread(target=self.irc.run_forever_until_disconnected)
        self.irc_thread.start()

        self.setWindowTitle('BossFight')
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)

        self.layout = QVBoxLayout(self)

        self.emote_labels = [QLabel(self) for _ in range(self.EMOTE_QUEUE)]
        self.emote_pictures = [QImage() for _ in range(self.EMOTE_QUEUE)]

        # HACK: very ugly hack
        for idx, label in enumerate(self.emote_labels):
            label.setGeometry(120, 50 * idx, 50, 50)
            label.raise_()
            label.raise_()
            label.raise_()
            label.raise_()

        self.boss_label = QLabel(self)
        self.boss_sprite = QMovie(self.BOSS_SPRITE)
        self.boss_sprite.start()
        self.boss_label.setMovie(self.boss_sprite)
        self.layout.addWidget(self.boss_label)

        self.health_bar = QProgressBar()
        self.health_bar.setMaximum(max_health)
        self.health_bar.setMinimum(0)
        self.health_bar.setValue(max_health)
        self.health_bar.setTextVisible(False)
        self.health_bar.setStyleSheet(self.PROGRESS_BAR_STYLE)
        self.layout.addWidget(self.health_bar)

        self.setLayout(self.layout)
        self.layout.setSizeConstraint(QLayout.SizeConstraint.SetFixedSize)

        self.boss_tick = QTimer()
        self.boss_tick.timeout.connect(self.update_boss)
        self.boss_tick.start(int(1000 / 30))

        screen = QApplication.screens()[0].size()
        self.boss_target_pos = (
            random.randint(0, screen.width() - 300),
            random.randint(0, screen.height() - 300))
        self.setGeometry(random.randint(0, screen.width() - 300),
                         random.randint(0, screen.height() - 300),
                         300, 300)

    def choose_random_emote(self) -> tuple[str, bytes]:
        emote = random.choice(self.emotes)
        with urllib.request.urlopen(emote.url) as response:
            return (emote.name, response.read())

    def irc_message_callback(self, message: str) -> None:
        """
        Callback whenever twitch sends a matching message
        """
        print(f'Damage will be taken for {message}')
        self.health -= 10 + (0 if random.randint(0, 100) < 70 else 1) * random.randint(0, 50)
        print(f'Health: {self.health}')

        self.current_emotes.pop(0)
        self.current_emotes.append(self.choose_random_emote())
        self.irc.set_keyword(self.current_emotes[0][0])

    def update_boss(self):
        """
        Moves the boss towards the target, regenerating new coordinates if needed.
        Also updates the health bar
        """
        self.health_bar.setValue(self.health)
        if self.health <= 0:
            self.boss_tick.stop()
            self.close()
            return

        for idx, (label, picture) in enumerate(zip(self.emote_labels, self.emote_pictures)):
            if idx >= self.EMOTE_QUEUE - 1:
                continue

            picture = QImage()
            picture.loadFromData(self.current_emotes[idx][1])
            picture = picture.scaledToWidth(50)
            label.setPixmap(QPixmap(picture))

        x, y, w, h = self.geometry().getCoords()

        t_x, t_y = self.boss_target_pos
        if (t_x, t_y) == (x, y):
            screen = QApplication.screens()[0].size()
            self.boss_target_pos = (
                random.randint(0, screen.width() - 300),
                random.randint(0, screen.height() - 300))

        d_x, d_y = max(-20, min(t_x - x, 20)), max(-20, min(t_y - y, 20))
        self.setGeometry(x + d_x, y + d_y, w, h)
        self.update()

    def closeEvent(self, event):
        if self.irc_thread.is_alive():
            print('IRC thread still alive, joining...')
            self.irc.disconnect()
            self.irc_thread.join()
            self.irc.reactor.process_once()
        super().closeEvent(event)

def make_boss_fight(emote_set_id: str) -> BossFightFrame:
    emotes = get_emotes_from_emote_set_id(emote_set_id)
    health = random.randint(0, 500)

    return BossFightFrame('vanorsigma', health, emotes)

if __name__ == "__main__":
    app = QApplication(sys.argv)

    emotes = get_emotes_from_emote_set_id("01J452JCVG0000352W25T9VEND")
    bossfight = BossFightFrame('vanorsigma', 100, emotes)
    bossfight.show()

    app.exec()
