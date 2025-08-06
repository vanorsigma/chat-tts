"""
Special Event
"""

import sys
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QGuiApplication
from typing import Optional

from trinket.events.first.cards.base import Card
from trinket.events.first.bases import GameStatistics, GameObserver
from trinket.events.first.game import Game, ObserverCalledReason
from trinket.events.first.stats_window import StatsWindow
from trinket.events.first.vital_stats_window import VitalStatsWindow
from trinket.events.first.card_window import CardWindow

# TODO: temporary import
from trinket.events.first.cards.heal import HealingCard

class CardAddedObserver:
    def __init__(self):
        self.hand_references: list[QWidget] = []

    def state_changed(self, game: Game[Card], reason: ObserverCalledReason):
        if reason != ObserverCalledReason.HAND_CHANGED:
            return

        self.redraw_hand(game)

    def redraw_hand(self, game: Game[Card]):
        for ref in self.hand_references:
            ref.close()

        screen = QGuiApplication.primaryScreen().availableGeometry()
        screen_width = screen.width()
        screen_height = screen.height()

        self.hand_references = []
        hand = game.get_hand()

        card_width, card_height = game.get_card_size()
        left_offset = screen_width // 2 - (len(hand) * card_width) // 2

        for idx, card in enumerate(hand):
            card_win = CardWindow(card, (card_width, card_height))
            if game.get_parent_widget():
                card_win.setParent(game.get_parent_widget())
            card_win.show()
            card_win.move(left_offset + idx * card_win.width(), screen_height - card_win.height() - 20)
            self.hand_references.append(card_win)

class CardSpawnObserver:
    def state_changed(self, game: Game[Card], _reason):
        game.unsubscribe(self)

        game.hand_add(HealingCard(game))
        game.hand_add(HealingCard(game))
        game.hand_add(HealingCard(game))

def initialiser(statistics: GameStatistics, parent_widget: Optional[QWidget] = None) -> list[GameObserver]:
    screen = QGuiApplication.primaryScreen().availableGeometry()
    screen_width = screen.width()
    screen_height = screen.height()

    vital_win = VitalStatsWindow(statistics)
    if parent_widget:
        vital_win.setParent(parent_widget)
    vital_win.move(20, screen_height // 2 - vital_win.height() // 2)
    vital_win.show()

    stats_win = StatsWindow(statistics)
    if parent_widget:
        stats_win.setParent(parent_widget)
    stats_win.move(screen_width - stats_win.width() - 20, screen_height // 2 - stats_win.height() // 2)
    stats_win.show()

    return [vital_win, stats_win]

class TempX11Simulator(QWidget):
    """
    HACK
    On Wayland, window positioning breaks fairly easily.
    This window covers the entire screen, for unblocking purposes while
    the application is developed on Wayland
    """
    def __init__(self):
        super().__init__()

        screen = QGuiApplication.primaryScreen().availableGeometry()
        width = screen.width()
        height = screen.height()

        print(f'Simulator resizing to {width}x{height}')

        self.setWindowTitle('TempX11Simulator')
        self.setFixedSize(width, height)
        self.setWindowFlags(
            Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint
        )

        self.setStyleSheet('background-color: #808080;')

if __name__ == "__main__":
    app = QApplication(sys.argv)

    # HACK: Simulate positioning as would be the case on X11
    simulator = TempX11Simulator()
    game = Game(GameStatistics(100, 100, 0, 1000, 1000), initialiser, parent_widget=simulator)
    card_added_observer = CardAddedObserver()
    game.subscribe(card_added_observer)

    observer = CardSpawnObserver()
    game.subscribe(observer)
    simulator.show()

    def __timer_callback():
        statistics = game.get_statistics()
        statistics.health -= 1
        game.update_statistics(statistics)

    timer = QTimer()
    timer.setInterval(100)
    timer.timeout.connect(__timer_callback)
    timer.start()

    sys.exit(app.exec())
