import numpy as np
import random

MAX_SIMULATIONS = 10000
MAX_INVALID_SIMULATIONS = 500
MAX_VALID_BOARD_TRY_ATTEMPT = 100
MAX_INDIVIDUAL_RETRY = 50
DEFAULT_SHIPS = [5, 4, 3, 3, 2]
# DEFAULT_SHIPS = [5]

def generate_valid_board_given_misses_and_hits(board, misses, hits, ships):
    # 1. Cannot put ships at where shit has missed
    # 2. Ships cannot overlap
    # 3. all hit tiles must correspond with a ship
    for _ in range(MAX_VALID_BOARD_TRY_ATTEMPT):
        temp_board = np.zeros((10, 10), dtype=int)
        placed_all = True

        for ship in ships:
            placed = False
            for _ in range(MAX_INDIVIDUAL_RETRY):
                orientation = random.randint(0, 1) # 0 = horizontal, 1 = vertical
                if orientation == 0: # horitzontal
                    x, y = random.randint(0, 10 - ship), random.randint(0, 9)
                    slice_x, slice_y = slice(x, x + ship), y # slice() == [::]
                else:
                    x, y = random.randint(0, 9), random.randint(0, 10 - ship)
                    slice_x, slice_y = x, slice(y, y + ship)
                placement_misses = misses[slice_y, slice_x]
                temp_placement_ship_board = temp_board[slice_y, slice_x]

                # if ships are in missed / ships are overlapping, we continue
                if np.any(placement_misses >= 1) or np.any(temp_placement_ship_board >= 1):
                    continue

                temp_board[slice_y, slice_x] = ship
                placed = True
                break

            if not placed:
                placed_all = False
                return False

        if placed_all and np.all(temp_board[hits == 1]) == 1:
            board[:] = temp_board
            return True
    return False

def remove_ship_info(matrix):
    matrix = matrix.copy()
    matrix[matrix >= 1] = 1
    return matrix

def step_monte_carlo(misses, hits, ships):
    pdf = np.zeros((10, 10))
    valid_simulations = 0
    invalid_simulations = 0

    while valid_simulations < MAX_SIMULATIONS:
        temp_board = np.zeros((10, 10), dtype=int)
        valid_board = generate_valid_board_given_misses_and_hits(temp_board, misses, hits, ships)
        temp_board = remove_ship_info(temp_board)

        if not valid_board:
            invalid_simulations += 1
            if invalid_simulations > MAX_INVALID_SIMULATIONS:
                break
            continue

        valid_simulations += 1
        pdf += temp_board

    if valid_simulations == 0:
        pdf[misses == 1.0] = 0.0
        pdf[hits == 1.0] = 0.0
        total = pdf.sum()
        if total > 0:
            pdf /= total
        return pdf

    pdf /= MAX_SIMULATIONS

    pdf[misses == 1.0] = 0.0
    pdf[hits == 1.0] = 0.0

    return pdf
