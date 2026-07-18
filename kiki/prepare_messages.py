#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

BOT_USERNAMES = frozenset(
    {
        "vanorgamma",
        "streamelements",
        "nightbot",
        "moobot",
        "supibot",
        "botosc",
        "automod",
        "fossabot",
        "wizebot",
        "deepbot",
        "streamlabs",
    }
)

SYSTEM_PATTERNS = re.compile(
    r"^(connected"
    r"|joined channel"
    r"|disconnected"
    r"|Chat has been cleared by a moderator\.\s*$"
    r"|\w+ cleared the chat\.\s*$"
    r"|\w+ is live!\s*$"
    r"|\w+ has been (timed out|banned).*"
    r"|has been added as a moderator"
    r"|You have added .* as a moderator"
    r"|\w+ modded .*"
    r"|\w+ subscribed.*"
    r"|\w+ cheered.*"
    r"|whisper.*"
    r"|AutoMod:.*"
    r"|\w+ has warned \w+.*"
    r")",
    re.IGNORECASE,
)

AGGRESSIVE_BOT = re.compile(
    r"^~|" r"^(sure!?\s*|here'?s? a|i'?d be happy to|certainly!|absolutely!)",
    re.IGNORECASE,
)


def is_bot_like(msg: str) -> bool:
    if AGGRESSIVE_BOT.match(msg):
        return True
    if len(msg) >= 200 and not re.search(r"[?!]|lol|lmao|\(|@", msg, re.IGNORECASE):
        return True
    return False


def parse_line(line: str, default_date: str) -> dict | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None

    m = re.match(r"^\[(\d{2}:\d{2}:\d{2})\]\s+(.+)", line)
    if not m:
        return None

    time_str, rest = m.group(1), m.group(2)

    colon_pos = rest.find(": ")
    if colon_pos == -1:
        return None

    username = rest[:colon_pos].strip()
    message = rest[colon_pos + 2 :].strip()

    if username.lower() in BOT_USERNAMES:
        return None
    if message and message[0] in ("!", "%"):
        return None
    if is_bot_like(message):
        return None

    return {
        "date": default_date,
        "time": time_str,
        "username": username,
        "message": message,
        "text": f"{username}: {message}",
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Filter Twitch chat logs for distillation"
    )
    parser.add_argument(
        "--logs-dir",
        default=None,
        help="Directory with vanorsigma-*.log files (default: ../kiki/vanorsigma)",
    )
    parser.add_argument("--out", default="messages.json", help="Output JSON path")
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Keep only last N messages chronologically (0 = all)",
    )
    parser.add_argument(
        "--no-aggressive", action="store_true", help="Disable bot-message heuristics"
    )
    parser.add_argument(
        "--keep-bots", action="store_true", help="Keep known bot usernames"
    )
    args = parser.parse_args()

    logs_dir = (
        Path(args.logs_dir)
        if args.logs_dir
        else (Path(__file__).resolve().parent.parent / "kiki" / "vanorsigma")
    )

    if not logs_dir.is_dir():
        print(f"Error: {logs_dir} not found", file=sys.stderr)
        sys.exit(1)

    records: list[dict] = []
    seen: set[tuple[str, str]] = set()

    log_files = sorted(logs_dir.glob("vanorsigma-*.log"))
    if not log_files:
        print(f"No vanorsigma-*.log files in {logs_dir}", file=sys.stderr)
        sys.exit(1)

    for log_path in log_files:
        m = re.search(r"vanorsigma-(\d{4}-\d{2}-\d{2})\.log$", log_path.name)
        date_str = m.group(1) if m else "0000-00-00"

        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            for raw_line in f:
                entry = parse_line(raw_line, date_str)
                if entry is None:
                    continue
                key = (entry["username"].lower(), entry["message"])
                if key in seen:
                    continue
                seen.add(key)
                records.append(entry)

    records.sort(key=lambda r: (r["date"], r["time"]))

    if args.limit > 0 and len(records) > args.limit:
        records = records[-args.limit :]

    print(
        f"Exported {len(records)} messages from {len(log_files)} files -> {args.out}",
        file=sys.stderr,
    )

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
