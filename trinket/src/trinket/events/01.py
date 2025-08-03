"""
Special Event
"""

import sys
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer

from trinket.events.first.bases import GameStatistics
from trinket.events.first.game import Game

if __name__ == "__main__":
    app = QApplication(sys.argv)

    game = Game(GameStatistics(100, 100, 0, 1000, 1000))

    def __timer_callback():
        statistics = game.get_statistics()
        statistics.health -= 1
        game.update_statistics(statistics)

    timer = QTimer()
    timer.setInterval(100)
    timer.timeout.connect(__timer_callback)
    timer.start()

    sys.exit(app.exec())
