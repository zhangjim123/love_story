#!/usr/bin/env python3
"""Scan site/assets/music and rebuild site/data/music.json.

Static websites cannot enumerate a directory in the browser. This script creates the
small manifest consumed by site/js/app.js. Existing title/artist values are retained
when the corresponding file path still exists.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

AUDIO_EXTENSIONS = {".mp3", ".ogg", ".oga", ".m4a", ".aac", ".wav", ".flac", ".webm"}


def natural_key(value: str) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", value)]


def clean_title(stem: str) -> tuple[str, str]:
    """Return (title, artist), supporting filenames such as '01-Artist - Song.mp3'."""
    cleaned = re.sub(r"^\d+[\s._-]+", "", stem).replace("_", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -._")
    if " - " in cleaned:
        artist, title = (part.strip() for part in cleaned.split(" - ", 1))
        if artist and title:
            return title, artist
    return cleaned or "背景音乐", ""


def read_existing(path: Path) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    tracks = payload if isinstance(payload, list) else payload.get("tracks", [])
    if not isinstance(tracks, list):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for item in tracks:
        if isinstance(item, dict) and item.get("src"):
            result[str(item["src"])] = dict(item)
    return result


def build_playlist(site: Path) -> list[dict[str, Any]]:
    music_dir = site / "assets" / "music"
    manifest = site / "data" / "music.json"
    music_dir.mkdir(parents=True, exist_ok=True)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    existing = read_existing(manifest)

    files = sorted(
        (
            path for path in music_dir.iterdir()
            if path.is_file() and not path.name.startswith(".") and path.suffix.casefold() in AUDIO_EXTENSIONS
        ),
        key=lambda path: natural_key(path.name),
    )

    tracks: list[dict[str, Any]] = []
    for path in files:
        src = path.relative_to(site).as_posix()
        old = existing.get(src, {})
        generated_title, generated_artist = clean_title(path.stem)
        track: dict[str, Any] = {
            "src": src,
            "title": str(old.get("title") or generated_title).strip(),
            "artist": str(old.get("artist") or generated_artist).strip(),
        }
        # Preserve optional custom fields for future extensions without affecting playback.
        for key, value in old.items():
            if key not in track:
                track[key] = value
        tracks.append(track)
    return tracks


def main() -> int:
    parser = argparse.ArgumentParser(description="根据音乐文件夹生成循环播放清单")
    parser.add_argument("--site", default="site", help="静态站点目录，默认 site")
    parser.add_argument("--dry-run", action="store_true", help="只预览，不写入 music.json")
    args = parser.parse_args()

    site = Path(args.site).expanduser().resolve()
    if not site.is_dir():
        print(f"站点目录不存在：{site}", file=sys.stderr)
        return 2

    tracks = build_playlist(site)
    if not tracks:
        print(
            f"未在 {site / 'assets' / 'music'} 找到可播放文件。支持："
            + ", ".join(sorted(AUDIO_EXTENSIONS)),
            file=sys.stderr,
        )
        return 1

    payload = {"tracks": tracks}
    output = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    if args.dry_run:
        print(output, end="")
        return 0

    manifest = site / "data" / "music.json"
    manifest.write_text(output, encoding="utf-8")
    print(f"已生成 {manifest}：{len(tracks)} 首音乐，按文件名自然排序并循环播放。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
