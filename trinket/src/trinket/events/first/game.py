"""
Main Game Window
"""

import sys
import copy
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont
from trinket.events.first.bases import GameStatistics, GameObserver
from trinket.events.first.stats_window import StatsWindow
from trinket.events.first.vital_stats_window import VitalStatsWindow

class Game:
    def __init__(self, initial_statistics: GameStatistics):
        self.observers = []
        self.statistics = initial_statistics

        vital_win = VitalStatsWindow(self.statistics)
        vital_win.show()

        stats_win = StatsWindow(self.statistics)
        stats_win.move(vital_win.x() + vital_win.width() + 20, vital_win.y())
        stats_win.show()

        # empty_win = EmptyWindow()
        # empty_win.move(stats_win.x() + stats_win.width() + 20, stats_win.y())
        # empty_win.show()

        self.subscribe(vital_win)
        self.subscribe(stats_win)

    def subscribe(self, observer: GameObserver) -> None:
        if not isinstance(observer, GameObserver):
            raise RuntimeError("Trying to subscribe to a non-GameObsever!")
        self.observers.append(observer)

    def unsubscribe(self, observer: GameObserver) -> None:
        if not isinstance(observer, GameObserver):
            raise RuntimeError("Trying to unsubscribe to a non-GameObsever!")

        if observer in self.observers:
            self.observers.remove(observer)

    def update_statistics(self, statistics: GameStatistics) -> None:
        self.statistics = statistics
        for observer in self.observers:
            observer.state_changed(statistics)

    def get_statistics(self) -> GameStatistics:
        return copy.deepcopy(self.statistics)
