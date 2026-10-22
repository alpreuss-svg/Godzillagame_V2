"""Gebäudebaukasten für Tokio 1984: Fassaden als prozedurale Texturen (Tag + nachts beleuchtete Fenster),
Hochhäuser in Shinjuku, Büros, Danchi-Wohnblöcke, Läden mit Leuchtreklame, Holzhäuser, Hafenhallen.
Ursprung jedes Gebäudes = Mitte der Grundfläche am Boden. Ein Objekt pro Gebäudetyp."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector
from common import link, material, make_image, obj_from_bm

V = Vector
RNG = np.random.default_rng(1984)


# ---------------- Fassaden-Texturen ----------------
def _grain(h, w, amt, scale=1.0):
    n = RNG.normal(0, 1, (h // 8 + 2, w // 8 + 2))
    n = np.kron(n, np.ones((8, 8)))[:h, :w]
    fine = RNG.normal(0, 1, (h, w))
    return (n * 0.6 + fine * 0.4) * amt * scale


def _lit_color():
    r = RNG.random()
    if r < 0.55:
        c = np.array([1.0, 0.82, 0.55])     # Glühlampe
    elif r < 0.9:
        c = np.array([0.78, 0.9, 1.0])      # Leuchtstoffröhre
    else:
        c = np.array([1.0, 0.95, 0.85])
    return c * (0.55 + 0.45 * RNG.random())


def facade_grid(W, H, cols, floors, wall, glass, frame_px, sill_px, lit_p, mull=0, glass_grad=True, curtains=0.0):
    """Allgemeines Fensterraster. Rückgabe (basecolor, emission) als HxWx3 (sRGB)."""
    base = np.ones((H, W, 3)) * np.array(wall)
    base += _grain(H, W, 0.035)[:, :, None]
    emis = np.zeros((H, W, 3))
    cw, fh = W // cols, H // floors
    for fy in range(floors):
        for cx in range(cols):
            x0, x1 = cx * cw + frame_px, (cx + 1) * cw - frame_px
            y1 = H - fy * fh - sill_px      # Zeile 0 = oben -> Etage 0 unten
            y0 = H - (fy + 1) * fh + frame_px
            g = np.ones((y1 - y0, x1 - x0, 3)) * np.array(glass)
            if glass_grad:
                ramp = np.linspace(1.25, 0.75, y1 - y0)[:, None, None]
                g = g * ramp
            base[y0:y1, x0:x1] = g
            if RNG.random() < lit_p:
                c = _lit_color()
                e = np.ones((y1 - y0, x1 - x0, 3)) * c
                if curtains and RNG.random() < curtains:
                    e *= 0.45
                if RNG.random() < 0.3:  # nur halb beleuchtet
                    e[:, : (x1 - x0) // 2] *= 0.25
                emis[y0:y1, x0:x1] = e
                base[y0:y1, x0:x1] = base[y0:y1, x0:x1] * 0.4 + c * 0.35
            if mull:
                for mx in range(x0 + (x1 - x0) // mull, x1, max(1, (x1 - x0) // mull)):
                    base[y0:y1, mx:mx + 2] = np.array(wall) * 0.7
                    emis[y0:y1, mx:mx + 2] = 0
    return np.clip(base, 0, 1), np.clip(emis, 0, 1)


def tex_glass():
    return facade_grid(512, 512, 8, 8, (0.30, 0.32, 0.35), (0.12, 0.16, 0.22), 3, 16, 0.33, mull=2)


def tex_office():
    return facade_grid(512, 512, 10, 8, (0.62, 0.6, 0.56), (0.1, 0.12, 0.15), 6, 24, 0.3, mull=2)


def tex_apt():
    b, e = facade_grid(512, 512, 8, 8, (0.66, 0.64, 0.6), (0.12, 0.12, 0.13), 8, 18, 0.42, curtains=0.5)
    fh = 64
    for fy in range(8):   # Balkonbrüstungen
        y = 512 - fy * fh - 18
        b[y - 4:y + 8, :] = np.array([0.74, 0.73, 0.7]) + _grain(12, 512, 0.02)[:, :, None]
        e[y - 4:y + 8, :] = 0
        for x in range(0, 512, 64):
            b[y - 30:y + 8, x:x + 4] = np.array([0.5, 0.5, 0.48])
            e[y - 30:y + 8, x:x + 4] = 0
    return b, e


NEON = [(1.0, 0.2, 0.25), (0.2, 0.9, 1.0), (1.0, 0.75, 0.15), (0.4, 1.0, 0.4), (1.0, 0.3, 0.9), (1.0, 1.0, 0.95)]


def tex_shop():
    W = H = 256
    b, e = facade_grid(W, H, 6, 4, (0.5, 0.46, 0.42), (0.12, 0.12, 0.14), 5, 12, 0.4)
    # Erdgeschoss: Ladenfront hell erleuchtet
    y0, y1 = H - 60, H - 4
    b[y0:y1, 6:W - 6] = np.array([0.35, 0.33, 0.3])
    e[y0:y1, 6:W - 6] = np.array([1.0, 0.92, 0.75]) * 0.9
    b[y0 - 14:y0, :] = np.array([0.25, 0.22, 0.2])
    # Leuchtreklame-Bänder mit "Schriftzeichen"
    for k in range(3):
        c = np.array(NEON[RNG.integers(len(NEON))])
        x0 = 10 + k * 82
        ys, ye = 30, H - 80
        b[ys:ye, x0:x0 + 26] = c * 0.35
        e[ys:ye, x0:x0 + 26] = c * 0.35
        for gy in range(ys + 6, ye - 16, 22):
            e[gy:gy + 16, x0 + 5:x0 + 21] = c
            e[gy + 6:gy + 9, x0 + 8:x0 + 18] = c * 0.3
            e[gy + 2:gy + 14, x0 + 12:x0 + 14] = c * 0.3
    return np.clip(b, 0, 1), np.clip(e, 0, 1)


def tex_house():
    W, H = 256, 128
    b = np.ones((H, W, 3)) * np.array([0.72, 0.68, 0.6]) + _grain(H, W, 0.04)[:, :, None]
    e = np.zeros((H, W, 3))
    b[:, ::32] = np.array([0.3, 0.22, 0.16])        # Holzständer
    b[H - 8:, :] = np.array([0.32, 0.3, 0.28])     # Sockel
    b[H // 2 - 3:H // 2 + 3, :] = np.array([0.3, 0.22, 0.16])
    for x0 in (20, 100, 180):
        for (y0, y1) in ((14, 50), (H // 2 + 12, H - 16)):
            if RNG.random() < 0.8:
                b[y0:y1, x0:x0 + 48] = np.array([0.82, 0.8, 0.72])  # Shoji
                b[y0:y1, x0 + 15:x0 + 17] = b[y0:y1, x0 + 31:x0 + 33] = np.array([0.35, 0.27, 0.2])
                b[y0 + 12:y0 + 14, x0:x0 + 48] = np.array([0.35, 0.27, 0.2])
                if RNG.random() < 0.55:
                    e[y0:y1, x0:x0 + 48] = np.array([1.0, 0.78, 0.45]) * 0.7
    return np.clip(b, 0, 1), np.clip(e, 0, 1)


def tex_ware():
    W = H = 256
    b = np.ones((H, W, 3)) * np.array([0.52, 0.55, 0.56])
    b *= (0.85 + 0.15 * np.sin(np.arange(W) / W * 2 * np.pi * 32))[None, :, None]
    b += _grain(H, W, 0.05)[:, :, None]
    b[H - 120:H, 20:90] = np.array([0.35, 0.36, 0.36])  # Rolltor
    b[H - 120:H, 20:90] *= (0.9 + 0.1 * np.sin(np.arange(120) / 2.0))[:, None, None]
    e = np.zeros((H, W, 3))
    e[H - 140:H - 128, 30:80] = np.array([1.0, 0.85, 0.6]) * 0.8
    return np.clip(b, 0, 1), e


def tex_roof():
    W = H = 256
    b = np.ones((H, W, 3)) * np.array([0.4, 0.4, 0.39]) + _grain(H, W, 0.07)[:, :, None]
    b[::64, :] *= 0.7
    b[:, ::64] *= 0.7
    return np.clip(b, 0, 1)


def tex_kawara():
    W = H = 128
    b = np.ones((H, W, 3)) * np.array([0.22, 0.24, 0.28])
    b *= (0.75 + 0.25 * np.abs(np.sin(np.arange(W) / W * np.pi * 16)))[None, :, None]
    b[::16, :] *= 0.6
    b += _grain(H, W, 0.03)[:, :, None]
    return np.clip(b, 0, 1)


# tile = Meter, die eine Textur abdeckt (Breite, Höhe)
STYLES = {
    'glass': (tex_glass, (32, 32)), 'office': (tex_office, (30, 32)), 'apt': (tex_apt, (24, 24)),
    'shop': (tex_shop, (16, 16)), 'house': (tex_house, (12, 6)), 'ware': (tex_ware, (24, 24)),
}
MI = {}


def make_materials():
    mats = []
    for k, (fn, _) in STYLES.items():
        b, e = fn()
        m = material('F_' + k, rough=0.55 if k == 'glass' else 0.85, metal=0.3 if k == 'glass' else 0,
                     img=make_image('T_' + k, b), emit_img=make_image('TE_' + k, e), emit_strength=1.0)
        MI[k] = len(mats); mats.append(m)
    for k, arr, rough in (('roof', tex_roof(), 0.95), ('kawara', tex_kawara(), 0.7)):
        MI[k] = len(mats); mats.append(material('F_' + k, rough=rough, img=make_image('T_' + k, arr)))
    MI['metal'] = len(mats); mats.append(material('F_metal', color=(0.55, 0.56, 0.58), rough=0.5, metal=0.6))
    MI['red'] = len(mats); mats.append(material('F_redlight', color=(0.3, 0.02, 0.02), emit=(1, 0.08, 0.05), emit_strength=4))
    MI['neon'] = len(mats); mats.append(material('F_neon', color=(0.3, 0.1, 0.12), emit=(1.0, 0.25, 0.35), emit_strength=2.5))
    MI['white'] = len(mats); mats.append(material('F_white', color=(0.78, 0.78, 0.76), rough=0.6))
    MI['dark'] = len(mats); mats.append(material('F_dark', color=(0.14, 0.14, 0.15), rough=0.9))
    return mats


# ---------------- Geometrie ----------------
def prism(bm, uv, poly, z0, z1, wall, roof, tile, uoff=0.0, voff=0.0, top=True):
    tw, th = tile
    n = len(poly)
    bot = [bm.verts.new((p[0], p[1], z0)) for p in poly]
    tp = [bm.verts.new((p[0], p[1], z1)) for p in poly]
    acc = uoff
    for i in range(n):
        j = (i + 1) % n
        L = (V(poly[j]) - V(poly[i])).length
        f = bm.faces.new((bot[i], bot[j], tp[j], tp[i]))
        f.material_index = MI[wall]
        u0, u1 = acc / tw, (acc + L) / tw
        v0, v1 = (z0 + voff) / th, (z1 + voff) / th
        for loop, (u, v) in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
            loop[uv].uv = (u, v)
        acc += L
    if top:
        f = bm.faces.new(tp)
        f.material_index = MI[roof]
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / 32.0, loop.vert.co.y / 32.0)
    return tp


def rect(w, d, cx=0.0, cy=0.0):
    return [(cx - w / 2, cy - d / 2), (cx + w / 2, cy - d / 2), (cx + w / 2, cy + d / 2), (cx - w / 2, cy + d / 2)]


def box(bm, uv, w, d, z0, h, wall, roof='roof', cx=0.0, cy=0.0, tile=None):
    tile = tile or STYLES.get(wall, (None, (8, 8)))[1]
    return prism(bm, uv, rect(w, d, cx, cy), z0, z0 + h, wall, roof, tile)


def cyl(bm, uv, r, z0, h, mat, roof=None, cx=0.0, cy=0.0, seg=12):
    poly = [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    return prism(bm, uv, poly, z0, z0 + h, mat, roof or mat, (2 * math.pi * r, 8))


def rooftop(bm, uv, w, d, z, n=3, tank=True):
    for _ in range(n):
        bw, bd = RNG.uniform(2, 5), RNG.uniform(2, 5)
        cx, cy = RNG.uniform(-w / 2 + 3, w / 2 - 3), RNG.uniform(-d / 2 + 3, d / 2 - 3)
        box(bm, uv, bw, bd, z, RNG.uniform(1.5, 3), 'metal', 'metal', cx, cy, (8, 8))
    if tank:
        cyl(bm, uv, 2.2, z, 4, 'white', cx=w * 0.25, cy=-d * 0.2, seg=8)


def antenna(bm, uv, z, h, cx=0.0, cy=0.0):
    box(bm, uv, 0.8, 0.8, z, h, 'metal', 'metal', cx, cy, (4, 4))
    box(bm, uv, 1.4, 1.4, z + h, 1.0, 'red', 'red', cx, cy, (4, 4))


def gable(bm, uv, w, d, z, rh):
    """Satteldach mit Kawara-Ziegeln, First entlang Y, leichter Überstand."""
    o = 0.7
    xs, ys = w / 2 + o, d / 2 + o
    a = [bm.verts.new(p) for p in ((-xs, -ys, z), (xs, -ys, z), (xs, ys, z), (-xs, ys, z))]
    r0, r1 = bm.verts.new((0, -ys, z + rh)), bm.verts.new((0, ys, z + rh))
    for quad in ((a[0], r0, r1, a[3]), (a[1], a[2], r1, r0)):
        f = bm.faces.new(quad); f.material_index = MI['kawara']
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.y / 6.0, abs(loop.vert.co.x) / 3.0)
    for tri in ((a[0], a[1], r0), (a[2], a[3], r1)):
        f = bm.faces.new(tri); f.material_index = MI['house']
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / 12.0, (loop.vert.co.z) / 6.0)


CATALOG = {}


def building(name):
    def deco(fn):
        CATALOG[name] = fn
        return fn
    return deco


@building('tower_glass')
def _(bm, uv):
    box(bm, uv, 34, 34, 0, 128, 'glass'); box(bm, uv, 28, 28, 128, 12, 'glass')
    rooftop(bm, uv, 28, 28, 140, 2, False); antenna(bm, uv, 140, 14, 6, 4)
    return (34, 34, 140)


@building('tower_tri')
def _(bm, uv):   # dreieckiger Turm wie das Sumitomo-Gebäude
    R, c = 27, 5.0
    poly = []
    for k in range(3):
        a = math.radians(90 + 120 * k)
        p = V((R * math.cos(a), R * math.sin(a)))
        for s in (-1, 1):
            b = math.radians(90 + 120 * (k + s))
            q = V((R * math.cos(b), R * math.sin(b)))
            poly.append(tuple(p.lerp(q, c / (q - p).length * 1.6)))
        poly[-2], poly[-1] = poly[-1], poly[-2]
    prism(bm, uv, _hull(poly), 0, 152, 'glass', 'roof', STYLES['glass'][1])
    rooftop(bm, uv, 16, 16, 152, 2, False); antenna(bm, uv, 152, 10)
    return (46, 46, 152)


def _hull(pts):
    pts = sorted(set(pts))
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0: hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


@building('tower_slab')
def _(bm, uv):   # weiße Hotelscheibe wie das Keio Plaza
    box(bm, uv, 52, 24, 0, 112, 'office'); box(bm, uv, 64, 34, 0, 14, 'shop', 'roof', 0, 4)
    rooftop(bm, uv, 52, 24, 112, 4); antenna(bm, uv, 112, 8, -18, 0); antenna(bm, uv, 112, 8, 18, 0)
    return (64, 38, 112)


@building('tower_step')
def _(bm, uv):
    box(bm, uv, 32, 32, 0, 88, 'glass'); box(bm, uv, 25, 25, 88, 10, 'glass'); box(bm, uv, 17, 17, 98, 8, 'glass')
    antenna(bm, uv, 106, 12)
    return (32, 32, 106)


@building('office_a')
def _(bm, uv):
    box(bm, uv, 24, 22, 0, 42, 'office'); rooftop(bm, uv, 24, 22, 42)
    return (24, 22, 42)


@building('office_b')
def _(bm, uv):
    box(bm, uv, 18, 18, 0, 56, 'glass'); box(bm, uv, 10, 10, 56, 4, 'metal', 'metal', 0, 0, (8, 8))
    return (18, 18, 60)


@building('office_c')
def _(bm, uv):
    box(bm, uv, 32, 20, 0, 30, 'office'); box(bm, uv, 32, 20, 0, 5, 'shop'); rooftop(bm, uv, 32, 20, 30, 4)
    return (32, 20, 30)


@building('apt_a')
def _(bm, uv):
    box(bm, uv, 44, 12, 0, 27, 'apt'); rooftop(bm, uv, 44, 12, 27, 2, False)
    box(bm, uv, 5, 5, 27, 4, 'white', 'roof', -14, 0, (8, 8))
    return (44, 12, 31)


@building('apt_b')
def _(bm, uv):
    box(bm, uv, 16, 16, 0, 36, 'apt'); rooftop(bm, uv, 16, 16, 36, 1)
    return (16, 16, 40)


@building('shop_a')
def _(bm, uv):
    box(bm, uv, 12, 14, 0, 12, 'shop'); rooftop(bm, uv, 12, 14, 12, 1, False)
    box(bm, uv, 1.2, 4, 3, 12, 'neon', 'neon', 6.6, -4, (4, 4))
    return (12, 14, 15)


@building('shop_b')
def _(bm, uv):
    box(bm, uv, 10, 12, 0, 16, 'shop'); box(bm, uv, 10, 1, 16, 4, 'neon', 'neon', 0, -5.5, (4, 4))
    return (10, 12, 20)


@building('house_a')
def _(bm, uv):
    box(bm, uv, 9, 8, 0, 6, 'house', 'kawara', tile=(12, 6)); gable(bm, uv, 9, 8, 6, 2.8)
    return (10, 9, 9)


@building('house_b')
def _(bm, uv):
    box(bm, uv, 8, 11, 0, 6.5, 'house', 'kawara', tile=(12, 6)); gable(bm, uv, 8, 11, 6.5, 2.6)
    return (9, 12, 9)


@building('warehouse')
def _(bm, uv):
    box(bm, uv, 40, 24, 0, 12, 'ware', 'roof')
    return (40, 24, 12)


@building('oiltank')
def _(bm, uv):
    cyl(bm, uv, 13, 0, 15, 'white', 'white', seg=20); cyl(bm, uv, 2, 15, 1.2, 'metal', seg=6)
    return (26, 26, 16)


def rubble(bm, uv):
    """Schutthaufen in einer 1x1-Grundfläche, Höhe ~0.35 (wird im Spiel skaliert)."""
    for _ in range(26):
        s = RNG.uniform(0.08, 0.22)
        cx, cy = RNG.uniform(-0.42, 0.42), RNG.uniform(-0.42, 0.42)
        h = (0.35 - (abs(cx) + abs(cy)) * 0.35) * RNG.uniform(0.5, 1.0)
        tp = prism(bm, uv, [(cx + s * math.cos(a + 0.4 * RNG.random()), cy + s * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 5)[:-1]],
                   -0.05, max(0.04, h), 'roof', 'roof', (1, 1))
        for v in tp:
            v.co.x += RNG.uniform(-0.05, 0.05); v.co.y += RNG.uniform(-0.05, 0.05)


def build():
    mats = make_materials()
    objs = []
    for name, fn in CATALOG.items():
        bm = bmesh.new(); uv = bm.loops.layers.uv.new('UV')
        size = fn(bm, uv)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = obj_from_bm('B_' + name, bm, mats)
        ob['size'] = list(size)
        objs.append(ob)
    bm = bmesh.new(); uv = bm.loops.layers.uv.new('UV')
    rubble(bm, uv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    objs.append(obj_from_bm('B_rubble', bm, mats))
    return objs


def layout_preview(objs, cols=6, cell=72):
    """Raster mit den hohen Türmen hinten, damit die Kamera schräg von vorn alles sieht."""
    for i, o in enumerate(objs):
        o.location = ((i % cols) * cell, -(i // cols) * cell, 0)
        if o.name == 'B_rubble':
            o.scale = (30, 30, 30)
