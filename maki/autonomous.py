import asyncio
import random


class AutonomousTimer:
    MEAN_S = 900
    SD_S = 300
    MIN_S = 1
    MAX_S = 1800

    def sample_delay(self) -> int:
        return max(self.MIN_S, min(self.MAX_S, int(random.gauss(self.MEAN_S, self.SD_S))))

    async def wait(self) -> None:
        delay = self.sample_delay()
        print(f"[AUTONOMOUS] Timer set for {delay}s ({delay/60:.1f} min)")
        await asyncio.sleep(delay)
