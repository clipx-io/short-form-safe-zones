"""Generate PNG and SVG overlays from data/safe-zones.json.

Run from the repo root:
    uv run --with pillow python scripts/make_overlays.py
"""

import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "data" / "safe-zones.json").read_text())
OUT = ROOT / "overlays"
DOCS = ROOT / "docs"

W = DATA["canvas"]["width"]
H = DATA["canvas"]["height"]

UNSAFE = (255, 59, 48)  # red
UNSAFE_ALPHA = 0.38
EDGE = (0, 200, 120)  # green outline of the safe area
EDGE_WIDTH = 4


def safe_for_all():
    plats = DATA["platforms"].values()
    margins = {
        side: max(p["margins"][side]["px"] for p in plats)
        for side in ("top", "bottom", "left", "right")
    }
    boxes = []
    for key, p in DATA["platforms"].items():
        for b in p["boxes"]:
            boxes.append({**b, "label": f"{p['name']}: {b['label']}"})
    return {"name": "Safe for all", "margins": margins, "boxes": boxes}


def zones():
    out = {}
    for key, p in DATA["platforms"].items():
        out[key] = {
            "name": p["name"],
            "margins": {s: v["px"] for s, v in p["margins"].items()},
            "boxes": p["boxes"],
        }
    out["all"] = safe_for_all()
    return out


def unsafe_rects(m):
    """Four margin bands as (x, y, w, h); no overlap between them."""
    return [
        (0, 0, W, m["top"]),
        (0, H - m["bottom"], W, m["bottom"]),
        (0, m["top"], m["left"], H - m["top"] - m["bottom"]),
        (W - m["right"], m["top"], m["right"], H - m["top"] - m["bottom"]),
    ]


def font(size):
    return ImageFont.load_default(size=size)


def draw_png(z, path):
    m = z["margins"]
    # One mask for every unsafe area, so overlaps get the same tint.
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for x, y, w, h in unsafe_rects(m):
        md.rectangle([x, y, x + w - 1, y + h - 1], fill=255)
    for b in z["boxes"]:
        md.rectangle([b["x"], b["y"], b["x"] + b["width"] - 1, b["y"] + b["height"] - 1], fill=255)
    # Outline = safe pixels next to an unsafe pixel.
    grown = mask.filter(ImageFilter.MaxFilter(2 * EDGE_WIDTH + 1))
    edge = ImageChops.subtract(grown, mask)

    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    img.paste((*UNSAFE, round(255 * UNSAFE_ALPHA)), mask=mask)
    img.paste((*EDGE, 230), mask=edge)
    d = ImageDraw.Draw(img)
    f_big, f_small = font(44), font(30)
    white = (255, 255, 255, 235)
    d.text((m["left"] + 16, 24), z["name"], font=f_big, fill=white)
    d.text(
        (m["left"] + 16, 84),
        f"top {m['top']}  bottom {m['bottom']}  left {m['left']}  right {m['right']} px",
        font=f_small,
        fill=white,
    )
    d.text((m["left"] + 16, H - m["bottom"] + 20), "unsafe: captions, username, buttons", font=f_small, fill=white)
    img.save(path, optimize=True)
    return img


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def draw_svg(z, path):
    m = z["margins"]
    sx, sy = m["left"], m["top"]
    sw_, sh_ = W - m["left"] - m["right"], H - m["top"] - m["bottom"]
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
        f"<title>{esc(z['name'])} safe zone, {W}x{H}</title>",
        # Mask = the safe area: the inner rectangle minus any UI boxes.
        f'<defs><mask id="safe"><rect x="{sx}" y="{sy}" width="{sw_}" height="{sh_}" fill="#fff"/>'
        + "".join(
            f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["width"]}" height="{b["height"]}" fill="#000"/>'
            for b in z["boxes"]
        )
        + "</mask></defs>",
        # Group opacity tints the union of all unsafe shapes once.
        f'<g fill="rgb{UNSAFE}" opacity="{UNSAFE_ALPHA}">',
    ]
    for x, y, w, h in unsafe_rects(m):
        parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}"/>')
    for b in z["boxes"]:
        parts.append(
            f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["width"]}" height="{b["height"]}">'
            f'<title>{esc(b["label"])}</title></rect>'
        )
    parts.append("</g>")
    stroke = f'fill="none" stroke="rgb{EDGE}" stroke-width="{2 * EDGE_WIDTH}" mask="url(#safe)"'
    parts.append(f'<rect x="{sx}" y="{sy}" width="{sw_}" height="{sh_}" {stroke}/>')
    for b in z["boxes"]:
        parts.append(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["width"]}" height="{b["height"]}" {stroke}/>')
    parts.append(
        f'<g fill="#fff" font-family="sans-serif">'
        f'<text x="{m["left"] + 16}" y="64" font-size="44">{esc(z["name"])}</text>'
        f'<text x="{m["left"] + 16}" y="114" font-size="30">top {m["top"]}  bottom {m["bottom"]}  '
        f'left {m["left"]}  right {m["right"]} px</text>'
        f'<text x="{m["left"] + 16}" y="{H - m["bottom"] + 50}" font-size="30">'
        f"unsafe: captions, username, buttons</text></g>"
    )
    parts.append("</svg>")
    path.write_text("\n".join(parts) + "\n")


def preview(images):
    """Side-by-side preview of every overlay on a gray backdrop, for the README."""
    tw, th, gap = 270, 480, 20
    n = len(images)
    sheet = Image.new("RGB", (n * tw + (n + 1) * gap, th + 2 * gap), (32, 34, 38))
    for i, img in enumerate(images):
        bg = Image.new("RGBA", (W, H), (96, 100, 108, 255))
        bg.alpha_composite(img)
        sheet.paste(bg.convert("RGB").resize((tw, th), Image.LANCZOS), (gap + i * (tw + gap), gap))
    sheet.save(DOCS / "preview.png", optimize=True)


def main():
    OUT.mkdir(exist_ok=True)
    DOCS.mkdir(exist_ok=True)
    images = []
    for key, z in zones().items():
        images.append(draw_png(z, OUT / f"{key}.png"))
        draw_svg(z, OUT / f"{key}.svg")
        print(f"wrote overlays/{key}.png and overlays/{key}.svg")
    preview(images)
    print("wrote docs/preview.png")


if __name__ == "__main__":
    main()
