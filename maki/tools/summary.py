from pydantic_ai import Tool


class StreamSummary:
    def __init__(self) -> None:
        self._latest: str | None = None

    def on_summary(self, msg: dict) -> None:
        text = msg.get("text")
        if isinstance(text, str) and text:
            self._latest = text

    def get_latest_summary(self) -> str:
        """General Tool: Reads the summariser's latest summary of the stream so far.

        Returns:
            str: The most recent summary of what has happened on stream, or a note that none exists yet.
        """
        if self._latest is None:
            return "No stream summary is available yet."
        return self._latest

    def get_tools(self) -> list[Tool]:
        return [Tool(self.get_latest_summary, takes_ctx=False)]

