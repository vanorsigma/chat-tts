import csv
import urllib.request
import zipfile
import tempfile
import concurrent.futures
import time
import subprocess
from pathlib import Path

def download_file(row: list[str], tmp_path: Path) -> str | None:
    if len(row) < 2:
        return None

    file_name, download_url = row[0].strip(), row[1].strip()
    target_file = tmp_path / file_name
    tries = 0

    while tries < 5:
        try:
            print(f"Downloading {file_name}...")
            urllib.request.urlretrieve(download_url, target_file)
            return file_name
        except Exception as e:
            print(f"Failed to download {file_name}: {e}, retrying in 1 second")
            time.sleep(1)
    return None

def main(csv_filename: str) -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_path = Path(tmp_dir)
        print(f"Working in temporary directory: {tmp_path}")

        try:
            with open(csv_filename, mode='r', encoding='utf-8') as f:
                rows = list(csv.reader(f))
        except FileNotFoundError:
            print(f"Error: {csv_filename} not found.")
            return

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            executor.map(lambda r: download_file(r, tmp_path), rows)

        target_zip = tmp_path / "kiki.zip"

        # reassemble everything
        subprocess.run(
            f"cat {tmp_path}/kiki.zip.part* > {target_zip}",
            shell=True,
            check=True,
        )

        extract_to = "./"

        print("Extracting kiki.zip...")
        subprocess.run(
            ["unzip", str(target_zip), "-d", extract_to],
            check=True,
            capture_output=True
        )
        print(f"Success. Files extracted to: {extract_to}")


if __name__ == "__main__":
    main("./kikidownloads.csv")
