import numpy as np
from monte_carlo import generate_valid_board_given_misses_and_hits, remove_ship_info, step_monte_carlo

def generate_board(ships):
    temp_board = np.zeros((10, 10), dtype=int)
    valid = generate_valid_board_given_misses_and_hits(
        temp_board, np.zeros((10, 10), dtype=int), np.zeros((10, 10), dtype=int), ships
    )
    if not valid:
        raise RuntimeError("Something is invalid panic aaaa")

    fixed_board = remove_ship_info(temp_board)
    return fixed_board


class BattleshipEnv:
    def __init__(self):
        self.ships = [5, 4, 3, 3, 2]
        self.reset()

    def reset(self):
        self.rl_true = generate_board(self.ships)
        self.mc_true = generate_board(self.ships)

        self.rl_view = np.zeros((3, 10, 10), dtype=np.float32)
        self.rl_view[0] = 1.0

        self.mc_view = np.zeros((3, 10, 10), dtype=np.float32)
        self.mc_view[0] = 1.0

        self.rl_hits_count = 0
        self.mc_hits_count = 0
        self.total_ship_tiles = sum(self.ships)
        self.done = False

        return self._get_state()

    def _get_state(self):
        return self.rl_view.copy()

    def step(self, action_idx):
        if self.done:
            raise RuntimeError("Episode is done, call reset()")
        y, x = divmod(action_idx, 10)

        reward = 0.0
        if self.rl_view[1, y, x] == 1.0 or self.rl_view[2, y, x] == 1.0:
            # penalty for illegal move
            return self._get_state(), -10.0, True, {"result": "illegal_move"}

        self.rl_view[0, y, x] = 0.0
        if self.mc_true[y, x] == 1:
            self.rl_view[2, y, x] = 1.0
            self.rl_hits_count += 1
            reward += 2.0
        else:
            self.rl_view[1, y, x] = 1.0
            reward -= 0.1

        if self.rl_hits_count == self.total_ship_tiles:
            self.done = True
            reward += 50.0
            return self._get_state(), reward, True, {"result": "rl_win"}


        mc_misses = self.mc_view[1]
        mc_hits = self.mc_view[2]

        mc_pdf = step_monte_carlo(mc_misses, mc_hits, self.ships)
        mc_action_idx = np.argmax(mc_pdf)

        mc_y, mc_x = divmod(mc_action_idx, 10)

        self.mc_view[0, mc_y, mc_x] = 0.0
        if self.rl_true[mc_y, mc_x] == 1:
            self.mc_view[2, mc_y, mc_x] = 1.0
            self.mc_hits_count += 1
        else:
            self.mc_view[1, mc_y, mc_x] = 1.0

        if self.mc_hits_count == self.total_ship_tiles:
            self.done = True
            reward -= 50.0
            return self._get_state(), reward, True, {"result": "mc_win"}

        return self._get_state(), reward, False, {"result": "ongoing"}
