# Landing hero film (Blender)

The 3D animation on the landing page hero is a replaceable asset rendered with Blender (Cycles). It runs 8 seconds at 24 fps: a quotation glides in, turns "Accepted", turns over like a page into the invoice, a Paystack payment card lands, and the invoice turns "Paid".

## Files

| File | What it does |
|---|---|
| `tex.js` | Renders the paper faces (quotation, accepted, invoice due/paid, payment card) to `tex/*.png` with Playwright. |
| `scene.py` | Builds the scene in Blender and renders transparent RGBA frames with a shadow-catcher floor. Paper has real thickness, a lift/curl while moving, and soft contact shadows. |
| `frames.txt` | The frames that need rendering. Still moments are reused or crossfaded, which saves about a third of the render time. |
| `assemble.py` | Builds the full 192-frame sequence, composited on the page colour. Mobile uses a tighter crop of the same frames. |
| `encode.sh` | Encodes H.264 MP4 and VP9 WebM (BT.709, no audio), plus start and end posters (WebP). |
| `build_assets.sh` | Makes all 4 variants (desktop/mobile × light/dark) into `public/hero/`. |

## Re-rendering

```bash
pip install bpy==5.0.1          # Blender as a Python module (needs Python 3.11)
node hero-src/tex.js            # textures -> hero-src/tex/
python3.11 hero-src/scene.py -- --out /tmp/hero/r --frames "$(cat hero-src/frames.txt)" --samples 12 --scale 0.8
bash hero-src/build_assets.sh /tmp/hero/r public/hero
```

Then bump `V` in `components/hero-film.js` so browsers fetch the new files. The page colours live in `app/globals.css` (`--color-hero`). If you change them, change the backgrounds in `build_assets.sh` to match.
