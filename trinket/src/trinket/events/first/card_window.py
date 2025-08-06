"""
A card window. Shows a card.
"""

import sys
import math
import copy
from trinket.events.first.bases import FloatingWindow, FloatingWindowNoGL, GameStatistics
from trinket.events.first.game import Game
from trinket.events.first.cards.base import Card
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

# NOTE: For some reason QOpenGLWidget doesn't correctly paint the background
# TODO: Probably should find out why
class CardWindow(FloatingWindowNoGL):
    """
    CardWindow class to display a card on the screen.
    This does not have OpenGL backing, because QOpenGLWidget does not properly
    paint it
    """
    def __init__(self, card: Card, backing_color: str = '#FFDAB9', initial_size=(300, 500)):
        super().__init__(size=initial_size, title="Card")

        self.inital_size = initial_size
        self.setAutoFillBackground(True)
        self.setWindowFlags(Qt.WindowType.WindowStaysOnTopHint | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self.setStyleSheet("""
            QWidget {
                background-color: rgba(30, 30, 30, 200);
                color: #ffffff;
                /*border: 2px solid #555555;
                border-radius: 1px;*/
                font-family: Arial;
            }
        """)

        self.backing_label = QLabel()
        self.backing_label.setObjectName("CardBacking")
        self.backing_label.setStyleSheet("""
            QWidget#CardBacking {
                background-color: %s;
                color: #000000;
                border: 1px solid %s;
                border-radius: 10px;
                font-family: Arial;
            }
        """ % (backing_color, backing_color))
        self.backing_layout = QVBoxLayout(self)
        self.backing_layout.addWidget(self.backing_label)
        self.backing_layout.setContentsMargins(0, 0, 0, 0)

        self.cost_label = QLabel(self)
        self.cost_label.setText(str(card.get_base_cost()))
        self.cost_label.setStyleSheet("""
            color: #FFFFFF;
            font-size: 30px;
            background-color: #0000FF;
            border: 2px solid #0000FF;
        """)
        cost_label_size_hint = self.cost_label.sizeHint()
        cost_label_w, cost_label_h = cost_label_size_hint.width(), cost_label_size_hint.height()
        cost_label_ideal_x = -(cost_label_w // 2)
        cost_label_ideal_y = -(cost_label_h // 2)
        self.cost_label.setGeometry(0, 0, cost_label_w, cost_label_h)
        self.setContentsMargins(-cost_label_ideal_x, -cost_label_ideal_y, 0, 0)

        self.main_layout = QVBoxLayout(self.backing_label)
        self.main_layout.setSpacing(0)
        self.main_layout.setContentsMargins(5, 5, 5, 5)

        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.image_label.setMaximumHeight(200)
        self.image_label.setScaledContents(True)
        self.main_layout.addWidget(self.image_label)
        self.set_image(card.get_image())

        self.title_label = QLabel()
        self.title_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        font = QFont()
        font.setPointSize(12)
        font.setBold(True)
        self.title_label.setFont(font)
        self.title_label.setText(card.get_name())
        self.main_layout.addWidget(self.title_label)

        self.description_textedit = QTextEdit()
        self.description_textedit.setReadOnly(True)
        self.description_textedit.setFrameShape(QTextEdit.Shape.Box)
        self.description_textedit.setFrameShadow(QTextEdit.Shadow.Sunken)
        self.description_textedit.setStyleSheet(
            "QTextEdit { padding: 5px; font-size: 18px }"
        )
        self.description_textedit.setText(card.get_description())
        self.main_layout.addWidget(self.description_textedit)

    def set_image(self, image: QImage):
        pixmap = QPixmap.fromImage(image)
        if not pixmap.isNull():
            self.image_label.setPixmap(pixmap)
        else:
            self.image_label.setText("Image not found")
            self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

    def set_size_by_votes(self, votes: int, total_votes: int):
        # if the card held >50% of the vote, do not shrink the card
        scaling_factor = min(votes / float(total_votes) + 0.5, 1.0)
        w, h = self.inital_size
        self.setFixedSize(int(w * scaling_factor), int(h * scaling_factor))

if __name__ == "__main__":
    from trinket.events.first.cards.heal import HealingCard

    app = QApplication(sys.argv)

    card = HealingCard(None)
    card_win = CardWindow(card)
    card_win.show()

    sys.exit(app.exec())
