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

    def __timer_callback():
        statistics = game.get_statistics()
        statistics.health -= 1
        game.update_statistics(statistics)

    timer = QTimer()
    timer.setInterval(100)
    timer.timeout.connect(__timer_callback)
    timer.start()

    sys.exit(app.exec())
