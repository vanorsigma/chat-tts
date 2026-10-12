import asyncio
import random
import time
from collections import deque

IRC_HOST = "irc.chat.twitch.tv"
IRC_PORT = 6697
RECONNECT_SECONDS = 5


def _parse_privmsg(raw: str) -> tuple[str, str] | None:
    body = raw
    tags: dict[str, str] = {}
    if body.startswith("@"):
        tag_part, _, body = body.partition(" ")
        for item in tag_part.lstrip("@").split(";"):
            if "=" in item:
                key, value = item.split("=", 1)
                tags[key] = value

    if not body.startswith(":"):
        return None
    prefix, _, rest = body[1:].partition(" ")
    command, _, params = rest.partition(" ")
    if command != "PRIVMSG":
        return None
    channel, _, message = params.partition(":")
    if not channel.startswith("#") or not message:
        return None
    user = tags.get("display-name") or prefix.split("!")[0]
    return user, message


class ChatBuffer:
    """Anonymous Twitch IRC connection that keeps a timestamped chat window."""

    def __init__(self, channel: str, window_minutes: int) -> None:
        self.channel = f"#{channel.lstrip('#')}"
        self.nick = f"justinfan{random.randint(10000, 99999)}"
        self.window_minutes = window_minutes
        self.buffer: deque[tuple[float, str, str]] = deque()
        self.reader: asyncio.StreamReader | None = None
        self.writer: asyncio.StreamWriter | None = None
        self._listen_task: asyncio.Task[None] | None = None

    async def connect(self) -> None:
        await self._open()
        self._listen_task = asyncio.create_task(self._listen())

    async def _open(self) -> None:
        print(
            f"[CHAT] Connecting to {IRC_HOST}:{IRC_PORT} as {self.nick} for {self.channel}"
        )
        self.reader, self.writer = await asyncio.open_connection(
            IRC_HOST, IRC_PORT, ssl=True
        )
        self.writer.write(b"CAP REQ :twitch.tv/tags\r\n")
        self.writer.write(f"NICK {self.nick}\r\n".encode())
        self.writer.write(f"JOIN {self.channel}\r\n".encode())
        await self.writer.drain()

    def _prune(self) -> None:
        cutoff = time.monotonic() - self.window_minutes * 60
        while self.buffer and self.buffer[0][0] < cutoff:
            self.buffer.popleft()

    def window(self, minutes: int | None = None) -> str:
        minutes = self.window_minutes if minutes is None else minutes
        cutoff = time.monotonic() - minutes * 60
        return "\n".join(
            f"{user}: {message}" for ts, user, message in self.buffer if ts >= cutoff
        )

    async def _listen(self) -> None:
        while True:
            try:
                if self.reader is None:
                    raise ConnectionError("no IRC connection")
                while not self.reader.at_eof():
                    line = await self.reader.readline()
                    raw = line.decode("utf-8", errors="ignore").strip()
                    if not raw:
                        continue
                    if raw.startswith("PING"):
                        parts = raw.split(" ", 1)
                        if len(parts) == 2 and self.writer is not None:
                            self.writer.write(f"PONG {parts[1]}\r\n".encode())
                            await self.writer.drain()
                        continue
                    parsed = _parse_privmsg(raw)
                    if parsed is None:
                        continue
                    user, message = parsed
                    self.buffer.append((time.monotonic(), user, message))
                    self._prune()
                raise ConnectionError("IRC stream ended")
            except asyncio.CancelledError:
                raise
            except Exception as e:
                print(
                    f"[CHAT] IRC listener error: {e}; reconnecting in {RECONNECT_SECONDS}s"
                )
                await asyncio.sleep(RECONNECT_SECONDS)
                try:
                    await self._open()
                except Exception as e:
                    print(f"[CHAT] IRC reconnect failed: {e}")

    async def close(self) -> None:
        if self._listen_task:
            self._listen_task.cancel()
            try:
                await self._listen_task
            except asyncio.CancelledError:
                pass
            except Exception as e:
                print(f"[CHAT] IRC listener ended with error: {e}")
        if self.writer:
            self.writer.close()
            try:
                await self.writer.wait_closed()
            except Exception:
                pass
