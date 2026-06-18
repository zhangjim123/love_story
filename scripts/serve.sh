#!/usr/bin/env bash
set -euo pipefail
PORT="${1:-8080}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python3 "$ROOT/tools/update_music.py" --site "$ROOT/site"
python3 "$ROOT/tools/check_site.py"
echo "本地预览：http://127.0.0.1:${PORT}"
echo "按 Ctrl+C 停止。"
exec python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/site"
