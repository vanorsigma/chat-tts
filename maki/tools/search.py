"""
Search Tool
"""

import aiohttp

from pydantic_ai import Tool

from config import MakiConfig


class SearchTool:
    def __init__(self, config: MakiConfig) -> None:
        self.api_key = config.search_api_key

    async def search(self, query: str) -> str:
        """Searches the internet for a particular query

        Args:
            query: the natural language query to search for

        Returns:
            str: JSON response (in string format)
        """
        url = "https://api.search.brave.com/res/v1/web/search"
        print(f'[SEARCH] Search tool called: query="{query}"')
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(
                    url,
                    headers={
                        "Accept": "application/json",
                        "Accept-Encoding": "gzip",
                        "X-Subscription-Token": self.api_key,
                    },
                    params={"q": query},
                ) as response:
                    response.raise_for_status()
                    data = await response.json()
                    result_count = len(data.get("web", {}).get("results", []))
                    print(
                        f'[SEARCH] Returned {result_count} results for query="{query}"'
                    )
                    return str(data)

            except aiohttp.ClientResponseError as e:
                print(
                    f'[SEARCH] HTTP Error: {e.status} - {e.message} (query="{query}")'
                )
                return "search error"
            except Exception as e:
                print(f'[SEARCH] An error occurred: {str(e)} (query="{query}")')
                return "search error"

    def get_tools(self) -> list[Tool]:
        return [
            Tool(self.search, takes_ctx=False),
        ]
