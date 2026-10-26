# 把插画压成移动端用的尺寸，放进 static/（小程序主包只有 2MB，本地图片也不认 webp）。
# 用法（在仓库根目录）：uv run --with pillow python mobile/scripts/export-illustrations.py
# 移动端专用的两张（m-login、m-home-banner）用 site-illustration 技能生成，原图在 ~/.cache/eas-imagegen/，
# 提示词在 mobile/illustrations/prompts/；其余直接取网页端 frontend/src/assets/illustrations/ 里的图。
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "frontend/src/assets/illustrations"
RAW = Path.home() / ".cache/eas-imagegen"
OUT = ROOT / "mobile/static/illustrations"

# (来源, 输出名, 最大宽度)
JOBS = [
    (RAW / "m-login.png", "m-login.jpg", 960),
    (RAW / "m-home-banner.png", "m-home-banner.jpg", 900),
    *[(WEB / f"apply-{k}.webp", f"apply-{k}.jpg", 400) for k in ("purchase", "travel", "expense", "leave", "seal", "generic")],
    (WEB / "empty-tray.webp", "empty-tray.jpg", 400),
    (WEB / "empty-search.webp", "empty-search.jpg", 400),
    *[(WEB / f"leaf-{i}.webp", f"leaf-{i}.png", 64) for i in (1, 3, 5)],
]

OUT.mkdir(parents=True, exist_ok=True)
for src, name, max_w in JOBS:
    if not src.exists():
        print(f"跳过（没有原图）: {src}")
        continue
    im = Image.open(src)
    im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.Resampling.LANCZOS)
    dst = OUT / name
    if name.endswith(".png"):
        im.save(dst, "PNG", optimize=True)
    else:
        im.convert("RGB").save(dst, "JPEG", quality=80, optimize=True, progressive=True)
    print(f"{dst.relative_to(ROOT)} {im.width}x{im.height} {dst.stat().st_size // 1024}KB")
