"""
Generates clean, on-brand placeholder artwork for seeded products, categories
and brands so the store works offline with no broken external image URLs.

Replace any of these files with real Timeline product photography from the
Django admin (Products → Images) at any time.
"""
import io
import math
import random

from django.core.files.base import ContentFile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 2  # supersampling factor for smooth edges

NAVY = (11, 18, 32)
INK = (22, 30, 48)
METAL = (148, 160, 178)
ACCENT = (47, 107, 255)


def _font(size, bold=True):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
        "arialbd.ttf" if bold else "arial.ttf",
        "Arial Bold.ttf" if bold else "Arial.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def _hex(value, fallback=INK):
    try:
        value = value.lstrip("#")
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    except (AttributeError, ValueError, IndexError):
        return fallback


def _mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _background(w, h, top, bottom, glow=None):
    img = Image.new("RGB", (w, h), top)
    px = ImageDraw.Draw(img)
    for y in range(h):
        px.line([(0, y), (w, y)], fill=_mix(top, bottom, y / h))
    if glow:
        halo = Image.new("L", (w, h), 0)
        ImageDraw.Draw(halo).ellipse([w * 0.18, h * 0.12, w * 0.82, h * 0.78], fill=110)
        halo = halo.filter(ImageFilter.GaussianBlur(w // 7))
        img = Image.composite(Image.new("RGB", (w, h), glow), img, halo)
    return img


def _shadow(img, box, strength=90):
    w, h = img.size
    layer = Image.new("L", (w, h), 0)
    x0, y0, x1, y1 = box
    ImageDraw.Draw(layer).ellipse([x0, y1 - (y1 - y0) * 0.05, x1, y1 + (y1 - y0) * 0.08], fill=strength)
    layer = layer.filter(ImageFilter.GaussianBlur(w // 40))
    return Image.composite(Image.new("RGB", (w, h), (40, 48, 66)), img, layer)


# ---------------------------------------------------------------------------
# Device drawings — all coordinates are fractions of the canvas size `s`.
# ---------------------------------------------------------------------------
def _screen(d, box, r, s):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, r, fill=(16, 24, 44))
    for i in range(6):  # soft screen gradient bands
        t = i / 6
        d.rounded_rectangle([x0 + 2, y0 + (y1 - y0) * t, x1 - 2, y0 + (y1 - y0) * (t + 1 / 6)], r if i in (0, 5) else 0,
                            fill=_mix((30, 64, 175), (15, 23, 42), t))
    d.polygon([(x0 + (x1 - x0) * 0.55, y0 + 4), (x1 - 4, y0 + 4), (x1 - 4, y0 + (y1 - y0) * 0.45)], fill=(80, 120, 230))


def draw_phone(d, s, body, alt=False):
    x0, y0, x1, y1 = s * 0.33, s * 0.12, s * 0.67, s * 0.86
    d.rounded_rectangle([x0, y0, x1, y1], s * 0.05, fill=body, outline=_mix(body, (255, 255, 255), 0.35), width=int(s * 0.006))
    if alt:  # back view with camera module
        d.rounded_rectangle([x0 + s * 0.03, y0 + s * 0.03, x0 + s * 0.16, y0 + s * 0.16], s * 0.03, fill=_mix(body, NAVY, 0.4))
        for cx, cy in ((0.065, 0.065), (0.125, 0.065), (0.065, 0.125)):
            d.ellipse([x0 + s * (cx - 0.022), y0 + s * (cy - 0.022), x0 + s * (cx + 0.022), y0 + s * (cy + 0.022)], fill=(10, 12, 20), outline=METAL, width=2)
    else:
        _screen(d, [x0 + s * 0.015, y0 + s * 0.015, x1 - s * 0.015, y1 - s * 0.015], s * 0.04, s)
        d.rounded_rectangle([s * 0.46, y0 + s * 0.03, s * 0.54, y0 + s * 0.05], s * 0.01, fill=(5, 8, 14))


def draw_tablet(d, s, body, alt=False):
    x0, y0, x1, y1 = s * 0.2, s * 0.16, s * 0.8, s * 0.84
    d.rounded_rectangle([x0, y0, x1, y1], s * 0.04, fill=body, outline=_mix(body, (255, 255, 255), 0.35), width=int(s * 0.006))
    if alt:
        d.rounded_rectangle([x0 + s * 0.03, y0 + s * 0.03, x0 + s * 0.12, y0 + s * 0.12], s * 0.025, fill=_mix(body, NAVY, 0.4))
    else:
        _screen(d, [x0 + s * 0.025, y0 + s * 0.025, x1 - s * 0.025, y1 - s * 0.025], s * 0.025, s)


def draw_laptop(d, s, body, alt=False):
    _screen(d, [s * 0.2, s * 0.2, s * 0.8, s * 0.6], s * 0.015, s)
    d.rounded_rectangle([s * 0.18, s * 0.18, s * 0.82, s * 0.62], s * 0.02, outline=body, width=int(s * 0.018))
    d.polygon([(s * 0.1, s * 0.66), (s * 0.9, s * 0.66), (s * 0.84, s * 0.62), (s * 0.16, s * 0.62)], fill=_mix(body, (255, 255, 255), 0.2))
    d.rounded_rectangle([s * 0.1, s * 0.66, s * 0.9, s * 0.7], s * 0.012, fill=body)
    d.rounded_rectangle([s * 0.44, s * 0.66, s * 0.56, s * 0.675], s * 0.006, fill=_mix(body, NAVY, 0.3))


def draw_monitor(d, s, body, alt=False):
    _screen(d, [s * 0.14, s * 0.16, s * 0.86, s * 0.6], s * 0.012, s)
    d.rounded_rectangle([s * 0.12, s * 0.14, s * 0.88, s * 0.62], s * 0.015, outline=body, width=int(s * 0.016))
    d.polygon([(s * 0.47, s * 0.62), (s * 0.53, s * 0.62), (s * 0.56, s * 0.76), (s * 0.44, s * 0.76)], fill=body)
    d.rounded_rectangle([s * 0.32, s * 0.76, s * 0.68, s * 0.8], s * 0.02, fill=body)


def draw_desktop(d, s, body, alt=False):
    draw_monitor(d, s * 0.82, body)
    d.rounded_rectangle([s * 0.74, s * 0.2, s * 0.9, s * 0.8], s * 0.02, fill=body)
    for i in range(4):
        d.line([(s * 0.77, s * (0.3 + i * 0.05)), (s * 0.87, s * (0.3 + i * 0.05))], fill=_mix(body, (255, 255, 255), 0.25), width=3)
    d.ellipse([s * 0.8, s * 0.66, s * 0.84, s * 0.7], fill=ACCENT)


def draw_keyboard(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.08, s * 0.34, s * 0.92, s * 0.68], s * 0.03, fill=body)
    keycol = _mix(body, (255, 255, 255), 0.18)
    for row in range(4):
        cols = 13 if row < 3 else 9
        kw = (0.78 / cols) if row < 3 else (0.78 / 11.4)
        for c in range(cols):
            x = s * (0.11 + c * kw)
            y = s * (0.37 + row * 0.072)
            w = kw * (3.2 if (row == 3 and c == 4) else 1)
            if row == 3 and c > 4:
                x = s * (0.11 + (c + 2.2) * kw)
            d.rounded_rectangle([x, y, x + s * (w - 0.008), y + s * 0.058], s * 0.008, fill=keycol)


def draw_mouse(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.34, s * 0.16, s * 0.66, s * 0.84], s * 0.16, fill=body)
    d.line([(s * 0.5, s * 0.18), (s * 0.5, s * 0.4)], fill=_mix(body, NAVY, 0.5), width=int(s * 0.008))
    d.rounded_rectangle([s * 0.485, s * 0.24, s * 0.515, s * 0.32], s * 0.015, fill=ACCENT)
    d.line([(s * 0.34, s * 0.42), (s * 0.66, s * 0.42)], fill=_mix(body, NAVY, 0.3), width=int(s * 0.004))


def draw_headphones(d, s, body, alt=False):
    w = int(s * 0.05)
    d.arc([s * 0.2, s * 0.12, s * 0.8, s * 0.78], 180, 360, fill=body, width=w)
    d.line([(s * 0.2 + w / 2, s * 0.45), (s * 0.2 + w / 2, s * 0.55)], fill=body, width=w)
    d.line([(s * 0.8 - w / 2, s * 0.45), (s * 0.8 - w / 2, s * 0.55)], fill=body, width=w)
    for x in (0.14, 0.7):
        d.rounded_rectangle([s * x, s * 0.5, s * (x + 0.16), s * 0.8], s * 0.06, fill=body)
        d.rounded_rectangle([s * (x + 0.03), s * 0.54, s * (x + 0.13), s * 0.76], s * 0.04, fill=_mix(body, NAVY, 0.35))


def draw_earbuds(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.28, s * 0.46, s * 0.72, s * 0.8], s * 0.12, fill=body)
    d.line([(s * 0.3, s * 0.58), (s * 0.7, s * 0.58)], fill=_mix(body, NAVY, 0.25), width=int(s * 0.006))
    d.ellipse([s * 0.48, s * 0.66, s * 0.52, s * 0.7], fill=(34, 197, 94))
    for x, flip in ((0.32, 1), (0.56, -1)):
        d.ellipse([s * x, s * 0.2, s * (x + 0.12), s * 0.32], fill=body)
        d.rounded_rectangle([s * (x + 0.035), s * 0.28, s * (x + 0.085), s * 0.44], s * 0.025, fill=body)


def draw_speaker(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.18, s * 0.3, s * 0.82, s * 0.72], s * 0.2, fill=body)
    grille = _mix(body, NAVY, 0.3)
    for i in range(18):
        for j in range(6):
            cx, cy = s * (0.27 + i * 0.026), s * (0.4 + j * 0.045)
            d.ellipse([cx - 4 * SS, cy - 4 * SS, cx + 4 * SS, cy + 4 * SS], fill=grille)
    d.ellipse([s * 0.14, s * 0.4, s * 0.22, s * 0.62], fill=_mix(body, (0, 0, 0), 0.3))
    d.ellipse([s * 0.78, s * 0.4, s * 0.86, s * 0.62], fill=_mix(body, (0, 0, 0), 0.3))


def draw_watch(d, s, body, alt=False):
    band = _mix(body, NAVY, 0.25)
    d.rounded_rectangle([s * 0.4, s * 0.06, s * 0.6, s * 0.94], s * 0.05, fill=band)
    d.rounded_rectangle([s * 0.3, s * 0.28, s * 0.7, s * 0.72], s * 0.09, fill=METAL)
    _screen(d, [s * 0.33, s * 0.31, s * 0.67, s * 0.69], s * 0.07, s)
    d.rounded_rectangle([s * 0.7, s * 0.4, s * 0.73, s * 0.48], s * 0.01, fill=METAL)
    f = _font(int(s * 0.07))
    d.text((s * 0.5, s * 0.5), "10:09", fill=(255, 255, 255), font=f, anchor="mm")


def draw_band(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.42, s * 0.08, s * 0.58, s * 0.92], s * 0.07, fill=body)
    d.rounded_rectangle([s * 0.4, s * 0.34, s * 0.6, s * 0.66], s * 0.07, fill=(12, 16, 26))
    d.rounded_rectangle([s * 0.43, s * 0.38, s * 0.57, s * 0.62], s * 0.05, fill=(30, 64, 175))


def draw_powerbank(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.26, s * 0.14, s * 0.74, s * 0.86], s * 0.06, fill=body)
    for i in range(4):
        d.ellipse([s * (0.42 + i * 0.045), s * 0.76, s * (0.44 + i * 0.045), s * 0.78], fill=ACCENT if i < 3 else METAL)
    d.rounded_rectangle([s * 0.44, s * 0.14, s * 0.56, s * 0.16], s * 0.005, fill=(10, 12, 20))
    bolt = [(0.53, 0.34), (0.44, 0.5), (0.5, 0.5), (0.47, 0.64), (0.57, 0.46), (0.51, 0.46), (0.55, 0.34)]
    d.polygon([(s * x, s * y) for x, y in bolt], fill=_mix(body, (255, 255, 255), 0.55))


def draw_charger(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.3, s * 0.3, s * 0.7, s * 0.78], s * 0.06, fill=body)
    for x in (0.4, 0.56):
        d.rounded_rectangle([s * x, s * 0.12, s * (x + 0.04), s * 0.3], s * 0.008, fill=METAL)
    d.rounded_rectangle([s * 0.44, s * 0.64, s * 0.56, s * 0.68], s * 0.01, fill=(20, 24, 34))


def draw_cable(d, s, body, alt=False):
    w = int(s * 0.025)
    pts = [(s * 0.2, s * 0.25)]
    for i in range(1, 40):
        t = i / 39
        pts.append((s * (0.2 + 0.6 * t), s * (0.5 + 0.22 * math.sin(t * math.pi * 2.2))))
    d.line(pts, fill=body, width=w, joint="curve")
    for (x, y) in (pts[0], pts[-1]):
        d.rounded_rectangle([x - s * 0.05, y - s * 0.035, x + s * 0.05, y + s * 0.035], s * 0.015, fill=_mix(body, (255, 255, 255), 0.15))
        d.rounded_rectangle([x - s * 0.02, y - s * 0.012, x + s * 0.07, y + s * 0.012], s * 0.006, fill=METAL)


def draw_memorycard(d, s, body, alt=False):
    d.polygon([(s * 0.3, s * 0.16), (s * 0.62, s * 0.16), (s * 0.72, s * 0.28), (s * 0.72, s * 0.84), (s * 0.3, s * 0.84)], fill=body)
    for i in range(6):
        d.rounded_rectangle([s * (0.34 + i * 0.055), s * 0.2, s * (0.37 + i * 0.055), s * 0.3], 2, fill=(212, 175, 55))
    d.rounded_rectangle([s * 0.34, s * 0.52, s * 0.68, s * 0.76], s * 0.02, fill=_mix(body, (255, 255, 255), 0.2))


def draw_flashdrive(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.24, s * 0.4, s * 0.66, s * 0.6], s * 0.04, fill=body)
    d.rectangle([s * 0.66, s * 0.43, s * 0.8, s * 0.57], fill=METAL)
    for x in (0.7, 0.75):
        d.rectangle([s * x, s * 0.46, s * (x + 0.025), s * 0.49], fill=(60, 70, 90))
    d.ellipse([s * 0.28, s * 0.47, s * 0.32, s * 0.53], fill=_mix(body, (255, 255, 255), 0.4))


def draw_hdd(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.24, s * 0.16, s * 0.76, s * 0.84], s * 0.05, fill=body)
    d.rounded_rectangle([s * 0.28, s * 0.2, s * 0.72, s * 0.8], s * 0.04, outline=_mix(body, (255, 255, 255), 0.2), width=3)
    d.ellipse([s * 0.47, s * 0.74, s * 0.53, s * 0.76], fill=ACCENT)


def draw_ssd(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.1, s * 0.4, s * 0.9, s * 0.6], s * 0.015, fill=(14, 60, 40))
    for i in range(3):
        d.rounded_rectangle([s * (0.2 + i * 0.2), s * 0.43, s * (0.34 + i * 0.2), s * 0.57], s * 0.01, fill=body)
    for i in range(10):
        d.rectangle([s * (0.83 + (i % 2) * 0.03), s * (0.42 + i * 0.016), s * (0.85 + (i % 2) * 0.03), s * (0.43 + i * 0.016)], fill=(212, 175, 55))


def draw_router(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.14, s * 0.52, s * 0.86, s * 0.72], s * 0.04, fill=body)
    for x in (0.22, 0.4, 0.6, 0.78):
        d.rounded_rectangle([s * (x - 0.015), s * 0.2, s * (x + 0.015), s * 0.54], s * 0.015, fill=body)
    for i in range(5):
        d.ellipse([s * (0.3 + i * 0.08), s * 0.6, s * (0.32 + i * 0.08), s * 0.62], fill=(34, 197, 94))


def draw_mifi(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.26, s * 0.3, s * 0.74, s * 0.7], s * 0.08, fill=body)
    _screen(d, [s * 0.33, s * 0.38, s * 0.67, s * 0.52], s * 0.02, s)
    for i in range(4):
        h = 0.03 + i * 0.02
        d.rectangle([s * (0.42 + i * 0.045), s * (0.64 - h), s * (0.45 + i * 0.045), s * 0.64], fill=ACCENT)


def draw_modem(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.36, s * 0.14, s * 0.64, s * 0.8], s * 0.04, fill=body)
    d.rounded_rectangle([s * 0.3, s * 0.78, s * 0.7, s * 0.86], s * 0.02, fill=_mix(body, NAVY, 0.3))
    for i in range(5):
        d.ellipse([s * 0.48, s * (0.24 + i * 0.07), s * 0.52, s * (0.28 + i * 0.07)], fill=(34, 197, 94) if i < 4 else METAL)


def draw_camera(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.16, s * 0.3, s * 0.72, s * 0.56], s * 0.1, fill=body)
    d.ellipse([s * 0.58, s * 0.32, s * 0.8, s * 0.54], fill=_mix(body, NAVY, 0.2))
    d.ellipse([s * 0.62, s * 0.36, s * 0.76, s * 0.5], fill=(10, 14, 24))
    d.ellipse([s * 0.66, s * 0.4, s * 0.7, s * 0.44], fill=ACCENT)
    d.rectangle([s * 0.36, s * 0.56, s * 0.42, s * 0.72], fill=body)
    d.rounded_rectangle([s * 0.26, s * 0.72, s * 0.52, s * 0.78], s * 0.02, fill=body)


def draw_webcam(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.2, s * 0.32, s * 0.8, s * 0.5], s * 0.09, fill=body)
    d.ellipse([s * 0.42, s * 0.33, s * 0.58, s * 0.49], fill=(10, 14, 24))
    d.ellipse([s * 0.47, s * 0.38, s * 0.53, s * 0.44], fill=ACCENT)
    d.polygon([(s * 0.44, s * 0.5), (s * 0.56, s * 0.5), (s * 0.6, s * 0.62), (s * 0.4, s * 0.62)], fill=_mix(body, NAVY, 0.3))


def draw_gamepad(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.16, s * 0.34, s * 0.84, s * 0.62], s * 0.12, fill=body)
    d.ellipse([s * 0.1, s * 0.42, s * 0.36, s * 0.8], fill=body)
    d.ellipse([s * 0.64, s * 0.42, s * 0.9, s * 0.8], fill=body)
    d.rectangle([s * 0.24, s * 0.44, s * 0.28, s * 0.56], fill=(15, 20, 30))
    d.rectangle([s * 0.2, s * 0.48, s * 0.32, s * 0.52], fill=(15, 20, 30))
    for (cx, cy, col) in ((0.72, 0.44, (239, 68, 68)), (0.77, 0.49, (59, 130, 246)), (0.67, 0.49, (234, 179, 8)), (0.72, 0.54, (34, 197, 94))):
        d.ellipse([s * (cx - 0.02), s * (cy - 0.02), s * (cx + 0.02), s * (cy + 0.02)], fill=col)
    for x in (0.4, 0.56):
        d.ellipse([s * (x - 0.04), s * 0.56, s * (x + 0.04), s * 0.64], fill=(20, 26, 38))


def draw_software(d, s, body, alt=False):
    d.polygon([(s * 0.3, s * 0.18), (s * 0.66, s * 0.18), (s * 0.74, s * 0.24), (s * 0.74, s * 0.84), (s * 0.38, s * 0.84), (s * 0.3, s * 0.78)], fill=_mix(body, NAVY, 0.3))
    d.rectangle([s * 0.3, s * 0.18, s * 0.66, s * 0.78], fill=body)
    d.polygon([(s * 0.48, s * 0.34), (s * 0.58, s * 0.38), (s * 0.58, s * 0.5), (s * 0.48, s * 0.58), (s * 0.38, s * 0.5), (s * 0.38, s * 0.38)], fill=(255, 255, 255))
    d.line([(s * 0.43, s * 0.46), (s * 0.47, s * 0.5), (s * 0.54, s * 0.41)], fill=(34, 197, 94), width=int(s * 0.012))


def draw_ups(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.3, s * 0.14, s * 0.7, s * 0.86], s * 0.03, fill=body)
    _screen(d, [s * 0.38, s * 0.24, s * 0.62, s * 0.36], s * 0.01, s)
    d.ellipse([s * 0.45, s * 0.46, s * 0.55, s * 0.56], outline=ACCENT, width=int(s * 0.008))
    d.line([(s * 0.5, s * 0.44), (s * 0.5, s * 0.5)], fill=ACCENT, width=int(s * 0.008))


def draw_adapter(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.3, s * 0.42, s * 0.62, s * 0.58], s * 0.03, fill=body)
    d.rectangle([s * 0.62, s * 0.45, s * 0.74, s * 0.55], fill=METAL)
    d.rounded_rectangle([s * 0.36, s * 0.2, s * 0.4, s * 0.44], s * 0.015, fill=body)


def draw_mp3(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.36, s * 0.18, s * 0.64, s * 0.82], s * 0.05, fill=body)
    _screen(d, [s * 0.39, s * 0.22, s * 0.61, s * 0.46], s * 0.015, s)
    d.ellipse([s * 0.41, s * 0.52, s * 0.59, s * 0.7], outline=_mix(body, (255, 255, 255), 0.4), width=int(s * 0.01))


def draw_lens(d, s, body, alt=False):
    d.rounded_rectangle([s * 0.3, s * 0.26, s * 0.7, s * 0.74], s * 0.05, fill=body)
    d.ellipse([s * 0.34, s * 0.3, s * 0.66, s * 0.62], fill=(10, 14, 24), outline=METAL, width=int(s * 0.01))
    d.ellipse([s * 0.44, s * 0.4, s * 0.52, s * 0.48], fill=(60, 90, 200))


DRAWERS = {
    "phone": draw_phone, "tablet": draw_tablet, "laptop": draw_laptop, "monitor": draw_monitor,
    "desktop": draw_desktop, "keyboard": draw_keyboard, "mouse": draw_mouse, "headphones": draw_headphones,
    "earbuds": draw_earbuds, "speaker": draw_speaker, "watch": draw_watch, "band": draw_band,
    "powerbank": draw_powerbank, "charger": draw_charger, "cable": draw_cable, "memorycard": draw_memorycard,
    "flashdrive": draw_flashdrive, "hdd": draw_hdd, "ssd": draw_ssd, "router": draw_router, "mifi": draw_mifi,
    "modem": draw_modem, "camera": draw_camera, "webcam": draw_webcam, "gamepad": draw_gamepad,
    "software": draw_software, "ups": draw_ups, "adapter": draw_adapter, "mp3": draw_mp3, "lens": draw_lens,
}


def _to_file(img, name, fmt="JPEG"):
    buf = io.BytesIO()
    if fmt == "JPEG":
        img.convert("RGB").save(buf, "JPEG", quality=88, optimize=True, progressive=True)
    else:
        img.save(buf, fmt, optimize=True)
    return ContentFile(buf.getvalue(), name=name)


def product_image(shape, body_hex="#1f2937", variant=0, size=900, seed=0):
    """variant 0 = hero shot on light background, 1 = alternate on dark studio background."""
    s = size * SS
    rnd = random.Random(seed)
    body = _hex(body_hex)
    light_body = sum(body) / 3 > 190
    if variant == 0 and light_body:  # darker studio grey so white products stay visible
        img = _background(s, s, (214, 221, 232), (186, 196, 212), glow=(232, 237, 245))
    elif variant == 0:
        img = _background(s, s, (246, 247, 250), (228, 232, 239), glow=(255, 255, 255))
    else:
        img = _background(s, s, (26, 34, 54), (9, 13, 24), glow=_mix(ACCENT, (26, 34, 54), 0.55))
    img = _shadow(img, (s * 0.2, s * 0.2, s * 0.8, s * 0.84), 70 if variant == 0 else 120)
    d = ImageDraw.Draw(img)
    DRAWERS.get(shape, draw_phone)(d, s, body, alt=(variant == 1))
    if variant == 1:  # subtle decorative dots
        for _ in range(14):
            x, y, r = rnd.uniform(0, s), rnd.uniform(0, s * 0.3), rnd.uniform(1, 3) * SS
            d.ellipse([x - r, y - r, x + r, y + r], fill=(70, 90, 140))
    return img.resize((size, size), Image.LANCZOS)


def product_image_file(shape, filename, body_hex="#1f2937", variant=0, seed=0):
    return _to_file(product_image(shape, body_hex, variant, seed=seed), filename)


def category_image_file(shape, title, filename, size=600):
    s = size * SS
    img = _background(s, s, (17, 24, 39), (8, 12, 22), glow=_mix(ACCENT, (17, 24, 39), 0.6))
    d = ImageDraw.Draw(img)
    DRAWERS.get(shape, draw_phone)(d, s, (203, 213, 225))
    img = img.resize((size, size), Image.LANCZOS)
    return _to_file(img, filename)


def brand_logo_file(name, filename, size=400):
    """A neutral text tile (not the brand's trademarked logo) — replace with an approved logo file."""
    s = size * SS
    img = Image.new("RGB", (s, s), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([s * 0.04, s * 0.04, s * 0.96, s * 0.96], s * 0.12, outline=(226, 232, 240), width=4 * SS)
    text = name.upper()
    fsize = int(s * (0.2 if len(text) <= 5 else 0.14 if len(text) <= 8 else 0.1))
    d.text((s / 2, s / 2), text, fill=NAVY, font=_font(fsize), anchor="mm")
    return _to_file(img.resize((size, size), Image.LANCZOS), filename, "PNG")
