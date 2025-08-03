"""
Vital Statistics Window
"""

import sys
import copy
from trinket.events.first.bases import FloatingWindow, GameStatistics
from trinket.events.first.game import Game
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont

class VitalStatsWindow(FloatingWindow):
    """
    Important stats to visualise
    """

    PROGRESS_BAR_STYLE = """
        QProgressBar {
            border: 1px solid #555555;
            border-radius: 5px;
            text-align: center;
            color: #ffffff;
            background-color: #444444;
        }
        QProgressBar::chunk {
            border-radius: 5px;
            background-color: #4CAF50;
        }
    """

    def __init__(self, statistics: GameStatistics) -> None:
        super().__init__(size=(300, 150), title="Vital Stats")

        layout = QVBoxLayout(self)
        layout.setSpacing(15)

        self.hp_bar = QProgressBar(self)
        self.hp_bar.setStyleSheet(self.PROGRESS_BAR_STYLE.replace("#4CAF50", "#FF0000"))
        self.hp_bar.setValue(statistics.health)
        self.hp_bar.setMaximum(statistics.max_health)
        layout.addWidget(self.hp_bar)

        self.mana_bar = QProgressBar(self)
        self.mana_bar.setStyleSheet(self.PROGRESS_BAR_STYLE.replace('#4CAF50', '#00FF00'))
        self.mana_bar.setValue(statistics.mana)
        self.mana_bar.setMaximum(statistics.max_mana)
        layout.addWidget(self.mana_bar)

        self.setLayout(layout)

    def state_changed(self, game: Game):
        self.hp_bar.setValue(game.get_statistics().health)
        self.mana_bar.setValue(game.get_statistics().mana)
