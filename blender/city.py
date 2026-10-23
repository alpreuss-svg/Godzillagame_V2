"""Gebäudebaukasten für Tokio 1984: Fassaden als prozedurale Texturen (Tag + nachts beleuchtete Fenster),
Hochhäuser in Shinjuku, Büros, Danchi-Wohnblöcke, Läden mit Leuchtreklame, Holzhäuser, Hafenhallen.
Ursprung jedes Gebäudes = Mitte der Grundfläche am Boden. Ein Objekt pro Gebäudetyp."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler
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
CELL = 12.0   # m: Wände werden in ein Raster dieser Größe geteilt, damit der Spiel-Shader sie eindellen/knicken kann


def prism(bm, uv, poly, z0, z1, wall, roof, tile, uoff=0.0, voff=0.0, top=True):
    tw, th = tile
    n = len(poly)
    nz = max(1, math.ceil((z1 - z0) / CELL - 0.01))
    zs = [z0 + (z1 - z0) * k / nz for k in range(nz + 1)]
    acc = uoff
    for i in range(n):
        a, b = V(poly[i]), V(poly[(i + 1) % n])
        L = (b - a).length
        nx = max(1, math.ceil(L / CELL - 0.01))
        grid = [[bm.verts.new((*a.lerp(b, s / nx), z)) for z in zs] for s in range(nx + 1)]
        for s in range(nx):
            for k in range(nz):
                f = bm.faces.new((grid[s][k], grid[s + 1][k], grid[s + 1][k + 1], grid[s][k + 1]))
                f.material_index = MI[wall]
                for loop, (ss, kk) in zip(f.loops, ((s, k), (s + 1, k), (s + 1, k + 1), (s, k + 1))):
                    loop[uv].uv = ((acc + L * ss / nx) / tw, (zs[kk] + voff) / th)
        acc += L
    tp = [bm.verts.new((p[0], p[1], z1)) for p in poly]
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


@building('landmark')
def _(bm, uv):   # Yokohama Landmark Tower: hoher, sich verjüngender Turm mit eingezogenen Ecken und Kronenaufbau
    box(bm, uv, 70, 56, 0, 18, 'shop', 'roof', 0, 6)                                  # Sockel (Einkaufszentrum)
    w = 44
    for k, h in enumerate((70, 50, 34)):
        z = 18 + sum((70, 50, 34)[:k])
        poly = [(-w / 2 + 5, -w / 2), (w / 2 - 5, -w / 2), (w / 2, -w / 2 + 5), (w / 2, w / 2 - 5),
                (w / 2 - 5, w / 2), (-w / 2 + 5, w / 2), (-w / 2, w / 2 - 5), (-w / 2, -w / 2 + 5)]
        prism(bm, uv, poly, z, z + h, 'glass', 'roof', STYLES['glass'][1])
        w -= 7
    box(bm, uv, w + 4, w + 4, 172, 6, 'metal', 'metal', 0, 0, (8, 8))                 # Krone
    rooftop(bm, uv, w, w, 178, 2, False); antenna(bm, uv, 178, 8)
    return (70, 56, 186)


@building('wheel')
def _(bm, uv):   # Riesenrad Cosmo Clock: Ring, Speichen, Gondeln mit Lichtern, zwei Stützen
    R, cz = 46, 54
    def rbar(a, b, t, mat):
        d = V(b) - V(a)
        q = d.to_track_quat('Z', 'Y')
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((V(a) + V(b)) / 2) @ q.to_matrix().to_4x4()
                                  @ Matrix.Diagonal((t, t, d.length, 1)))
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = MI[mat]
    N = 36
    ring = [(R * math.cos(2 * math.pi * i / N), 0, cz + R * math.sin(2 * math.pi * i / N)) for i in range(N)]
    for i in range(N):
        rbar(ring[i], ring[(i + 1) % N], 1.6, 'metal')
        if i % 3 == 0:
            rbar((0, 0, cz), ring[i], 0.6, 'metal')                                     # Speichen
            g = V(ring[i]) + V((0, 0, -3))
            box(bm, uv, 3.5, 3.5, g.z - 2, 3.5, 'neon', 'neon', g.x, 0, (4, 4))        # Gondeln (leuchten)
    for sx in (-1, 1):
        rbar((sx * 16, 3, 0), (0, 0, cz), 2.2, 'metal'); rbar((sx * 16, -3, 0), (0, 0, cz), 2.2, 'metal')
    cyl(bm, uv, 6, cz - 3, 6, 'red', seg=10)                                              # Nabe (Uhr)
    box(bm, uv, 40, 14, 0, 6, 'shop', 'roof')                                            # Station
    return (96, 14, cz + R + 2)


@building('messe')
def _(bm, uv):   # Makuhari Messe: lange, flache Ausstellungshalle mit gewölbtem Dach aus Segmenten
    W, D = 100, 74
    box(bm, uv, W, D, 0, 14, 'shop', 'roof')
    for k in range(9):                                   # Tonnendach: Streifen entlang X, zur Mitte höher
        y0 = -D / 2 + k * D / 9
        h = 5 + 9 * math.sin(math.pi * (k + 0.5) / 9)
        box(bm, uv, W - 4, D / 9 + 0.2, 14, h, 'metal', 'metal', 0, y0 + D / 18, (8, 8))
    for x in (-40, 0, 40):
        antenna(bm, uv, 27, 4, x, 0)
    return (W, D, 28)


@building('ftower')
def _(bm, uv):   # Fukuoka Tower: 234 m, schlanker Dreiecksschaft aus Spiegelglas, Aussichtskanzel, Antennenspitze
    tri = [(0, -14), (12, 7), (-12, 7)]
    prism(bm, uv, tri, 0, 120, 'glass', 'roof', STYLES['glass'][1])
    prism(bm, uv, [(x * 0.8, y * 0.8) for x, y in tri], 120, 116 + 80, 'glass', 'roof', STYLES['glass'][1])
    prism(bm, uv, [(x * 1.4, y * 1.4) for x, y in tri], 116, 126, 'office', 'roof', STYLES['office'][1])   # Kanzel
    box(bm, uv, 3, 3, 196, 34, 'metal', 'metal', 0, 0, (4, 4))
    box(bm, uv, 2, 2, 230, 4, 'red', 'red', 0, 0, (4, 4))
    box(bm, uv, 30, 26, 0, 8, 'shop', 'roof')
    return (30, 26, 234)


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


def rbox(bm, uv, size, loc, rot, mat, k=1.0):
    """Gedrehter Quader mit Box-Mapping (k = Texturwiederholungen pro Einheit)."""
    M = Matrix.Translation(loc) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=M)
    faces = {f for v in r['verts'] for f in v.link_faces}
    for f in faces:
        f.material_index = MI[mat]
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        a, b = [(1, 2), (0, 2), (0, 1)][ax]
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co[a] * k, loop.vert.co[b] * k)


def rubble(bm, uv, rng):
    """Schutthaufen in einer 1x1-Grundfläche, Höhe ~0.35 (wird im Spiel skaliert): unregelmäßiger Hügel, darauf
    Betonplatten, Fassadenbrocken mit Fenstern, herausragende Stahlträger und verkohlte Stücke."""
    N = 10
    bumps = [(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0.06, 0.12)) for _ in range(5)]

    def mound(x, y):
        r = math.hypot(x, y) / 0.5
        h = 0.22 * max(0.0, 1 - r * r) ** 0.7
        for bx, by, bh in bumps:
            h += bh * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / 0.012) * max(0.0, 1 - r)
        return h

    grid = [[bm.verts.new((x, y, mound(x, y) + (rng.uniform(-0.01, 0.01) if 0 < i < N and 0 < j < N else 0)))
             for j, y in enumerate(np.linspace(-0.5, 0.5, N + 1))] for i, x in enumerate(np.linspace(-0.5, 0.5, N + 1))]
    for i in range(N):
        for j in range(N):
            q = (grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1])
            if min(math.hypot(v.co.x, v.co.y) for v in q) > 0.47:
                continue                      # runder Hügel statt quadratischer Platte
            f = bm.faces.new(q)
            f.material_index = MI['roof']
            for loop in f.loops:
                loop[uv].uv = (loop.vert.co.x * 1.5, loop.vert.co.y * 1.5)

    def spot(rmax=0.42):
        a, r = rng.uniform(0, 2 * math.pi), math.sqrt(rng.random()) * rmax
        x, y = math.cos(a) * r, math.sin(a) * r
        return x, y, mound(x, y)

    for _ in range(46):   # Deckenplatten
        x, y, z = spot()
        s = (rng.uniform(0.07, 0.18), rng.uniform(0.05, 0.14), rng.uniform(0.012, 0.025))
        rbox(bm, uv, s, (x, y, z + s[2] * 0.3), (rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0, 6.3)), 'roof', 1.5)
    for _ in range(14):   # Fassadenbrocken, schräg gegeneinander gelehnt
        x, y, z = spot(0.36)
        s = (rng.uniform(0.12, 0.24), rng.uniform(0.012, 0.02), rng.uniform(0.07, 0.15))
        mat = ('office', 'apt', 'glass', 'shop')[rng.integers(4)]
        rbox(bm, uv, s, (x, y, z + s[2] * 0.25), (rng.uniform(0.35, 1.2) * rng.choice((-1, 1)), 0, rng.uniform(0, 6.3)), mat, 1.0)
    for _ in range(16):   # Stahlträger
        x, y, z = spot(0.38)
        L = rng.uniform(0.1, 0.24)
        rbox(bm, uv, (0.008, 0.008, L), (x, y, z + L * 0.3), (rng.uniform(-0.9, 0.9), rng.uniform(-0.9, 0.9), 0), 'metal', 4)
    for k in range(34):   # Brocken: verkohlt und Beton
        x, y, z = spot(0.44)
        s = rng.uniform(0.025, 0.07)
        rbox(bm, uv, (s, s * 0.8, s * 0.6), (x, y, z), (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3)),
             'dark' if k % 3 == 0 else 'roof', 2)


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
    for name, seed in (('B_rubble', 11), ('B_rubble_b', 23)):   # zwei Varianten gegen Wiederholung
        bm = bmesh.new(); uv = bm.loops.layers.uv.new('UV')
        rubble(bm, uv, np.random.default_rng(seed))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        objs.append(obj_from_bm(name, bm, mats))
    return objs


def layout_preview(objs, cols=6, cell=72):
    """Raster mit den hohen Türmen hinten, damit die Kamera schräg von vorn alles sieht."""
    for i, o in enumerate(objs):
        o.location = ((i % cols) * cell, -(i // cols) * cell, 0)
        if o.name.startswith('B_rubble'):
            o.scale = (30, 30, 30)
