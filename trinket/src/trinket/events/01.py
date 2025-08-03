"""
Special Event
"""

import sys
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer

from trinket.events.first.bases import GameStatistics, GameObserver
from trinket.events.first.game import Game
from trinket.events.first.stats_window import StatsWindow
from trinket.events.first.vital_stats_window import VitalStatsWindow
from trinket.events.first.card_window import CardWindow

# TODO: temporary import
from trinket.events.first.cards.heal import HealingCard
TEMP_GLOBAL_REFERENCES_DO_NOT_USE = []

class CardSpawnObserver:
    def state_changed(self, game: Game):
        game.unsubscribe(self)

        card = HealingCard(game)
        card_win = CardWindow(card)
        card_win.show()

        TEMP_GLOBAL_REFERENCES_DO_NOT_USE.append(card_win)

def initialiser(statistics: GameStatistics) -> list[GameObserver]:
    vital_win = VitalStatsWindow(statistics)
    vital_win.show()

    stats_win = StatsWindow(statistics)
    stats_win.move(vital_win.x() + vital_win.width() + 20, vital_win.y())
    stats_win.show()

    return [vital_win, stats_win]

if __name__ == "__main__":
    app = QApplication(sys.argv)

    game = Game(GameStatistics(100, 100, 0, 1000, 1000), initialiser)
    observer = CardSpawnObserver()
    game.subscribe(observer)

    def __timer_callback():
        statistics = game.get_statistics()
        statistics.health -= 1
        game.update_statistics(statistics)

    timer = QTimer()
    timer.setInterval(100)
    timer.timeout.connect(__timer_callback)
    timer.start()

    sys.exit(app.exec())
