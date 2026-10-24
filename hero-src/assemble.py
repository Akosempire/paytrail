"""Builds the 192-frame sequence from the rendered keyframes, composited on a
solid page colour, optionally cropped (mobile recomposition).

python3 assemble.py RENDER_DIR OUT_DIR BG_HEX [crop x0,y0,x1,y1 as fractions]
"""
import os, sys
import numpy as np
from PIL import Image

SHADOW = float(os.environ.get("SHADOW", "0.75"))  # softens the shadow-catcher shadows

src, out, bg = sys.argv[1], sys.argv[2], sys.argv[3]
crop = [float(v) for v in sys.argv[4].split(",")] if len(sys.argv) > 4 else None
os.makedirs(out, exist_ok=True)

cache = {}
def load(n):
    if n not in cache:
        im = Image.open(os.path.join(src, f"{n:04d}.png")).convert("RGBA")
        a = np.asarray(im).copy()
        shadow = a[..., :3].max(axis=2) < 60          # pure shadow pixels are near-black
        a[..., 3] = np.where(shadow, (a[..., 3] * SHADOW).astype(np.uint8), a[..., 3])
        im = Image.fromarray(a, "RGBA")
        base = Image.new("RGBA", im.size, bg)
        base.alpha_composite(im)
        im = base.convert("RGB")
        if crop:
            w, h = im.size
            im = im.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
        cache[n] = im
    return cache[n]

def ease(t):
    return t * t * (3 - 2 * t)

def frame(i):
    if i <= 36: return load(i)
    if i <= 45: return load(36)
    if i <= 58: return Image.blend(load(36), load(62), ease((i - 45) / 13))
    if i <= 62: return load(62)
    if i <= 150: return load(i)
    if i <= 158: return load(150)
    if i <= 171: return Image.blend(load(150), load(160), ease((i - 158) / 13))
    return load(160)

for i in range(1, 193):
    frame(i).save(os.path.join(out, f"{i:04d}.png"), compress_level=1)
print("assembled", out)
