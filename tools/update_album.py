#!/usr/bin/env python3
"""Scan a photo folder, group burst/near-duplicate images, optimise representatives, and update album.json."""
from __future__ import annotations
import argparse, json, re
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageFilter, ImageOps, ImageStat

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff'}

def parse_args():
    p = argparse.ArgumentParser(description='更新静态图集的数据和 WebP 图片')
    p.add_argument('--input', required=True, type=Path, help='照片目录')
    p.add_argument('--site', type=Path, default=Path('site'), help='site 目录，默认 ./site')
    mode = p.add_mutually_exclusive_group()
    mode.add_argument('--append', action='store_true', help='追加到现有图集（默认）')
    mode.add_argument('--replace', action='store_true', help='用本次扫描结果替换图集')
    p.add_argument('--keep-all', action='store_true', help='不做近似图片去重')
    p.add_argument('--burst-gap', type=float, default=8.0, help='连拍分组的最大时间差（秒）')
    p.add_argument('--hash-threshold', type=int, default=13, help='dHash 汉明距离阈值，越大越容易合并')
    p.add_argument('--max-size', type=int, default=1800, help='输出图片最长边')
    p.add_argument('--quality', type=int, default=86, help='WebP 质量 1-100')
    p.add_argument('--dry-run', action='store_true', help='只展示选择结果，不写文件')
    return p.parse_args()

def image_time(path: Path) -> datetime:
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            raw = exif.get(36867) or exif.get(306)
            if raw:
                return datetime.strptime(str(raw), '%Y:%m:%d %H:%M:%S')
    except Exception:
        pass
    match = re.search(r'(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})', path.stem)
    if match:
        return datetime(*map(int, match.groups()))
    return datetime.fromtimestamp(path.stat().st_mtime)

def dhash(path: Path, size: int = 8) -> int:
    with Image.open(path) as im:
        gray = ImageOps.exif_transpose(im).convert('L').resize((size + 1, size), Image.Resampling.LANCZOS)
        getter = getattr(gray, 'get_flattened_data', gray.getdata)
        pixels = list(getter())
    value = 0
    for y in range(size):
        for x in range(size):
            value = (value << 1) | int(pixels[y * (size + 1) + x] > pixels[y * (size + 1) + x + 1])
    return value

def sharpness(path: Path) -> float:
    with Image.open(path) as im:
        gray = ImageOps.exif_transpose(im).convert('L')
        gray.thumbnail((700, 700), Image.Resampling.LANCZOS)
        return float(ImageStat.Stat(gray.filter(ImageFilter.FIND_EDGES)).var[0])

def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()

def group_candidates(records, gap, threshold):
    groups = []
    for record in records:
        if not groups:
            groups.append([record]); continue
        previous = groups[-1][-1]
        seconds = abs((record['time'] - previous['time']).total_seconds())
        if seconds <= gap and hamming(record['hash'], previous['hash']) <= threshold:
            groups[-1].append(record)
        else:
            groups.append([record])
    return groups

def unique_target(base: str, folder: Path) -> Path:
    target = folder / f'{base}.webp'
    n = 2
    while target.exists():
        target = folder / f'{base}-{n}.webp'; n += 1
    return target

def optimise(source: Path, target: Path, max_size: int, quality: int):
    with Image.open(source) as im:
        im = ImageOps.exif_transpose(im).convert('RGB')
        im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        im.save(target, 'WEBP', quality=quality, method=6)

def main():
    args = parse_args()
    source_dir = args.input.expanduser().resolve()
    site = args.site.expanduser().resolve()
    photos_dir = site / 'assets/photos'
    data_file = site / 'data/album.json'
    if not source_dir.is_dir(): raise SystemExit(f'照片目录不存在：{source_dir}')
    files = sorted(p for p in source_dir.rglob('*') if p.is_file() and p.suffix.lower() in EXTENSIONS)
    if not files: raise SystemExit('没有找到受支持的图片。')
    records = []
    for path in files:
        try:
            records.append({'path': path, 'time': image_time(path), 'hash': dhash(path), 'sharpness': sharpness(path)})
        except Exception as exc:
            print(f'跳过 {path.name}: {exc}')
    records.sort(key=lambda r: r['time'])
    groups = [[r] for r in records] if args.keep_all else group_candidates(records, args.burst_gap, args.hash_threshold)
    selected = [max(group, key=lambda r: r['sharpness']) for group in groups]
    print(f'扫描 {len(records)} 张，分为 {len(groups)} 组，选择 {len(selected)} 张代表图。')
    for group, chosen in zip(groups, selected):
        suffix = f'（从 {len(group)} 张近似图片中选择）' if len(group) > 1 else ''
        print(f"  {chosen['time']:%Y-%m-%d %H:%M:%S}  {chosen['path'].name} {suffix}")
    if args.dry_run: return
    photos_dir.mkdir(parents=True, exist_ok=True)
    existing = []
    if data_file.exists() and not args.replace:
        payload = json.loads(data_file.read_text(encoding='utf-8'))
        existing = payload if isinstance(payload, list) else payload.get('items', [])
    if args.replace:
        for path in photos_dir.glob('*.webp'): path.unlink()
    existing_originals = {item.get('original') for item in existing}
    new_items = []
    for record in selected:
        source = record['path']
        if source.name in existing_originals:
            print(f'已存在，跳过：{source.name}'); continue
        stamp = record['time'].strftime('%Y%m%d-%H%M%S')
        clean = re.sub(r'[^A-Za-z0-9_-]+', '-', source.stem).strip('-').lower()[:50] or 'photo'
        target = unique_target(f'{stamp}-{clean}', photos_dir)
        optimise(source, target, args.max_size, args.quality)
        iso = record['time'].isoformat(timespec='seconds')
        new_items.append({
            'id': f'memory-{stamp}-{len(new_items)+1:02d}',
            'src': f'assets/photos/{target.name}',
            'original': source.name,
            'timestamp': iso,
            'title': record['time'].strftime('%Y年%m月%d日'),
            'caption': '这一刻，也值得被好好记住。',
            'alt': '我们的照片',
        })
    items = (existing + new_items) if not args.replace else new_items
    items.sort(key=lambda item: item.get('timestamp', ''))
    payload = {'updatedAt': datetime.now().date().isoformat(), 'items': items}
    data_file.parent.mkdir(parents=True, exist_ok=True)
    data_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'已写入 {data_file}，新增 {len(new_items)} 页。')
    print('下一步：编辑 data/album.json 中每一项的 title、caption 和 alt。')
if __name__ == '__main__': main()
