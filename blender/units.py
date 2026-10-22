"""Militär, Super-X, Verkehr und Requisiten. Alle Fahrzeuge schauen nach -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler
from common import link, material, obj_from_bm

V = Vector
RNG = np.random.default_rng(7)
MI = {}


def mats():
    defs = [
        ('olive', dict(color=(0.27, 0.29, 0.19), rough=0.85)),
        ('track', dict(color=(0.07, 0.07, 0.07), rough=0.95)),
        ('steel', dict(color=(0.42, 0.44, 0.46), rough=0.45, metal=0.7)),
        ('gun', dict(color=(0.3, 0.32, 0.34), rough=0.35, metal=0.8)),
        ('sxblue', dict(color=(0.2, 0.25, 0.32), rough=0.4, metal=0.6)),
        ('glass', dict(color=(0.05, 0.07, 0.09), rough=0.1, metal=0.2, emit=(0.4, 0.75, 1.0), emit_strength=0.6)),
        ('lamp', dict(color=(1, 1, 0.9), emit=(1.0, 0.92, 0.75), emit_strength=6)),
        ('red', dict(color=(0.6, 0.05, 0.04), emit=(1, 0.1, 0.05), emit_strength=2)),
        ('yellow', dict(color=(0.85, 0.65, 0.1), rough=0.6)),
        ('white', dict(color=(0.85, 0.85, 0.83), rough=0.5)),
        ('black', dict(color=(0.04, 0.04, 0.04), rough=0.7)),
        ('leaf', dict(color=(0.12, 0.2, 0.1), rough=0.9)),
        ('bark', dict(color=(0.22, 0.17, 0.12), rough=0.9)),
        ('concrete', dict(color=(0.45, 0.44, 0.42), rough=0.95)),
        ('hull', dict(color=(0.32, 0.12, 0.1), rough=0.7)),
        ('silver', dict(color=(0.7, 0.72, 0.74), rough=0.35, metal=0.6)),
        ('green', dict(color=(0.35, 0.72, 0.3), rough=0.5)),
    ]
    out = []
    for i, (k, kw) in enumerate(defs):
        MI[k] = i
        out.append(material('U_' + k, **kw))
    return out


def _new_faces(bm, before):
    return [f for f in bm.faces if f not in before]


def cube(bm, size, loc, mat, rot=(0, 0, 0), taper=None):
    before = set(bm.faces)
    M = Matrix.Translation(loc) @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=M)
    if taper:  # obere Fläche verkleinern (Panzerwanne, Turm)
        top = max(v.co.z for v in r['verts'])
        c = V(loc)
        for v in r['verts']:
            if abs(v.co.z - top) < 1e-4:
                v.co.x = c.x + (v.co.x - c.x) * taper[0]
                v.co.y = c.y + (v.co.y - c.y) * taper[1]
    for f in _new_faces(bm, before):
        f.material_index = MI[mat]


def cylinder(bm, r1, r2, depth, loc, mat, rot=(0, 0, 0), seg=10):
    before = set(bm.faces)
    M = Matrix.Translation(loc) @ Euler([math.radians(a) for a in rot]).to_matrix().to_4x4()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r1, radius2=r2, depth=depth, matrix=M)
    for f in _new_faces(bm, before):
        f.material_index = MI[mat]


def sphere(bm, r, loc, mat, scale=(1, 1, 1), seg=10, rings=6):
    before = set(bm.faces)
    M = Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, matrix=M)
    for f in _new_faces(bm, before):
        f.material_index = MI[mat]


def tank(bm):   # Typ 74
    cube(bm, (3.3, 9.0, 1.3), (0, 0, 1.25), 'olive', taper=(0.85, 0.82))
    cube(bm, (3.5, 8.2, 1.0), (0, 0.2, 0.55), 'track')
    cube(bm, (3.7, 6.5, 0.15), (0, 0.6, 1.1), 'olive')
    cylinder(bm, 1.7, 1.25, 1.0, (0, 0.8, 2.4), 'olive', seg=12)
    cylinder(bm, 0.18, 0.15, 6.2, (0, -3.5, 2.55), 'olive', rot=(90, 0, 0), seg=8)
    cylinder(bm, 0.28, 0.28, 0.8, (0, -6.5, 2.55), 'olive', rot=(90, 0, 0), seg=8)
    cube(bm, (0.5, 0.5, 0.4), (0.7, 1.3, 3.1), 'black')


def truck(bm):  # Raketenwerfer-LKW
    cube(bm, (2.6, 2.4, 2.3), (0, -3.6, 1.9), 'olive')
    cube(bm, (2.4, 0.2, 0.9), (0, -4.82, 2.3), 'glass')
    cube(bm, (2.6, 8.4, 0.5), (0, 0, 0.95), 'olive')
    for y in (-3.3, 0.5, 2.8):
        for x in (-1.2, 1.2):
            cylinder(bm, 0.55, 0.55, 0.4, (x, y, 0.55), 'black', rot=(0, 90, 0), seg=10)
    cube(bm, (2.2, 4.6, 1.3), (0, 1.3, 2.3), 'olive', rot=(-14, 0, 0))
    cube(bm, (2.0, 0.1, 1.1), (0, -1.0, 2.9), 'black', rot=(-14, 0, 0))


def heli(bm):   # AH-1 Cobra
    sphere(bm, 1, (0, -1.0, 2.0), 'olive', scale=(1.0, 4.2, 1.35), seg=12, rings=8)
    sphere(bm, 1, (0, -2.6, 2.45), 'glass', scale=(0.75, 1.8, 0.8), seg=10, rings=6)
    cylinder(bm, 0.45, 0.22, 7.5, (0, 5.5, 2.3), 'olive', rot=(90, 0, 0), seg=8)
    cube(bm, (0.15, 1.6, 2.0), (0, 9.0, 3.0), 'olive')
    cube(bm, (2.8, 1.0, 0.15), (0, 8.2, 2.3), 'olive')
    for x in (-1.1, 1.1):
        cube(bm, (0.12, 4.6, 0.12), (x, -0.8, 0.25), 'black')
        cube(bm, (0.12, 0.12, 1.0), (x, -2.0, 0.75), 'black')
        cube(bm, (0.12, 0.12, 1.0), (x, 0.6, 0.75), 'black')
    cube(bm, (3.6, 0.8, 0.25), (0, -0.4, 1.8), 'olive')
    for x in (-1.9, 1.9):
        cylinder(bm, 0.35, 0.35, 2.2, (x, -0.6, 1.5), 'steel', rot=(90, 0, 0), seg=8)
    cylinder(bm, 0.35, 0.35, 0.8, (0, -0.8, 3.5), 'steel', seg=8)
    cube(bm, (0.25, 0.3, 0.3), (0, -5.2, 1.6), 'red')


def heli_rotor(bm):
    cube(bm, (0.5, 13.5, 0.06), (0, 0, 0), 'black')
    cube(bm, (13.5, 0.5, 0.06), (0, 0, 0), 'black')


def superx(bm):
    """Super-X (1984): flacher, kantiger Panzerflugkörper, Kuppel, zwei Seitenleitwerke, Scheinwerfer vorn."""
    cube(bm, (16, 26, 3.2), (0, 0, 0), 'sxblue', taper=(0.72, 0.82))
    cube(bm, (14, 22, 1.6), (0, 0.5, -2.2), 'gun', taper=(1.12, 1.1))
    cube(bm, (8, 8, 2.4), (0, -5.5, 2.4), 'sxblue', taper=(0.6, 0.55))
    cube(bm, (5.5, 2.4, 1.0), (0, -9.0, 2.0), 'glass', rot=(-20, 0, 0))
    cube(bm, (24, 9, 0.9), (0, 7, -0.4), 'sxblue', taper=(0.7, 0.8))
    for x in (-7.5, 7.5):
        cube(bm, (0.6, 6.5, 5.0), (x, 10, 2.8), 'sxblue', rot=(0, -10 if x > 0 else 10, 0), taper=(1, 0.55))
        cube(bm, (2.6, 7, 2.2), (x * 0.95, 3, -1.6), 'gun')
        cylinder(bm, 1.0, 1.0, 1.0, (x * 0.95, 7.0, -1.6), 'lamp', rot=(90, 0, 0), seg=10)  # Triebwerke
    for x in (-3.5, 3.5):
        cylinder(bm, 0.8, 0.9, 0.6, (x, -13.1, -0.4), 'lamp', rot=(90, 0, 0), seg=10)       # Suchscheinwerfer
        cylinder(bm, 0.35, 0.35, 4.0, (x * 1.6, -12.0, -1.8), 'gun', rot=(90, 0, 0), seg=8)  # Kadmium-Werfer
    cube(bm, (3, 3, 0.2), (0, 2, 1.7), 'yellow')
    cube(bm, (0.6, 0.6, 0.4), (0, 9, 1.8), 'red')


def car(bm):
    cube(bm, (1.7, 4.3, 0.8), (0, 0, 0.7), 'white')
    cube(bm, (1.5, 2.2, 0.7), (0, 0.3, 1.4), 'white', taper=(0.9, 0.8))
    cube(bm, (1.55, 2.0, 0.55), (0, 0.3, 1.42), 'glass', taper=(0.92, 0.82))
    for x in (-0.6, 0.6):
        cube(bm, (0.35, 0.1, 0.2), (x, -2.16, 0.8), 'lamp')
        cube(bm, (0.35, 0.1, 0.18), (x, 2.16, 0.85), 'red')
    for y in (-1.3, 1.3):
        for x in (-0.82, 0.82):
            cylinder(bm, 0.33, 0.33, 0.22, (x, y, 0.33), 'black', rot=(0, 90, 0), seg=8)


def train(bm):  # Yamanote-Wagen (Serie 205): silbern mit grünem Band
    cube(bm, (2.9, 20, 3.0), (0, 0, 2.3), 'silver')
    cube(bm, (2.95, 19.6, 0.35), (0, 0, 2.6), 'green')
    cube(bm, (2.96, 18.8, 0.8), (0, 0, 3.2), 'glass')
    cube(bm, (2.4, 18, 0.6), (0, 0, 0.5), 'black')


def ship(bm):   # Frachter in der Bucht
    cube(bm, (18, 110, 9), (0, 0, 2), 'hull', taper=(1.0, 0.96))
    cube(bm, (18.2, 111, 2), (0, 0, -2), 'black')
    cube(bm, (14, 14, 12), (0, 40, 12), 'white')
    cube(bm, (14.2, 2, 1.2), (0, 33, 16), 'glass')
    cylinder(bm, 1.5, 1.5, 8, (0, 45, 22), 'red', seg=8)
    for y in (-35, -15, 5):
        cube(bm, (14, 16, 5), (0, y, 9), 'gun')
    cube(bm, (1, 1, 1), (0, -54, 8), 'lamp')


def tree(bm):
    cylinder(bm, 0.35, 0.25, 4, (0, 0, 2), 'bark', seg=6)
    for (x, y, z, r) in ((0, 0, 5.2, 2.6), (1.2, 0.4, 4.4, 1.8), (-1.0, -0.6, 4.6, 1.9), (0.2, -0.9, 6.2, 1.6)):
        sphere(bm, r, (x, y, z), 'leaf', seg=7, rings=5)


def lamp(bm):
    cylinder(bm, 0.12, 0.1, 8, (0, 0, 4), 'steel', seg=6)
    cube(bm, (0.2, 1.8, 0.15), (0, -0.9, 8.0), 'steel')
    cube(bm, (0.5, 0.8, 0.2), (0, -1.6, 7.85), 'lamp')


def pole(bm):   # Strommast
    cylinder(bm, 0.2, 0.15, 12, (0, 0, 6), 'concrete', seg=6)
    cube(bm, (2.6, 0.15, 0.15), (0, 0, 11), 'steel')
    cylinder(bm, 0.35, 0.35, 0.8, (0.6, 0, 9.5), 'concrete', seg=6)


def debris(bm, k):
    rng = np.random.default_rng(100 + k)
    before = set(bm.faces)
    r = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=1.0)
    for v in r['verts']:
        v.co *= rng.uniform(0.6, 1.25)
        v.co.z *= 0.7
    for f in _new_faces(bm, before):
        f.material_index = MI['concrete']
        f.smooth = False


ITEMS = [('tank', tank), ('truck', truck), ('heli', heli), ('heli_rotor', heli_rotor), ('superx', superx),
         ('car', car), ('train', train), ('ship', ship), ('tree', tree), ('lamp', lamp), ('pole', pole),
         ('debris0', lambda b: debris(b, 0)), ('debris1', lambda b: debris(b, 1)), ('debris2', lambda b: debris(b, 2))]


def build():
    ms = mats()
    objs = []
    for name, fn in ITEMS:
        bm = bmesh.new()
        fn(bm)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        objs.append(obj_from_bm('U_' + name, bm, ms))
    return objs


PROPS = ('U_tree', 'U_lamp', 'U_pole', 'U_debris0', 'U_debris1', 'U_debris2')


def layout_preview(objs):
    """Fahrzeuge in einer Reihe, Requisiten davor, Frachter dahinter."""
    x = xp = 0
    for o in objs:
        w = max(4, o.dimensions.x)
        if o.name == 'U_ship':
            o.location = (60, 80, 0)
        elif o.name in PROPS:
            o.location = (xp, -22, 0); xp += 8
        else:
            o.location = (x + w / 2, 0, 0 if o.name != 'U_superx' else 6)
            x += w + 4
