import asyncio

import mss.tools
from pydantic_ai import BinaryContent

from .bus import Bus

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
        raise RuntimeError(
            "grim is not installed; Wayland screenshots require it"
        ) from e

    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        detail = stderr.decode(errors="replace").strip()
        raise RuntimeError(f"grim failed to capture monitor '{monitor}': {detail}")
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


def _to_png(ppm: bytes) -> bytes:
    width, height, rgb = _parse_ppm(ppm)
    png = mss.tools.to_png(rgb, (width, height))
    if png is None:
        raise RuntimeError("mss.tools.to_png returned None")
    return png


class Screenshot:
    """Captures the configured monitor with grim, hiding the overlay first."""

    def __init__(self, monitor: str, bus: Bus) -> None:
        self._monitor = monitor
        self._bus = bus

    async def capture(self) -> BinaryContent | None:
        try:
            await self._bus.set_screenshot_mode(True)
            await asyncio.sleep(_OVERLAY_HIDE_DELAY_S)
            ppm = await _grim_capture(self._monitor)
            png = await asyncio.to_thread(_to_png, ppm)
        except Exception as e:
            print(f"[SCREENSHOT] Capture failed: {e}")
            return None
        finally:
            await self._bus.set_screenshot_mode(False)
        print(f"[SCREENSHOT] Captured {len(png)} bytes")
        return BinaryContent(png, media_type="image/png")
