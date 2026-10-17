"""Draws the app icons into icons/. Run: python3 scripts/make-icons.py (needs Pillow).

The mark is two rounded bars, one red and one blue, for the two alliances,
on the app's dark background. Drawn as shapes, so there is no font or emoji.
"""
from pathlib import Path
from PIL import Image, ImageDraw

BG = (14, 14, 16)
RED = (212, 42, 54)
BLUE = (33, 96, 224)
OUT = Path(__file__).resolve().parent.parent / "icons"


def draw(size, safe=1.0, rounded=True):
    scale = 4  # draw big, then shrink: smooth edges
    s = size * scale
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    inner = s * safe              # maskable icons keep the mark in the middle 80%
    off = (s - inner) / 2
    bar_w, bar_h, gap = inner * 0.2, inner * 0.56, inner * 0.08
    top = off + (inner - bar_h) / 2
    left = off + (inner - (2 * bar_w + gap)) / 2
    r = bar_w / 2
    d.rounded_rectangle([left, top, left + bar_w, top + bar_h], r, fill=RED)
    d.rounded_rectangle([left + bar_w + gap, top + bar_h * 0.18, left + 2 * bar_w + gap, top + bar_h], r, fill=BLUE)
    img = img.resize((size, size), Image.LANCZOS)
    if rounded:  # plain icons get rounded corners; maskable ones are cropped by the OS
        mask = Image.new("L", (size * scale, size * scale), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * scale, size * scale], size * scale * 0.22, fill=255)
        out = Image.new("RGBA", (size, size))
        out.paste(img, mask=mask.resize((size, size), Image.LANCZOS))
        img = out
    return img


OUT.mkdir(exist_ok=True)
draw(192).save(OUT / "icon-192.png")
draw(512).save(OUT / "icon-512.png")
draw(512, safe=0.8, rounded=False).save(OUT / "icon-maskable-512.png")
draw(180, rounded=False).save(OUT / "apple-touch-icon.png")  # iOS rounds it itself
print("icons written to", OUT)
