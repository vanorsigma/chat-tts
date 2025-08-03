"""
Stats Window
"""

import sys
import copy
from trinket.events.first.bases import FloatingWindow, GameStatistics
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QMouseEvent, QFont

GAME_STATISTICS_REMAP = { # Any statistics not mapped here will not be rendered
    'enemies_killed': 'Enemies Killed',
    'max_health': 'Max Health',
    'max_mana': 'Max Mana'
}

class StatsWindow(FloatingWindow):
    LABEL_STYLE = "font-size: 16px; font-weight: bold;"
    VALUE_STYLE = "font-size: 16px; color: #FFC107;"

    def __init__(self, initial_statistics: GameStatistics):
        super().__init__(size=(350, 250), title="Statistics")

        self.main_layout = QVBoxLayout(self)
        self.main_layout.setContentsMargins(20, 20, 20, 20)
        self.main_layout.setSpacing(10)

        self.layouts = {}
        self.update_statistics(initial_statistics)
        self.setLayout(self.main_layout)

    def update_statistics(self, statistics: GameStatistics):
        for label, value in asdict(statistics).items():
            if label not in GAME_STATISTICS_REMAP:
                continue

            if label not in self.layouts:
                row_layout = QHBoxLayout()
                row_layout.setSpacing(5)

                stat_label = QLabel(f"{GAME_STATISTICS_REMAP[label]}:")
                stat_label.setStyleSheet(self.LABEL_STYLE)
                row_layout.addWidget(stat_label)

                value_label = QLabel(str(value))
                value_label.setStyleSheet(self.VALUE_STYLE)
                row_layout.addWidget(value_label, alignment=Qt.AlignmentFlag.AlignRight)

                self.main_layout.addLayout(row_layout)
                self.layouts[label] = (stat_label, value_label)

            _, value_label = self.layouts[label]
            value_label: QLabel
            value_label.setText(str(value))

    def state_changed(self, statistics: GameStatistics):
        self.update_statistics(statistics)
