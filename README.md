# 和姐姐的点滴

一个不依赖后端的静态情侣纪念网站。包含暗号登录、恋爱天数动态计算、中美节日与生日祝福、逐页图集、带封面的合页本式回忆录、文件夹音乐播放列表，以及 GitHub Pages 自动部署流水线。

## 本地运行（Linux）

```bash
cd love-story-website
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
./scripts/serve.sh 8080
```

浏览器打开 `http://127.0.0.1:8080`。`serve.sh` 会先扫描音乐文件夹、生成播放清单并执行完整检查。不要直接双击 `site/index.html`，因为浏览器通常不允许 `file://` 页面读取 JSON 和 TXT 文件。

当前暗号：

- 用户名：`李晓熙`
- 昵称：`姐姐`
- 密码：`20040709+20260404`

## 日常更新

### 更新背景音乐

把音乐文件放入：

```text
site/assets/music/
```

建议用数字前缀控制播放顺序：

```text
01-第一首.mp3
02-第二首.mp3
03-第三首.ogg
```

播放器会依次播放；最后一首结束后自动回到第一首。支持的清单格式包括 MP3、OGG、OGA、M4A、AAC、WAV、FLAC 和 WebM，但为了浏览器兼容性，优先使用 MP3、OGG 或 M4A。

手动生成清单：

```bash
python3 tools/update_music.py --site site
```

生成结果位于 `site/data/music.json`。可在其中修改歌曲显示名称与作者；再次执行脚本时，同一路径的自定义文字会保留。浏览器不能直接枚举静态文件夹，因此这个清单文件是前端读取音乐目录所必需的。`serve.sh` 和 GitHub Actions 流水线都会自动执行生成脚本。

### 更新回忆录封面与正文

- 封面文字：编辑 `site/data/memoir-cover.txt`
- 正文：编辑 `site/data/memoir.txt`

正文中，每两个空行之间的内容会成为一页。打开回忆录时先显示封面，点击“打开回忆录”后进入正文；正文第一页的“回到封面”可以重新合上书。

### 更新图集

图集标题、说明和顺序在 `site/data/album.json`。图片文件放在 `site/assets/photos/`，`src` 使用相对路径，例如 `assets/photos/01-hand.webp`。

批量加入新照片：

```bash
source .venv/bin/activate
python3 tools/update_album.py --input /你的/新照片目录 --site site --append
python3 tools/check_site.py
```

脚本会按 EXIF/文件名时间排序，把短时间内且视觉相近的连拍归为一组，选择清晰度较高的一张，转为 WebP，再追加到 `album.json`。预览选择而不写文件：

```bash
python3 tools/update_album.py --input /你的/照片目录 --site site --dry-run
```

完整修改说明见 [EDITING_GUIDE.md](EDITING_GUIDE.md)。

## 部署到 GitHub Pages

1. 在 GitHub 新建仓库，例如 `love-story`。
2. 把本目录内容推送到 `main` 分支。
3. 进入仓库 **Settings → Pages → Build and deployment**，将 Source 设为 **GitHub Actions**。
4. `.github/workflows/deploy-pages.yml` 会自动扫描音乐文件夹、检查内容并部署 `site/`。
5. 默认网址为 `https://<你的GitHub用户名>.github.io/love-story/`。

首次推送示例：

```bash
git init
git branch -M main
git add .
git commit -m "Update our love story website"
git remote add origin git@github.com:<你的GitHub用户名>/love-story.git
git push -u origin main
```

## 隐私与“登录”的边界

这是纯前端静态网站。用户名、昵称、密码、照片、回忆录和音乐都会随网站文件下发给浏览器；登录界面只能作为浪漫的入口，不能提供真正的访问控制。公开 GitHub Pages 仓库意味着任何人都可能直接访问这些资源。涉及隐私时，应使用受控的私有托管或增加真正的服务端认证。

## 浏览器自动播放限制

网站会尝试自动播放音乐，但多数浏览器会在用户尚未操作页面时拦截声音。此时右上角会出现提示；点击页面、完成登录或点击音乐按钮即可开始。暂停后不会自动跳到下一首；重新播放会从当前歌曲位置继续。
