把背景音乐文件放在这个目录中。

推荐格式：MP3、OGG 或 M4A。
建议用数字前缀控制顺序，例如：
  01-第一首.mp3
  02-第二首.mp3
  03-第三首.mp3

本地运行和 GitHub Actions 部署时会自动执行 tools/update_music.py，
把本目录中的音乐写入 site/data/music.json。播放器会按文件名顺序播放，
最后一首结束后自动回到第一首。
