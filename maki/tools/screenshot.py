import asyncio
import json
from typing import Any

from pydantic_ai import BinaryContent, Tool
from pydantic_ai.exceptions import ModelRetry

from config import MakiConfig

_OVERLAY_HIDE_DELAY_S = 0.15


async def _monitor_geometry(monitor: str) -> tuple[int, int, int, int] | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "hyprctl",
            "monitors",
            "-j",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            async with asyncio.timeout(5):
                stdout, _ = await proc.communicate()
        except TimeoutError:
            proc.kill()
            await proc.wait()
            return None

        if proc.returncode != 0:
            return None

        entry = next(
            (item for item in json.loads(stdout) if item.get("name") == monitor),
            None,
        )
        if entry is None:
            return None

        width = int(entry["width"])
        height = int(entry["height"])
        if int(entry.get("transform", 0)) in (1, 3, 5, 7):
            width, height = height, width
        scale = float(entry.get("scale", 1)) or 1.0
        return (
            int(entry["x"]),
            int(entry["y"]),
            round(width / scale),
            round(height / scale),
        )
    except (AttributeError, KeyError, OSError, TypeError, ValueError):
        return None


async def _grim_capture(
    monitor: str, geometry: tuple[int, int, int, int] | None
) -> bytes:
    args = ["grim", "-s", "1", "-t", "png"]
    if geometry is None:
        args += ["-o", monitor]
    else:
        x, y, width, height = geometry
        args += ["-g", f"{x},{y} {width}x{height}"]
    args.append("-")

    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as e:
        raise ModelRetry("grim is not installed; Wayland screenshots require it") from e
    except OSError as e:
        raise ModelRetry(f"grim could not start: {e}") from e

    try:
        async with asyncio.timeout(10):
            stdout, stderr = await proc.communicate()
    except TimeoutError as e:
        proc.kill()
        await proc.wait()
        raise ModelRetry("grim timed out capturing the screen") from e

    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip()
        raise ModelRetry(f"grim failed to capture monitor '{monitor}': {detail}")
    return stdout


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

        capture_geometry: tuple[int, int, int, int] | None = None
        region = "full monitor"

        if x is not None or y is not None or width is not None or height is not None:
            monitor_geometry = await _monitor_geometry(self.monitor)
            if monitor_geometry is None:
                raise ModelRetry(
                    f"Cannot resolve the layout geometry of '{self.monitor}' to crop"
                )

            origin_x, origin_y, monitor_w, monitor_h = monitor_geometry

            crop_x = x if x is not None else 0
            crop_y = y if y is not None else 0
            crop_w = width if width is not None else monitor_w - crop_x
            crop_h = height if height is not None else monitor_h - crop_y

            if (
                crop_x < 0
                or crop_y < 0
                or crop_w <= 0
                or crop_h <= 0
                or crop_x + crop_w > monitor_w
                or crop_y + crop_h > monitor_h
            ):
                raise ModelRetry(
                    f"Crop region {crop_w}x{crop_h} at ({crop_x},{crop_y}) is outside "
                    f"the {monitor_w}x{monitor_h} display"
                )

            capture_geometry = (
                origin_x + crop_x,
                origin_y + crop_y,
                crop_w,
                crop_h,
            )
            region = f"{crop_w}x{crop_h} at ({crop_x},{crop_y})"

        await self.communication.set_screenshot_mode(True)
        try:
            await asyncio.sleep(_OVERLAY_HIDE_DELAY_S)
            png = await _grim_capture(self.monitor, capture_geometry)
        except ModelRetry:
            raise
        except Exception as e:
            print(f"[SCREENSHOT] Capture failed: {e}")
            raise ModelRetry(f"Screenshot failed: {e}") from e
        finally:
            await self.communication.set_screenshot_mode(False)

        print(
            f"[SCREENSHOT] Captured {self.monitor}: {region}, "
            f"PNG size={len(png)} bytes"
        )
        return BinaryContent(png, media_type="image/png")

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.screenshot, takes_ctx=False),
        ]
