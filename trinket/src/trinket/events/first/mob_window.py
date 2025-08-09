"""
A mob window
"""

import sys
import math
import copy
from trinket.events.first.bases import FloatingWindow, FloatingWindowNoGL, GameStatistics
from trinket.events.first.game import Game
from trinket.events.first.cards.base import Card
from trinket.events.first.mobs.mob import Mob
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout, QTextEdit, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtGui import QMouseEvent, QFont, QImage, QPixmap, QPainter, QPalette, QColor
from PyQt6.QtOpenGLWidgets import QOpenGLWidget


class MobWindow(FloatingWindow):
    """
    Represents a Mob
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
            background-color: #FF0000;
        }
    """

    def __init__(self, mob: Mob, initial_size: tuple[int, int]):
        super().__init__(size=initial_size, title="Mob")

        self.inital_size = initial_size
        self.setAutoFillBackground(True)
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.main_layout = QVBoxLayout()

        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.image_label.setMaximumHeight(200)
        self.image_label.setScaledContents(True)
        self.main_layout.addWidget(self.image_label)
        self.set_image(mob.get_image())

        self.name_label = QLabel()
        self.name_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.name_label.setText(mob.get_name())

        self.hp_bar = QProgressBar()
        self.hp_bar.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.hp_bar.setStyleSheet(self.PROGRESS_BAR_STYLE)

        self.mob = mob

        self.main_layout.addWidget(self.hp_bar)
        self.setLayout(self.main_layout)

    def set_image(self, image: QImage):
        pixmap = QPixmap.fromImage(image)
        if not pixmap.isNull():
            self.image_label.setPixmap(pixmap)
        else:
            self.image_label.setText("Image not found")
            self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

    def state_changed(self, game: Game, _reason):
        current_hp = self.mob.get_health()
        if current_hp != self.hp_bar.value():
            self.hp_bar.setValue(current_hp)
            if current_hp == 0:
                game.remove_mob(self.mob)
                game.unsubscribe(self)
                self.close()
