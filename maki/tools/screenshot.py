import asyncio
from typing import Any

import mss
import mss.tools

from pydantic_ai import BinaryContent, Tool
from pydantic_ai.exceptions import ModelRetry


class ScreenshotTool:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        section = config.get("screenshot", {})
        self.default_display = int(section.get("display", "1"))

    async def screenshot(
        self,
        display: int | None = None,
        x: int | None = None,
        y: int | None = None,
        width: int | None = None,
        height: int | None = None,
    ) -> Any:
        """Captures a screenshot of the current screen and returns it as an image.

        Args:
            display: Monitor index to capture (0 = all monitors combined, 1 = primary display, default from config)
            x: Optional horizontal start pixel for cropping (relative to the selected display's origin)
            y: Optional vertical start pixel for cropping (relative to the selected display's origin)
            width: Optional width of the crop region in pixels
            height: Optional height of the crop region in pixels

        Returns:
            An image of the captured screen area.
        """

        def _grab() -> bytes:
            with mss.mss() as sct:
                monitors = sct.monitors

                idx = self.default_display if display is None else display
                if idx < 0 or idx >= len(monitors):
                    raise ModelRetry(
                        f"Invalid display index {idx}. Available monitors: "
                        f"0..{len(monitors) - 1} (0 = all monitors, 1 = primary)"
                    )

                monitor = monitors[idx]
                left = monitor["left"]
                top = monitor["top"]
                mon_w = monitor["width"]
                mon_h = monitor["height"]

                crop_left = left + (x if x is not None else 0)
                crop_top = top + (y if y is not None else 0)
                crop_w = width if width is not None else mon_w
                crop_h = height if height is not None else mon_h

                bbox = {
                    "left": crop_left,
                    "top": crop_top,
                    "width": crop_w,
                    "height": crop_h,
                }

                if crop_w <= 0 or crop_h <= 0:
                    raise ModelRetry(
                        f"Crop dimensions must be positive, got width={crop_w} height={crop_h}"
                    )

                shot = sct.grab(bbox)
                png = mss.tools.to_png(shot.rgb, shot.size)
                if png is None:
                    raise RuntimeError("mss.tools.to_png returned None")
                return png

        try:
            png_bytes = await asyncio.to_thread(_grab)
        except ModelRetry:
            raise
        except Exception as e:
            raise ModelRetry(f"Screenshot failed: {e}") from e

        return BinaryContent(png_bytes, media_type="image/png")

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.screenshot, takes_ctx=False),
        ]
