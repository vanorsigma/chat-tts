"""
Entrypoint to the trinket application.
"""

import logging
import os
import signal
import socket
import sys
import threading

from PyQt6.QtCore import QSocketNotifier, QTimer
from PyQt6.QtWidgets import QApplication

from trinket.controller import TrinketController
from trinket.receiver.console import ConsoleReceiver


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    app = QApplication(sys.argv)
    controller = TrinketController(app)

    timer = QTimer()
    timer.setInterval(200)
    timer.timeout.connect(lambda: controller.on_timer_tick(timer))
    timer.start()

    app.setQuitOnLastWindowClosed(False)

    sig_read_fd, sig_write_fd = socket.socketpair()
    sig_read_fd.setblocking(False)
    sig_write_fd.setblocking(False)

    notifier = QSocketNotifier(
        sig_read_fd.fileno(), QSocketNotifier.Type.Read
    )

    def _on_notifier_activated(fd: int) -> None:
        try:
            os.read(fd, 4096)
        except (BlockingIOError, OSError):
            pass
        controller.on_signal_activated()

    notifier.activated.connect(_on_notifier_activated)

    def _sigint_handler(_signum, _frame):
        try:
            sig_write_fd.send(b"\x00")
        except OSError:
            pass

    signal.signal(signal.SIGINT, _sigint_handler)

    logger = logging.getLogger(__name__)
    if os.environ.get("TRINKET_DEV_MODE"):
        logger.info("Starting console receiver thread")
        def _console_target():
            receiver = ConsoleReceiver(controller.on_ws_message, controller.cancelled)
            receiver.run_forever()

        _ws_thread = threading.Thread(target=_console_target)
    else:
        logger.info("Starting WS thread")
        _ws_thread = controller.start_ws_thread()
    _ws_thread.start()

    logger.info("Starting QApplication")
    app.exec()

    logger.info("QApplication done")
    _ws_thread.join()


if __name__ == "__main__":
    main()
