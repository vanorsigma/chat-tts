import asyncio
from typing import Any

import mss.tools

from pydantic_ai import BinaryContent, Tool
from pydantic_ai.exceptions import ModelRetry

from config import MakiConfig

_OVERLAY_HIDE_DELAY_S = 0.15


async def _grim_capture(monitor: str) -> bytes:
    try:
        proc = await asyncio.create_subprocess_exec(
            "grim",
            "-t",
            "ppm",
            "-o",
            monitor,
            "-",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as e:
        raise ModelRetry("grim is not installed; Wayland screenshots require it") from e

    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip()
        raise ModelRetry(f"grim failed to capture monitor '{monitor}': {detail}")
    return stdout


def _parse_ppm(data: bytes) -> tuple[int, int, bytes]:
    try:
        magic, dims, maxval, pixels = data.split(b"\n", 3)
        width_str, height_str = dims.split()
        width, height = int(width_str), int(height_str)
    except ValueError as e:
        raise RuntimeError("grim returned malformed PPM data") from e

    if magic != b"P6" or maxval != b"255":
        raise RuntimeError("grim returned an unexpected PPM format")
    if len(pixels) != width * height * 3:
        raise RuntimeError("grim returned a truncated PPM image")
    return width, height, pixels


def _crop(
    rgb: bytes, source_width: int, x: int, y: int, width: int, height: int
) -> bytes:
    stride = source_width * 3
    start = x * 3
    end = start + width * 3
    return b"".join(
        rgb[row * stride + start : row * stride + end] for row in range(y, y + height)
    )


class ScreenshotTool:
    def __init__(self, config: MakiConfig, communication) -> None:
        self.monitor = config.screenshot_monitor
        self.communication = communication

    async def screenshot(
        self,
        x: int | None = None,
        y: int | None = None,
        width: int | None = None,
        height: int | None = None,
    ) -> Any:
        """Captures a screenshot of the current screen and returns it as an image.

        Args:
            x: Optional horizontal start pixel for cropping (relative to the display's origin)
            y: Optional vertical start pixel for cropping (relative to the display's origin)
            width: Optional width of the crop region in pixels
            height: Optional height of the crop region in pixels

        Returns:
            An image of the captured screen area.
        """

        def _process(ppm: bytes) -> bytes:
            mon_w, mon_h, rgb = _parse_ppm(ppm)

            crop_x = x if x is not None else 0
            crop_y = y if y is not None else 0
            crop_w = width if width is not None else mon_w - crop_x
            crop_h = height if height is not None else mon_h - crop_y

            if (
                crop_x < 0
                or crop_y < 0
                or crop_w <= 0
                or crop_h <= 0
                or crop_x + crop_w > mon_w
                or crop_y + crop_h > mon_h
            ):
                raise ModelRetry(
                    f"Crop region {crop_w}x{crop_h} at ({crop_x},{crop_y}) is outside "
                    f"the {mon_w}x{mon_h} display"
                )

            if (crop_x, crop_y, crop_w, crop_h) != (0, 0, mon_w, mon_h):
                rgb = _crop(rgb, mon_w, crop_x, crop_y, crop_w, crop_h)

            png = mss.tools.to_png(rgb, (crop_w, crop_h))
            if png is None:
                raise RuntimeError("mss.tools.to_png returned None")
            print(
                f"[SCREENSHOT] Captured {self.monitor}: {crop_w}x{crop_h} at "
                f"({crop_x},{crop_y}), PNG size={len(png)} bytes"
            )
            return png

        await self.communication.set_screenshot_mode(True)
        try:
            await asyncio.sleep(_OVERLAY_HIDE_DELAY_S)
            ppm = await _grim_capture(self.monitor)
            png_bytes = await asyncio.to_thread(_process, ppm)
        except ModelRetry:
            raise
        except Exception as e:
            print(f"[SCREENSHOT] Capture failed: {e}")
            raise ModelRetry(f"Screenshot failed: {e}") from e
        finally:
            await self.communication.set_screenshot_mode(False)

        return BinaryContent(png_bytes, media_type="image/png")

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.screenshot, takes_ctx=False),
        ]
