# 内容修改指南

## 1. 修改登录信息、纪念日、生日和音量

编辑 `site/data/config.json`：

- `credentials.username`：用户名
- `credentials.nickname`：昵称
- `credentials.password`：密码
- `relationshipStart`：在一起的日期，格式 `YYYY-MM-DD`
- `inclusiveDays`：`true` 表示开始当天算第 1 天；`false` 表示开始当天算第 0 天
- `birthday`：生日，格式 `MM-DD`
- `music.volume`：音乐音量，范围 0 到 1

JSON 不能有尾随逗号。

## 2. 管理背景音乐文件夹

音乐目录：

```text
site/assets/music/
```

播放器按文件名的自然顺序播放，播完最后一首后回到第一首。推荐使用如下命名：

```text
01-Edward Elgar - 爱的致意.mp3
02-第二首音乐.mp3
03-第三首音乐.ogg
```

数字前缀只用于排序。新文件的显示名称会从文件名生成；若文件名采用“作者 - 曲名”，脚本会自动拆分作者和曲名。

更新播放清单：

```bash
python3 tools/update_music.py --site site
```

预览清单而不写文件：

```bash
python3 tools/update_music.py --site site --dry-run
```

脚本会生成 `site/data/music.json`：

```json
{
  "tracks": [
    {
      "src": "assets/music/01-salut-damour.mp3",
      "title": "爱的致意（Salut d’Amour）",
      "artist": "Edward Elgar"
    }
  ]
}
```

可直接修改 `title` 和 `artist`。再次执行脚本时，只要 `src` 未变化，这些自定义文字会保留。删除音乐文件后再次执行脚本，对应条目会自动移除。

支持清单格式：`.mp3`、`.ogg`、`.oga`、`.m4a`、`.aac`、`.wav`、`.flac`、`.webm`。实际解码能力取决于浏览器；部署时优先使用 MP3、OGG 或 M4A。

`./scripts/serve.sh` 和 GitHub Pages 流水线会自动运行该脚本，因此直接向音乐目录增加文件后也能部署。若需要自定义新歌曲的显示名称，先在本地生成 `music.json`、修改文字，再一并提交。

## 3. 修改回忆录封面

直接编辑：

```text
site/data/memoir-cover.txt
```

文件使用 UTF-8。单个换行会在封面中保留，例如：

```text
我们的回忆录

这里写属于你们的封面文字。
可以写多行。
```

网页打开回忆录模块后会先显示这个封面，并提供“打开回忆录”按钮。正文第一页的左侧按钮会显示“回到封面”。

## 4. 写回忆录正文

直接编辑 `site/data/memoir.txt`，保存为 UTF-8。一个空行分隔一页：

```text
这是第一页。单个换行仍然属于同一页。
这一行还在第一页。

这是第二页。

这是第三页。
```

网页每次加载都会重新读取该文件，因此提交并部署后会自动显示新内容。

## 5. 修改图集文字

编辑 `site/data/album.json`。每个 `items` 元素对应一页：

```json
{
  "id": "memory-01",
  "src": "assets/photos/01-hand.webp",
  "original": "IMG_20260416_181413.jpg",
  "timestamp": "2026-04-16T18:14:14",
  "title": "牵住你",
  "caption": "这里写这一页的浪漫文字。",
  "alt": "给读屏软件使用的客观图片说明"
}
```

修改 `title` 和 `caption` 即可更换文案；调整元素顺序即可改变翻页顺序。

## 6. 加入或替换照片

少量手工加入：

1. 把图片转为 WebP 后放入 `site/assets/photos/`。
2. 在 `site/data/album.json` 的 `items` 中增加一个对象。
3. 执行 `python3 tools/check_site.py`。

批量加入：

```bash
python3 tools/update_album.py --input ~/Pictures/our-new-photos --site site --append
```

常用参数：

```bash
--burst-gap 8          # 连拍最大间隔秒数
--hash-threshold 13    # 相似阈值，越大越容易判为近似
--max-size 1800        # 输出最长边
--quality 86           # WebP 质量
--keep-all             # 不去重
--replace              # 清空现有 WebP 并重建图集
```

## 7. 修改节日规则

节日计算位于 `site/js/app.js` 的 `getHolidayGreetings()`：

- 固定公历节日在 `fixed` 映射中
- 美国劳动节、感恩节、母亲节、父亲节、总统日、阵亡将士纪念日等按星期规则计算
- 复活节使用公历 Computus 算法计算
- 春节、元宵、端午、七夕、中秋、重阳、腊八、除夕使用浏览器中国农历日历计算
- 清明使用 21 世纪常用近似公式

增加固定日期示例：

```js
['05-20', '520纪念日快乐~']
```

## 8. 更换背景

替换 `site/assets/images/romantic-bg.svg`，或修改 `site/css/styles.css` 中 `body` 的 `background-image`。

## 9. 发布前检查

```bash
python3 tools/update_music.py --site site
python3 tools/check_site.py
./scripts/serve.sh 8080
```

依次测试：错误暗号、正确暗号、音乐暂停与自动换曲、图集首尾按钮、左右滑动、键盘方向键、回忆录封面、打开按钮、正文翻页、回到封面和手机尺寸。
