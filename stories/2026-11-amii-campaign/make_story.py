#!/usr/bin/env python3
"""アミー 11〜12月キャンペーン ストーリー動画 (1080x1920 / 30fps / 20秒) を生成する。

使い方:
    python3 make_story.py            # assets/ の画像から amii_campaign_story.mp4 を出力

構成:
    0.0 - 3.0s   オープニング（e:amii 11月〜12月キャンペーン）
    3.0 - 7.6s   リペアミルク 10+1 添付キャンペーン
    7.6 - 12.2s  アミー詰め替え 10%OFF
    12.2 - 16.0s 12月 部門別店別対抗戦（4部門）
    16.0 - 20.0s 表彰・賞金5,000円＆ケーキ → 「賞金・景品をゲットしよう！」
"""
import math
import os
import random
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
OUT = os.path.join(HERE, "amii_campaign_story.mp4")

W, H, FPS, DUR = 1080, 1920, 30, 20.0
FONT = "/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"

# palette (e:amii のパッケージに合わせたニュアンスカラー)
CREAM = (246, 241, 234)
BEIGE = (233, 220, 205)
SAGE = (128, 150, 145)
SAGE_D = (86, 108, 104)
INK = (43, 43, 43)
GOLD = (196, 158, 92)
GOLD_L = (236, 210, 150)
ROSE = (214, 120, 110)
WHITE = (255, 255, 255)


# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def prog(t, start, dur):
    return clamp((t - start) / dur)


def ease_out(x):
    return 1 - (1 - x) ** 3


def ease_in_out(x):
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_back(x):
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2


# ---------------------------------------------------------------- sprites
_cache = {}


def font(size):
    key = ("f", size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(FONT, size)
    return _cache[key]


def text_sprite(text, size, color=INK, stroke=None, bold=2, spacing=1.0):
    """テキストを RGBA スプライト化。IPAゴシックは Regular のみなので stroke で太字化。"""
    key = ("t", text, size, color, stroke, bold)
    if key in _cache:
        return _cache[key]
    f = font(size)
    lines = text.split("\n")
    pad = 12 + (stroke[1] if stroke else 0) + bold
    boxes = [f.getbbox(l, stroke_width=bold) for l in lines]
    lh = int(size * 1.25 * spacing)
    w = max(b[2] - b[0] for b in boxes) + pad * 2
    h = lh * len(lines) + pad * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        b = boxes[i]
        x = (w - (b[2] - b[0])) // 2 - b[0]
        y = pad + i * lh + (lh - size) // 2 - int(size * 0.08)
        if stroke:
            d.text((x, y), l, font=f, fill=stroke[0], stroke_width=stroke[1] + bold, stroke_fill=stroke[0])
        d.text((x, y), l, font=f, fill=color, stroke_width=bold, stroke_fill=color)
    _cache[key] = im
    return im


def emoji_sprite(ch, px):
    key = ("e", ch, px)
    if key in _cache:
        return _cache[key]
    f = ImageFont.truetype(EMOJI, 109)
    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((8, 8), ch, font=f, embedded_color=True)
    im = im.crop(im.getbbox()).resize((px, px), Image.LANCZOS)
    _cache[key] = im
    return im


def pill(w, h, fill, outline=None, ow=0, radius=None):
    key = ("p", w, h, fill, outline, ow, radius)
    if key in _cache:
        return _cache[key]
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    r = h // 2 if radius is None else radius
    ImageDraw.Draw(im).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=fill, outline=outline, width=ow)
    _cache[key] = im
    return im


def shadow_of(sprite, blur=18, alpha=70):
    key = ("s", id(sprite), blur, alpha)
    if key in _cache:
        return _cache[key]
    a = sprite.getchannel("A").point(lambda v: v * alpha // 255)
    pad = blur * 3
    sh = Image.new("RGBA", (sprite.width + pad * 2, sprite.height + pad * 2), (60, 50, 40, 0))
    m = Image.new("L", sh.size, 0)
    m.paste(a, (pad, pad))
    sh.putalpha(m.filter(ImageFilter.GaussianBlur(blur)))
    _cache[key] = sh
    return sh


def put(frame, sprite, cx, cy, alpha=1.0, scale=1.0, rot=0.0, shadow=False):
    """スプライトを中心座標 (cx, cy) に合成。"""
    if alpha <= 0.001 or scale <= 0.001:
        return
    sp = sprite
    if shadow:
        sh = shadow_of(sprite)
        put(frame, sh, cx + 6, cy + 22, alpha, scale, rot)
    if abs(scale - 1) > 0.002:
        sp = sp.resize((max(1, int(sp.width * scale)), max(1, int(sp.height * scale))), Image.BICUBIC)
    if abs(rot) > 0.05:
        sp = sp.rotate(rot, Image.BICUBIC, expand=True)
    if alpha < 0.999:
        a = sp.getchannel("A").point(lambda v: int(v * alpha))
        sp = sp.copy()
        sp.putalpha(a)
    frame.alpha_composite(sp, (int(cx - sp.width / 2), int(cy - sp.height / 2)))


# ---------------------------------------------------------------- assets
def load_cutout(name, max_w, max_h):
    key = ("a", name, max_w, max_h)
    if key in _cache:
        return _cache[key]
    im = Image.open(os.path.join(ASSETS, name)).convert("RGBA")
    if name.endswith(".jpg"):  # 白背景 → 透過（外周から塗りつぶし）
        im.thumbnail((1400, 1400), Image.LANCZOS)
        g = im.convert("L").point(lambda v: 255 if v > 243 else 0)
        for c in [(0, 0), (g.width - 1, 0), (0, g.height - 1), (g.width - 1, g.height - 1)]:
            ImageDraw.floodfill(g, c, 128)
        mask = g.point(lambda v: 0 if v == 128 else 255).filter(ImageFilter.GaussianBlur(1.2))
        im.putalpha(mask)
    im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
    im.thumbnail((max_w, max_h), Image.LANCZOS)
    _cache[key] = im
    return im


# ---------------------------------------------------------------- backgrounds
def make_bg(top, bottom, dots=True, seed=1):
    bg = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        k = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)) + (255,))
    if dots:
        rnd = random.Random(seed)
        lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ld = ImageDraw.Draw(lay)
        for _ in range(14):
            r = rnd.randint(90, 260)
            x, y = rnd.randint(-100, W + 100), rnd.randint(-100, H + 100)
            ld.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, rnd.randint(30, 70)))
        bg.alpha_composite(lay.filter(ImageFilter.GaussianBlur(40)))
    return bg


BG1 = make_bg(CREAM, BEIGE, seed=3)
BG2 = make_bg((247, 238, 230), (238, 222, 214), seed=5)
BG3 = make_bg((232, 239, 236), (210, 224, 220), seed=7)
BG4 = make_bg((244, 239, 230), (226, 214, 196), seed=9)
BG5 = make_bg((60, 74, 72), (34, 42, 41), dots=False)


def header(frame, t, t0, label, title, color=INK, sub_color=SAGE, y=330):
    p = ease_out(prog(t, t0, 0.5))
    ts = text_sprite(title, 80, color, bold=2)
    top, bot = y - ts.height / 2, y + ts.height / 2
    put(frame, text_sprite(label, 38, sub_color, bold=1), W / 2, top - 18 + (1 - p) * 30, p)
    put(frame, ts, W / 2, y + (1 - p) * 40, p)
    lw = int(220 * ease_out(prog(t, t0 + 0.25, 0.5)))
    if lw > 2:
        put(frame, pill(lw, 6, GOLD + (255,)), W / 2, bot + 8)


def period_chip(frame, t, t0, text, y, fg=WHITE, bgc=SAGE_D):
    p = ease_back(prog(t, t0, 0.45))
    spr = text_sprite(text, 46, fg, bold=2)
    put(frame, pill(spr.width + 60, 96, bgc + (255,)), W / 2, y, clamp(p), p)
    put(frame, spr, W / 2, y, clamp(p), p)


# ---------------------------------------------------------------- scenes
def scene_open(t):
    f = BG1.copy()
    p = ease_out(prog(t, 0.1, 0.6))
    put(f, text_sprite("Campaign", 44, SAGE, bold=1), W / 2, 550 - (1 - p) * 30, p)
    p2 = ease_back(prog(t, 0.25, 0.6))
    put(f, text_sprite("e:amii", 170, INK, bold=2), W / 2, 690, clamp(p2), 0.85 + 0.15 * p2)
    p3 = ease_out(prog(t, 0.6, 0.5))
    put(f, text_sprite("11月〜12月", 96, INK, bold=2), W / 2, 870 + (1 - p3) * 40, p3)
    p4 = ease_out(prog(t, 0.8, 0.5))
    spr = text_sprite("キャンペーン開催中！", 68, WHITE, bold=2)
    put(f, pill(spr.width + 70, 120, ROSE + (255,)), W / 2, 1010 + (1 - p4) * 40, p4)
    put(f, spr, W / 2, 1010 + (1 - p4) * 40, p4)

    prods = [("jure01.png", 300, 360, 1440), ("repairmilk.png", 330, 430, 1420),
             ("shine_oil.png", 230, 470, 1420), ("jure03.png", 300, 360, 1440)]
    xs = [170, 400, 660, 905]
    for i, (n, mw, mh, cy) in enumerate(prods):
        q = ease_back(prog(t, 1.0 + i * 0.12, 0.55))
        bob = math.sin((t + i) * 2.4) * 6
        put(f, load_cutout(n, mw, mh), xs[i], cy + (1 - clamp(q)) * 260 + bob, clamp(q * 1.5), 0.6 + 0.4 * q, shadow=True)
    p5 = ease_out(prog(t, 1.7, 0.5))
    put(f, text_sprite("3つのお得なキャンペーンをチェック！", 46, SAGE_D, bold=2), W / 2, 1700, p5)
    return f


def scene_milk(t):
    t0 = 3.0
    f = BG2.copy()
    header(f, t, t0, "Campaign 01", "リペアミルク\n10+1 添付キャンペーン", y=400)
    # 10本 + 1本 のボトル演出
    mini = load_cutout("repairmilk.png", 120, 160)
    cols, gx, gy = 5, 150, 175
    for i in range(10):
        r, c = divmod(i, cols)
        q = ease_back(prog(t, t0 + 0.5 + i * 0.06, 0.4))
        x = W / 2 + (c - 2) * gx
        y = 760 + r * gy
        put(f, mini, x, y + (1 - clamp(q)) * 60, clamp(q * 1.6), 0.7 + 0.3 * q)
    # +1 本（ゴールドで強調）
    q = ease_back(prog(t, t0 + 1.35, 0.5))
    big = load_cutout("repairmilk.png", 220, 300)
    glow = pill(270, 270, GOLD_L + (200,), radius=135)
    pulse = 1 + 0.04 * math.sin(t * 7)
    put(f, glow, W / 2, 1200, clamp(q), clamp(q) * pulse)
    put(f, big, W / 2, 1190, clamp(q), clamp(q) * pulse, shadow=True)
    tag = text_sprite("+1本", 58, WHITE, bold=2)
    put(f, pill(tag.width + 40, 90, ROSE + (255,)), W / 2 + 160, 1090, clamp(q), clamp(q), rot=-8)
    put(f, tag, W / 2 + 160, 1090, clamp(q), clamp(q), rot=-8)

    p = ease_out(prog(t, t0 + 1.7, 0.5))
    put(f, text_sprite("10個注文で 1本サービス！", 70, INK, bold=2), W / 2, 1400 + (1 - p) * 30, p)
    put(f, text_sprite("対象：アミー リペアミルク 200ml", 40, SAGE_D, bold=1), W / 2, 1485, p)
    period_chip(f, t, t0 + 2.1, "期間 11/1(日) 〜 12/31(木)", 1590)
    return f


def scene_refill(t):
    t0 = 7.6
    f = BG3.copy()
    header(f, t, t0, "Campaign 02", "アミー詰め替え", y=330)
    q = ease_back(prog(t, t0 + 0.3, 0.55))
    stamp = text_sprite("10%OFF", 210, ROSE, stroke=(WHITE, 8), bold=3)
    put(f, stamp, W / 2, 560, clamp(q), 1.6 - 0.6 * clamp(q) if q < 1 else 1 + 0.02 * math.sin(t * 6), rot=-4)

    items = [("shampoo1000.jpg", 300, 420, W / 2 - 300, 0.0), ("melty1000.jpg", 300, 420, W / 2 + 300, 0.1),
             ("repairmilk_refill.png", 330, 460, W / 2, 0.2)]
    for n, mw, mh, x, d in items:
        p = ease_out(prog(t, t0 + 0.7 + d, 0.6))
        put(f, load_cutout(n, mw, mh), x, 950 + (1 - p) * 160, p, shadow=True)
    for n, x, d in [("jure01.png", W / 2 - 150, 0.35), ("jure03.png", W / 2 + 150, 0.45)]:
        p = ease_back(prog(t, t0 + 0.9 + d, 0.5))
        put(f, load_cutout(n, 170, 210), x, 1100, clamp(p), clamp(p), shadow=True)

    lst = ["モイストケア シャンプー 1000ml", "モイストケア トリートメント メルティ 1000g",
           "モイストケア トリートメント エアリー 1000g", "ジュレ01 ナチュラル / 03 ハード 500g", "リペアミルク 1000g"]
    p = ease_out(prog(t, t0 + 1.4, 0.4))
    put(f, pill(900, 330, (255, 255, 255, 200), radius=36), W / 2, 1370, p)
    for i, s in enumerate(lst):
        pi = ease_out(prog(t, t0 + 1.5 + i * 0.09, 0.35))
        put(f, text_sprite("・" + s, 38, INK, bold=1), W / 2 + (1 - pi) * 40, 1245 + i * 62, pi)
    period_chip(f, t, t0 + 2.0, "期間 11/1(日) 〜 12/31(木)", 1600)
    return f


DEPTS = [
    ("ヘアケア部門", "シャンプー・トリートメント", ["shampoo1000.jpg", "melty1000.jpg"]),
    ("アウトバス部門", "リペアミルク", ["repairmilk.png"]),
    ("スタイリング部門", "ジュレ各種・オイル・バーム", ["jure01.png", "shine_oil.png", "balm.png"]),
    ("詰め替え部門", "全商品の詰替サイズ", ["repairmilk_refill.png", "shampoo1000.jpg"]),
]


def scene_depts(t):
    t0 = 12.2
    f = BG4.copy()
    header(f, t, t0, "Campaign 03 ｜ 12月", "部門別 店別対抗戦", y=330)
    period_chip(f, t, t0 + 0.3, "期間 12/1(火) 〜 12/31(木)", 500, bgc=GOLD)
    cw, ch = 470, 440
    for i, (name, sub, imgs) in enumerate(DEPTS):
        r, c = divmod(i, 2)
        cx = W / 2 + (c - 0.5) * (cw + 30)
        cy = 860 + r * (ch + 30)
        q = ease_back(prog(t, t0 + 0.55 + i * 0.15, 0.5))
        a = clamp(q * 1.5)
        s = 0.7 + 0.3 * q
        put(f, pill(cw, ch, (255, 255, 255, 235), outline=GOLD_L + (255,), ow=4, radius=40), cx, cy, a, s, shadow=True)
        n = len(imgs)
        for k, im in enumerate(imgs):
            spr = load_cutout(im, 170 if n > 1 else 220, 220)
            off = (k - (n - 1) / 2) * (130 if n == 3 else 160)
            put(f, spr, cx + off * s, cy - 60 * s, a, s)
        put(f, text_sprite(name, 46, INK, bold=2), cx, cy + 110 * s, a, s)
        put(f, text_sprite(sub, 30, SAGE_D, bold=1), cx, cy + 168 * s, a, s)
    p = ease_out(prog(t, t0 + 1.4, 0.4))
    put(f, text_sprite("4部門で売上を競おう！", 54, INK, bold=2), W / 2, 1600, p)
    return f


_rnd = random.Random(42)
CONFETTI = [(_rnd.uniform(0, W), _rnd.uniform(-H, 0), _rnd.uniform(220, 420), _rnd.uniform(0, 360),
             _rnd.uniform(-200, 200), _rnd.choice([GOLD, GOLD_L, ROSE, WHITE, (170, 200, 190)]),
             _rnd.randint(14, 26)) for _ in range(140)]


def confetti(frame, t, t0):
    if t < t0:
        return
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    dt = t - t0
    for x, y, vy, a0, spin, col, sz in CONFETTI:
        yy = y + vy * dt * 1.6
        if not (-40 < yy < H + 40):
            continue
        xx = x + math.sin(dt * 2 + a0) * 40
        ang = math.radians(a0 + spin * dt)
        w2, h2 = sz * abs(math.cos(ang)) / 2 + 2, sz * 0.35
        d.rectangle((xx - w2, yy - h2, xx + w2, yy + h2), fill=col + (230,))
    frame.alpha_composite(lay)


def scene_prize(t):
    t0 = 16.0
    f = BG5.copy()
    # 放射状の光
    rays = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rays)
    cx, cy = W / 2, 760
    for k in range(16):
        a = math.radians(k * 22.5 + (t - t0) * 12)
        b = a + math.radians(8)
        L = 1600
        rd.polygon([(cx, cy), (cx + L * math.cos(a), cy + L * math.sin(a)), (cx + L * math.cos(b), cy + L * math.sin(b))],
                   fill=GOLD + (28,))
    f.alpha_composite(rays)

    p = ease_out(prog(t, t0, 0.45))
    put(f, text_sprite("12月 部門別店別対抗戦", 46, GOLD_L, bold=2), W / 2, 330, p)
    put(f, text_sprite("各部門 1位のサロンに", 70, WHITE, bold=2), W / 2, 430 + (1 - p) * 30, p)
    p2 = ease_back(prog(t, t0 + 0.25, 0.5))
    put(f, text_sprite("人数分プレゼント！", 84, GOLD_L, bold=2), W / 2, 540, clamp(p2), 0.8 + 0.2 * p2)

    tro = ease_back(prog(t, t0 + 0.45, 0.6))
    put(f, emoji_sprite("🏆", 250), W / 2, 790 + math.sin(t * 3) * 8, clamp(tro), clamp(tro))

    # 賞品カード 2枚
    for i, (emo, l1, l2) in enumerate([("💴", "賞金", "5,000円"), ("🎂", "ケーキ", "プレゼント")]):
        q = ease_back(prog(t, t0 + 0.8 + i * 0.2, 0.5))
        x = W / 2 + (i - 0.5) * 470
        y = 1120
        put(f, pill(430, 340, (255, 250, 240, 255), outline=GOLD + (255,), ow=6, radius=40), x, y, clamp(q), clamp(q))
        put(f, emoji_sprite(emo, 120), x, y - 85, clamp(q), clamp(q))
        put(f, text_sprite(l1, 42, SAGE_D, bold=2), x, y + 20, clamp(q), clamp(q))
        put(f, text_sprite(l2, 64 if i == 0 else 56, ROSE, bold=2), x, y + 95, clamp(q), clamp(q))
    put(f, text_sprite("＋", 80, GOLD_L, bold=3), W / 2, 1120, clamp(prog(t, t0 + 1.1, 0.3)))

    confetti(f, t, t0 + 1.2)

    # CTA
    c = ease_back(prog(t, t0 + 1.6, 0.55))
    pulse = 1 + 0.035 * math.sin((t - t0) * 8) if c >= 1 else c
    spr = text_sprite("賞金・景品をゲットしよう！", 70, INK, bold=2)
    put(f, pill(spr.width + 80, 150, GOLD_L + (255,)), W / 2, 1420, clamp(c), pulse, shadow=True)
    put(f, spr, W / 2, 1420, clamp(c), pulse)
    p3 = ease_out(prog(t, t0 + 2.1, 0.4))
    put(f, text_sprite("11月の準備から 12月の販促まで、全員でがんばろう！", 36, WHITE, bold=1), W / 2, 1560, p3)
    return f


SCENES = [(0.0, 3.0, scene_open), (3.0, 7.6, scene_milk), (7.6, 12.2, scene_refill),
          (12.2, 16.0, scene_depts), (16.0, DUR, scene_prize)]
XF = 0.3  # クロスフェード秒数


def render(t):
    for i, (a, b, fn) in enumerate(SCENES):
        if a <= t < b or (i == len(SCENES) - 1 and t >= a):
            fr = fn(t)
            if i + 1 < len(SCENES) and t > b - XF:
                nxt = SCENES[i + 1][2](t)
                k = ease_in_out((t - (b - XF)) / XF)
                fr = Image.blend(fr, nxt, k)
            return fr
    return SCENES[-1][2](t)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--stills":
        for ts in [1.8, 5.8, 10.6, 14.5, 17.0, 19.5]:
            render(ts).convert("RGB").save(os.path.join(HERE, f"preview_{ts:04.1f}.jpg"), quality=85)
        return
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
           "-shortest", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-profile:v", "high", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "128k", OUT]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(DUR * FPS)
    for i in range(n):
        proc.stdin.write(render(i / FPS).convert("RGB").tobytes())
        if i % 60 == 0:
            print(f"frame {i}/{n}", flush=True)
    proc.stdin.close()
    proc.wait()
    print("wrote", OUT)


if __name__ == "__main__":
    main()
