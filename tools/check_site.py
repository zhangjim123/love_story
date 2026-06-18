#!/usr/bin/env python3
"""Validate the static site before local preview or GitHub Pages deployment."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
AUDIO_EXTENSIONS = {".mp3", ".ogg", ".oga", ".m4a", ".aac", ".wav", ".flac", ".webm"}
errors: list[str] = []


def require(path: Path, min_size: int = 1) -> None:
    if not path.is_file():
        errors.append(f"缺少文件：{path.relative_to(ROOT)}")
        return
    if path.stat().st_size < min_size:
        errors.append(f"文件过小或为空：{path.relative_to(ROOT)}")


def validate_relative_asset(source: str, label: str, min_size: int = 1) -> None:
    path = Path(source)
    if source.startswith("/") or ".." in path.parts:
        errors.append(f"{label} 必须是 site 内相对路径")
        return
    require(SITE / path, min_size)


for rel, size in [
    ("index.html", 1000),
    ("css/styles.css", 1000),
    ("js/app.js", 1000),
    ("data/config.json", 20),
    ("data/album.json", 20),
    ("data/memoir.txt", 1),
    ("data/memoir-cover.txt", 1),
    ("data/music.json", 20),
    ("assets/images/romantic-bg.svg", 100),
    ("assets/images/favicon.svg", 50),
]:
    require(SITE / rel, size)

config: dict = {}
try:
    config = json.loads((SITE / "data/config.json").read_text(encoding="utf-8"))
    for key in ["credentials", "relationshipStart", "birthday", "music"]:
        if key not in config:
            errors.append(f"config.json 缺少 {key}")
    credentials = config.get("credentials", {})
    for key in ["username", "nickname", "password"]:
        if not credentials.get(key):
            errors.append(f"config.json credentials 缺少 {key}")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(config.get("relationshipStart", ""))):
        errors.append("config.json relationshipStart 应为 YYYY-MM-DD")
    if not re.fullmatch(r"\d{2}-\d{2}", str(config.get("birthday", ""))):
        errors.append("config.json birthday 应为 MM-DD")
    volume = config.get("music", {}).get("volume", 0.38)
    if not isinstance(volume, (int, float)) or not 0 <= volume <= 1:
        errors.append("config.json music.volume 应为 0 到 1")
except Exception as exc:
    errors.append(f"config.json 无效：{exc}")

items: list[dict] = []
try:
    payload = json.loads((SITE / "data/album.json").read_text(encoding="utf-8"))
    items = payload if isinstance(payload, list) else payload.get("items", [])
    if not items:
        errors.append("album.json 没有图片条目")
    ids: set[str] = set()
    sources: set[str] = set()
    for index, item in enumerate(items, 1):
        for key in ["id", "src", "timestamp", "title", "caption", "alt"]:
            if not item.get(key):
                errors.append(f"album 第 {index} 项缺少 {key}")
        item_id = str(item.get("id", ""))
        if item_id in ids:
            errors.append(f"album id 重复：{item_id}")
        ids.add(item_id)
        source = str(item.get("src", ""))
        if source in sources:
            errors.append(f"album 图片路径重复：{source}")
        sources.add(source)
        validate_relative_asset(source, f"album 第 {index} 项 src", 1_000)
except Exception as exc:
    errors.append(f"album.json 无效：{exc}")

memoir_path = SITE / "data/memoir.txt"
text = memoir_path.read_text(encoding="utf-8").strip() if memoir_path.exists() else ""
paragraphs = [
    part.strip()
    for part in re.split(r"\n[ \t]*\n+", text.replace("\r\n", "\n").replace("\r", "\n"))
    if part.strip()
]
if not paragraphs:
    errors.append("memoir.txt 没有有效段落")

cover_path = SITE / "data/memoir-cover.txt"
cover_text = cover_path.read_text(encoding="utf-8").strip() if cover_path.exists() else ""
if not cover_text:
    errors.append("memoir-cover.txt 没有封面文字")

tracks: list[dict] = []
try:
    music_payload = json.loads((SITE / "data/music.json").read_text(encoding="utf-8"))
    tracks = music_payload if isinstance(music_payload, list) else music_payload.get("tracks", [])
    if not isinstance(tracks, list) or not tracks:
        errors.append("music.json 没有音乐条目")
        tracks = []
    sources: set[str] = set()
    for index, track in enumerate(tracks, 1):
        if not isinstance(track, dict):
            errors.append(f"music 第 {index} 项必须是对象")
            continue
        source = str(track.get("src", ""))
        title = str(track.get("title", ""))
        if not source:
            errors.append(f"music 第 {index} 项缺少 src")
            continue
        if not title:
            errors.append(f"music 第 {index} 项缺少 title")
        if source in sources:
            errors.append(f"music 音乐路径重复：{source}")
        sources.add(source)
        if Path(source).suffix.casefold() not in AUDIO_EXTENSIONS:
            errors.append(f"music 第 {index} 项格式不在支持列表：{source}")
        validate_relative_asset(source, f"music 第 {index} 项 src", 1_000)

    actual_music = {
        path.relative_to(SITE).as_posix()
        for path in (SITE / "assets" / "music").iterdir()
        if path.is_file() and not path.name.startswith(".") and path.suffix.casefold() in AUDIO_EXTENSIONS
    }
    listed_music = {str(track.get("src", "")) for track in tracks if isinstance(track, dict)}
    for source in sorted(actual_music - listed_music):
        errors.append(f"音乐文件尚未写入 music.json：{source}；请运行 tools/update_music.py")
    for source in sorted(listed_music - actual_music):
        errors.append(f"music.json 引用了不存在的音乐：{source}")
except Exception as exc:
    errors.append(f"music.json 无效：{exc}")

if errors:
    print("检查失败：")
    for error in errors:
        print(" -", error)
    sys.exit(1)

music_size = sum((SITE / track["src"]).stat().st_size for track in tracks) / 1024 / 1024
print(
    f"检查通过：{len(items)} 张图、{len(paragraphs)} 页回忆录、1 个回忆录封面、"
    f"{len(tracks)} 首循环音乐（共 {music_size:.1f} MB）。"
)
