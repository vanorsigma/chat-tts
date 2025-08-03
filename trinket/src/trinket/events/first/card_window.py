"""
A card window. Shows a card.
"""

import sys
import copy
from trinket.events.first.bases import FloatingWindow, GameStatistics
from trinket.events.first.game import Game
from trinket.events.first.cards.base import Card
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from typing import Protocol, runtime_checkable
from PyQt6.QtWidgets import (
    QApplication, QWidget, QProgressBar, QLabel,
    QVBoxLayout, QHBoxLayout, QTextEdit
)
from PyQt6.QtCore import Qt, QTimer, QSize
from PyQt6.QtGui import QMouseEvent, QFont, QImage, QPixmap, QPainter

class CardWindow(FloatingWindow):
    def __init__(self, card: Card):
        super().__init__(size=(200, 1000), title="Card")

        self.setStyleSheet("""
            QWidget {
                background-color: rgba(30, 30, 30, 0);
                color: #000000;
                border: 2px solid #555555;
                border-radius: 10px;
                font-family: Arial;
            }
        """)

        self.main_layout = QVBoxLayout(self)
        self.main_layout.setSpacing(10)
        self.main_layout.setContentsMargins(10, 10, 10, 10)

        self.image_label = QLabel()
        self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image_label.setMinimumSize(QSize(200, 200))
        self.image_label.setMaximumSize(QSize(200, 200))
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
            "QTextEdit { background-color: #f0f0f0; border: 1px solid #c0c0c0; padding: 5px; }"
        )
        self.description_textedit.setText(card.get_description())
        self.main_layout.addWidget(self.description_textedit)

        self.setLayout(self.main_layout)

    def set_image(self, image: QImage):
        pixmap = QPixmap.fromImage(image)
        if not pixmap.isNull():
            label_size = self.image_label.size()
            if label_size.width() == 0 or label_size.height() == 0:
                label_size = QSize(200, 200)

            scaled_pixmap = pixmap.scaled(
                label_size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )

            cropped_pixmap = QPixmap(label_size)
            cropped_pixmap.fill(Qt.GlobalColor.transparent)

            x_offset = (label_size.width() - scaled_pixmap.width()) // 2
            y_offset = (label_size.height() - scaled_pixmap.height()) // 2

            painter = QPainter(cropped_pixmap)
            painter.drawPixmap(x_offset, y_offset, scaled_pixmap)
            painter.end()

            self.image_label.setPixmap(cropped_pixmap)
        else:
            self.image_label.setText("Image not found")
            self.image_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
