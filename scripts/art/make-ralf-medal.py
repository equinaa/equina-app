"""Ralf's avatar: the app icon's "Medalha" treatment with a sparkle instead of the horse.

Polished brass rim, domed dark-enamel field, the sparkle (one large four-point star, one small one) as a raised
ivory inlay. Same light as the app icon (upper left). Transparent outside the rim.
  python -I scripts/art/make-ralf-medal.py <out_dir>   (numpy + opencv; copy the three PNGs to assets/ralf/)
  (was: python -I make_ralf.py <out_dir>)  -> ralf-medal.png (RGBA, 3x for a 44 pt avatar = 132 px; also 1x/2x),
                                       preview.png
"""
import sys
from pathlib import Path
import numpy as np, cv2

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
F = np.float32
M = 1024                      # render size; the medal fills the canvas
u = M / 132.0                 # 1 px at the 3x size, in render px
R_OUT = M / 2 - 2 * u
R_IN = R_OUT - 0.085 * M      # rim ~ 8.5% of the diameter, reads as a medal at 44 pt
C0 = M / 2 - 0.5
yy, xx = np.mgrid[0:M, 0:M].astype(F)
dx, dy = xx - C0, yy - C0
rr = np.sqrt(dx * dx + dy * dy) + F(1e-6)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255


def circ(R):
    return np.clip(R - rr + 0.5, 0, 1).astype(F)


def smoothstep(x):
    x = np.clip(x, 0, 1)
    return (x * x * (3 - 2 * x)).astype(F)


def blur(m, s):
    return cv2.GaussianBlur(m, (0, 0), s)


def shift(m, ox, oy):
    T = np.float32([[1, 0, ox], [0, 1, oy]])
    return cv2.warpAffine(m, T, (M, M), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def star(cx, cy, r, pinch=3.4):
    """A four-point sparkle: an astroid-like curve |x|^(2/p)+|y|^(2/p)=r^(2/p), rasterised with soft edges."""
    t = np.linspace(0, 2 * np.pi, 720)
    x = np.sign(np.cos(t)) * np.abs(np.cos(t)) ** pinch * r + cx
    y = np.sign(np.sin(t)) * np.abs(np.sin(t)) ** pinch * r + cy
    big = np.zeros((M * 4, M * 4), np.uint8)
    pts = np.round(np.c_[x, y] * 4).astype(np.int32)
    cv2.fillPoly(big, [pts], 255)
    return cv2.resize(big.astype(F) / 255, (M, M), interpolation=cv2.INTER_AREA)


def nrm(v):
    return v / np.linalg.norm(v)


L = nrm(np.array([-0.55, -0.70, 0.80]))
LXY = nrm(np.array([-0.6, -0.7]))
V = np.array([0.0, 0.0, 1.0])
H = nrm(L + V)
WARM = np.array([1.0, 0.78, 0.45], F)
facing = ((dx * LXY[0] + dy * LXY[1]) / rr).astype(F)


def dot3(n, v):
    return n[..., 0] * v[0] + n[..., 1] * v[1] + n[..., 2] * v[2]


def env(n, soft=0.045):
    R = 2 * n[..., 2:3] * n - V
    box = np.exp(-np.clip(1 - dot3(R, L), 0, None) / soft)
    sky = 0.16 + 0.22 * np.clip(-R[..., 1] * 0.5 + 0.5, 0, 1) ** 2
    return (box * 1.6 + sky).astype(F)


def normals_from_height(h):
    hx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) / 8
    hy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) / 8
    n = np.dstack([-hx, -hy, np.ones_like(h)])
    return n / np.linalg.norm(n, axis=2, keepdims=True)


inner = circ(R_IN + 1.5)
rim = circ(R_OUT) * (1 - circ(R_IN))
medal = circ(R_OUT)
# the sparkle: a large star a little up and left of centre, a small one lower right
spark = np.maximum(star(C0 - 0.07 * R_IN, C0 - 0.06 * R_IN, 0.68 * R_IN),
                   star(C0 + 0.50 * R_IN, C0 + 0.48 * R_IN, 0.26 * R_IN))
spark = blur(spark, 0.6 * u) * inner

img = np.zeros((M, M, 3), F)

# enamel field
t = np.clip(rr / R_IN, 0, 1)
BASE = hexrgb("#1A120C").astype(F)
AMBER = hexrgb("#3A2410").astype(F)
lift = smoothstep((t - 0.35) / 0.65) * smoothstep(-facing * 0.75 + 0.45)
en = BASE + (AMBER - BASE) * (0.85 * lift)[..., None]
slope = 0.45 * t ** 1.4
n_en = np.dstack([slope * dx / rr, slope * dy / rr, np.ones_like(rr)])
n_en /= np.linalg.norm(n_en, axis=2, keepdims=True)
en *= (0.80 + 0.28 * np.clip(dot3(n_en, L) / L[2], 0, 1.2))[..., None]
fres = 0.5 * (1 - n_en[..., 2]) ** 5
en += (fres * env(n_en) * 0.6)[..., None] * np.array([1.0, 0.94, 0.86], F)
en += (0.06 * np.clip(dot3(n_en, H), 0, 1) ** 80)[..., None]
glow = np.exp(-np.clip(R_IN - rr, 0, None) / (3 * u)) * smoothstep(-facing * 0.8 + 0.5)
en += (glow * 0.07)[..., None] * WARM
ao = 1 - 0.45 * blur(1 - inner, 2.5 * u) - 0.40 * blur(spark, 2.5 * u) * (1 - spark)
rim_cast = blur(shift(1 - circ(R_IN), 1.5 * u, 2 * u), 1.5 * u)
spark_cast = blur(shift(spark, 1.4 * u, 2.0 * u), 1.6 * u)
en *= np.clip(ao * (1 - 0.60 * rim_cast) * (1 - 0.75 * spark_cast), 0.15, 1)[..., None]
img = img * (1 - inner[..., None]) + en * inner[..., None]

# ivory sparkle inlay, with a bevel
IV = hexrgb("#EEE8DA").astype(F)
IV_HI = hexrgb("#FCFAF3").astype(F)
UMBER = np.array([120, 100, 80], F) / 255
sb = (spark > 0.5).astype(np.uint8)
d = cv2.distanceTransform(sb, cv2.DIST_L2, cv2.DIST_MASK_PRECISE) + (spark - 0.5) * sb
d = blur(d.astype(F), 0.8 * u)
BEVEL = 1.4 * u
tt = np.clip(d / BEVEL, 0, 1)
h_sp = BEVEL * 0.9 * (1 - (1 - tt) ** 2) + 4 * u * blur(sb.astype(F), 12 * u)
n_sp = normals_from_height(blur(h_sp.astype(F), 0.5 * u))
relief = (n_sp[..., 0] * LXY[0] + n_sp[..., 1] * LXY[1]) / np.maximum(np.hypot(n_sp[..., 0], n_sp[..., 1]), 1e-3)
relief = (relief * np.clip(np.hypot(n_sp[..., 0], n_sp[..., 1]) / 0.55, 0, 1)).astype(F)
col = IV + (IV_HI - IV) * np.clip(relief, 0, 1)[..., None]
col = col + (UMBER - col) * (np.clip(-relief, 0, 1) * 0.36)[..., None]
lam = np.clip(dot3(n_sp, L) / L[2], 0, 1.3)
col *= (0.93 + 0.07 * lam)[..., None] ** np.array([1.0, 1.1, 1.35], F)
col += (0.22 * np.clip(dot3(n_sp, H), 0, 1) ** 90 * (relief > 0))[..., None]
img = img * (1 - spark[..., None]) + np.clip(col, 0, 1) * spark[..., None]

# brass rim
rc = (R_IN + R_OUT) / 2
hw = (R_OUT - R_IN) / 2 + 0.5 * u
q = np.clip((rr - rc) / hw, -1, 1)
Q0 = -0.25
phi = np.where(q < Q0, -np.radians(60) * np.clip((Q0 - q) / (1 + Q0), 0, 1) ** 0.8,
               np.radians(58) * np.clip((q - Q0) / (1 - Q0), 0, 1) ** 1.1)
n_rim = np.dstack([np.sin(phi) * dx / rr, np.sin(phi) * dy / rr, np.cos(phi)]).astype(F)
lam = np.clip(dot3(n_rim, L), 0, 1)
e = 0.42 * (env(n_rim) - 0.12) + 0.55 * lam ** 1.5
DARK = np.array([0.21, 0.12, 0.05], F)
MID = hexrgb("#AA8550").astype(F)
HI = np.array([0.98, 0.93, 0.80], F)
e3 = e[..., None]
brass = np.where(e3 < 0.5, DARK + (MID - DARK) * (e3 / 0.5), MID + (HI - MID) * np.clip((e3 - 0.5) / 0.6, 0, 1))
brass *= (0.84 + 0.16 * facing)[..., None] ** np.array([1.0, 1.2, 1.6], F)
arc = smoothstep(facing * 1.4 + 0.1)
nh = np.clip(dot3(n_rim, H), 0, 1)
brass += (1.2 * nh ** 110 * arc)[..., None] * HI
brass += (0.22 * nh ** 18 * arc * np.clip(facing, 0, 1))[..., None] * np.array([1.0, 0.85, 0.55], F)
crease = np.exp(-((rr - R_IN) / (0.6 * u)) ** 2) * 0.40 + np.exp(-((rr - R_OUT) / (0.5 * u)) ** 2) * 0.25
brass *= (1 - crease)[..., None]
img = img * (1 - rim[..., None]) + np.clip(brass, 0, 1) * rim[..., None]

# out: premultiplied render -> straight RGBA at 3x / 2x / 1x of a 44 pt avatar
alpha = medal
for scale, name in ((3, "ralf-medal@3x.png"), (2, "ralf-medal@2x.png"), (1, "ralf-medal.png")):
    n = 44 * scale
    rgb = cv2.resize(img * alpha[..., None], (n, n), interpolation=cv2.INTER_AREA)
    a = cv2.resize(alpha, (n, n), interpolation=cv2.INTER_AREA)
    rgb = rgb / np.maximum(a, 1e-4)[..., None]
    out = np.dstack([np.clip(rgb, 0, 1)[..., ::-1], a]) * 255 + 0.5
    cv2.imwrite(str(OUT / name), out.astype(np.uint8))

# preview: on the Home header colour, at 3x, next to an "AL" avatar
pv = np.ones((180, 520, 3), F) * hexrgb("#0E0D0B").astype(F)
m3 = cv2.imread(str(OUT / "ralf-medal@3x.png"), cv2.IMREAD_UNCHANGED).astype(F) / 255
for x0 in (30, 360):
    a = m3[..., 3:4]
    pv[24:156, x0:x0 + 132] = pv[24:156, x0:x0 + 132] * (1 - a) + m3[..., 2::-1] * a
big = cv2.resize(img * alpha[..., None], (132, 132), interpolation=cv2.INTER_AREA)
cv2.imwrite(str(OUT / "preview.png"), (np.clip(pv, 0, 1)[..., ::-1] * 255 + 0.5).astype(np.uint8))
print("wrote", OUT)
