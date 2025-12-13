"""
Random tool
"""

import random

from pydantic_ai import RunContext, Tool

def get_random(a: int, b: int) -> int:
    """Gets a random number

    Args:
       a: start number for random number generation
       b: end number for random number generation
    """
    random_number = random.randint(a, b)
    print('[TOOL] Generated random number: ', random_number)
    return random_number

random_tools = [
    Tool(get_random, takes_ctx=False),
]
