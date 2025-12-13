"""
Search Tool
"""

import aiohttp

from pydantic_ai import RunContext, Tool

class SearchTool:
    def __init__(self, config: dict[str, dict[str, str]]) -> None:
        self.api_key = config['search']['api_key']

    async def search(self, query: str) -> str:
        """Searches the internet for a particular query

        Args:
            query: the natural language query to search for

        Returns:
            str: JSON response (in string format)
        """
        url = "https://api.search.brave.com/res/v1/web/search"
        print("[SEARCH] Search tool called")
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url, headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "X-Subscription-Token": self.api_key
                }, params={
                        'q': query
                }) as response:
                    response.raise_for_status()
                    data = await response.json()
                    print(f"[SEARCH] Returned {data}")
                    return str(data)

            except aiohttp.ClientResponseError as e:
                print(f"[SEARCH] HTTP Error: {e.status} - {e.message}")
                return 'search error'
            except Exception as e:
                print(f"[SEARCH] An error occurred: {str(e)}")
                return 'search error'

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.search, takes_ctx=False),
        ]
