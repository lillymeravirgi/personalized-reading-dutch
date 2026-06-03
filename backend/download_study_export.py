from __future__ import annotations

import argparse
import datetime
import os
from pathlib import Path
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent


def read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env_value(name: str, env_file_values: dict[str, str], default: str = "") -> str:
    return os.getenv(name) or env_file_values.get(name, default)


def build_export_url(api_base_url: str) -> str:
    return f"{api_base_url.rstrip('/')}/experiment/export"


def validate_online_api_base_url(api_base_url: str) -> str:
    value = api_base_url.strip().rstrip("/")
    if not value:
        raise ValueError("Missing EXPORT_API_BASE_URL. Use the online backend API URL.")

    parsed = urlparse(value)
    if parsed.scheme != "https":
        raise ValueError("EXPORT_API_BASE_URL must use the online https backend URL.")
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("EXPORT_API_BASE_URL must not point to a local backend.")

    return value


def filename_from_headers(headers) -> str:
    disposition = headers.get("Content-Disposition", "")
    marker = "filename="
    if marker in disposition:
        filename = disposition.split(marker, 1)[1].strip().strip('"')
        if filename:
            return filename

    timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
    return f"leeswijs-study-export-{timestamp}.zip"


def download_export(api_base_url: str, token: str, output_dir: Path) -> Path:
    request = Request(
        build_export_url(api_base_url),
        headers={"X-Export-Token": token},
    )
    with urlopen(request, timeout=60) as response:
        filename = filename_from_headers(response.headers)
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / filename
        output_path.write_bytes(response.read())
    return output_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Download the LeesWijs study export zip.")
    parser.add_argument(
        "--api-base-url",
        help="Online backend API base URL ending in /api. Defaults to EXPORT_API_BASE_URL.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for the downloaded zip. Defaults to backend/exports.",
    )
    args = parser.parse_args()

    env_file_values = read_env_file(ROOT / ".env")
    raw_api_base_url = args.api_base_url or env_value("EXPORT_API_BASE_URL", env_file_values)
    token = env_value("EXPORT_TOKEN", env_file_values)
    output_dir = Path(args.output_dir or env_value("EXPORT_OUTPUT_DIR", env_file_values, str(ROOT / "exports")))

    try:
        api_base_url = validate_online_api_base_url(raw_api_base_url)
    except ValueError as exc:
        print(str(exc))
        return 1

    if not token:
        print("Missing EXPORT_TOKEN. Add it to backend/.env or set it in your shell.")
        return 1

    try:
        output_path = download_export(api_base_url, token, output_dir)
    except HTTPError as exc:
        print(f"Export download failed: HTTP {exc.code} {exc.reason}")
        return 1
    except URLError as exc:
        print(f"Export download failed: {exc.reason}")
        return 1

    print(f"Downloaded study export to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
