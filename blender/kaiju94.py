"""1994: Moguera und SpaceGodzillas Kristalle, nach Filmbildern des Nutzers.
- MOG_body: Moguera – wuchtiger Roboter auf Ketten, runder Brustpanzer, Kopf mit gelben Augen, Arme (ohne Bohrer)
- MOG_drill: Bohrer (Nase und Hände), Ursprung an der Basis, zeigt nach -Y (glTF +Z), dreht sich im Spiel
- SG_crystal: Kristallgruppe (spitze Sechskant-Kristalle), Ursprung an der Basis, wächst nach +Z (glTF +Y)
SpaceGodzilla selbst ist eine umgefärbte Kopie von Godzillas Modell mit diesen Kristallen auf den Schultern.
Blender: Z oben, vorn = -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler
from common import link, material
from biollante import add_cone, lin
from kaiju93 import box, rod

V = Vector
DRILLS = {'nose': (0, -9, 64), 'hand': (14, -12, 34)}   # auch in kaiju94.js (glTF x, z, -y)
ORDER = ['metal', 'yellow', 'red', 'dark', 'drill', 'crystal', 'shoulder']


def mats():
    return {
        'metal': material('MOG_Metal', rough=0.35, metal=0.45, vcol=True),   # weniger Metall: nachts sonst fast schwarz
        'yellow': material('MOG_Light', color=(1, 0.85, 0.2), emit=(1, 0.8, 0.2), emit_strength=5),
        'red': material('MOG_Red', color=(0.8, 0.1, 0.06), emit=(1, 0.15, 0.06), emit_strength=2.5),
        'dark': material('MOG_Dark', color=(0.12, 0.13, 0.15), rough=0.6, metal=0.5),
        'drill': material('MOG_Drill', color=(0.22, 0.27, 0.5), rough=0.2, metal=0.9),
        'crystal': material('SG_Crystal', color=(0.55, 0.45, 1.0), rough=0.1, metal=0.2, emit=(0.5, 0.35, 1.0), emit_strength=1.6),
        'shoulder': material('SG_Shoulder', rough=0.15, metal=0.1, vcol=True),
    }


def to_object(name, bm, cols, M):
    me = bpy.data.meshes.new(name)
    bm.verts.index_update()
    used = sorted({f.material_index for f in bm.faces})
    remap = {old: i for i, old in enumerate(used)}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
    bm.to_mesh(me)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    arr = np.ones((len(me.vertices), 4))
    for v in bm.verts:
        arr[v.index, :3] = lin(cols.get(v, (0.62, 0.66, 0.74)))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for i in used:
        me.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, me))


def fix(bm, mapping):
    """kaiju93.box/rod setzen Materialindizes nach kaiju93.ORDER – hier auf die eigene Reihenfolge umbiegen."""
    import kaiju93
    for f in bm.faces:
        name = kaiju93.ORDER[f.material_index] if f.material_index < len(kaiju93.ORDER) else 'metal'
        f.material_index = ORDER.index(mapping.get(name, 'metal'))


S, D, Y = (0.62, 0.68, 0.78), (0.36, 0.4, 0.48), (1, 0.85, 0.2)


def moguera(M):
    """Moguera (1994) nach Filmbildern: silbern mit blauen, gerippten Kettenpaneelen an Schultern, Hüftkugeln,
    Schienbeinen und Füßen, runde Brustscheibe, bronzene Knöchel- und Gürtelblöcke, schmaler Hals mit Rippenpaneel,
    Kopf mit gelb-orangen Visieren und kleinem Horn, große Sägescheibe auf dem Rücken. Bohrer: MOG_drill."""
    import kaiju93
    bm = bmesh.new(); cols = {}
    S2, BL, BR, DK = (0.76, 0.78, 0.82), (0.3, 0.36, 0.62), (0.45, 0.4, 0.28), (0.25, 0.27, 0.32)

    def tread(size, loc, axis='z', n=6, rot=(0, 0, 0)):
        """Blaues Kettenpaneel mit dunklen Querrippen."""
        box(bm, cols, size, loc, 'metal', BL, rot=rot)
        L = size[2] if axis == 'z' else size[1]
        for k in range(n):
            t = -L / 2 + (k + 0.5) * L / n
            off = V((0, 0, t)) if axis == 'z' else V((0, t, 0))
            box(bm, cols, (size[0] * 1.04, size[1] * 1.04, L / n * 0.18) if axis == 'z' else (size[0] * 1.04, L / n * 0.18, size[2] * 1.04),
                V(loc) + off, 'metal', DK, rot=rot)

    def pod(center, size, blue_side):
        """Runde Panzerkugel; oben außen blau gerippt (Kette)."""
        r = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
        for v in r['verts']:
            n = v.co.copy()
            v.co = V((n.x * size[0], n.y * size[1], n.z * size[2])) + V(center)
            blue = n.x * blue_side > 0.25 and n.z > -0.2 and abs(n.y) < 0.75
            cols[v] = V(BL) if blue else V(S2)
            if blue and abs(math.sin(n.z * 9 + n.y * 2)) < 0.25:
                cols[v] = V(DK)
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = kaiju93.ORDER.index('metal'); f.smooth = True

    for sx in (1, -1):
        box(bm, cols, (10, 18, 4), (sx * 9, -1, 2), 'metal', S2)                     # Fuß
        tread((8, 15, 1.6), (sx * 9, -1, 4.6), axis='y', n=6)                        # Kette auf dem Fuß
        for k in (-1, 0, 1):
            box(bm, cols, (2.4, 3, 2.6), (sx * 9 + k * 3, -11, 1.6), 'metal', S2, taper=(0.7, 0.6))   # Zehen
        box(bm, cols, (9.5, 8, 5), (sx * 9, 1, 7.5), 'metal', BR, taper=(0.85, 0.85))  # bronzener Knöchelblock
        box(bm, cols, (8, 9, 12), (sx * 9, 1, 15.5), 'metal', S2, taper=(1.1, 1.05))  # Schienbein
        tread((6, 1.6, 10), (sx * 9, -3.8, 15.5), n=5)
        pod((sx * 13, 0, 27), (9, 12, 10.5), sx)                                      # große Hüftkugel
        pod((sx * 15.5, 0, 52), (7, 7.5, 7), sx)                                      # Schulterkugel
        rod(bm, cols, (sx * 15, -2, 48), (sx * 14.5, -6, 40), 3.0, 3.0, 'metal', S2)  # Arm
        rod(bm, cols, (sx * 14.5, -6, 40), (sx * 14, -11, 34.5), 3.6, 3.4, 'metal', DK)   # Handgelenk für den Bohrer
    box(bm, cols, (15, 14, 14), (0, 0, 27), 'metal', S2, taper=(1.15, 1.0))           # Becken
    tread((4, 1.4, 11), (0, -7.4, 25), n=6)                                            # Rippenpaneel vorn
    box(bm, cols, (6, 2.4, 4), (0, -7.6, 34), 'metal', BR)                             # Gürtelschnalle
    box(bm, cols, (23, 15, 18), (0, 0, 44), 'metal', S2, taper=(1.06, 1.0))           # Rumpf
    r = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=10, radius=1.0)       # runde Brustscheibe
    for v in r['verts']:
        n = v.co.copy()
        rr = math.hypot(n.x, n.z)
        v.co = V((n.x * 8.5, n.y * (1.2 if rr > 0.7 else 2.2), n.z * 8.5)) + V((0, -7.8, 45))   # Ring mit innerer Kuppel
        cols[v] = V((0.4, 0.42, 0.46)) if 0.7 < rr < 0.9 else V((0.85, 0.87, 0.9))
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = kaiju93.ORDER.index('metal'); f.smooth = True
    tread((5, 1.2, 3), (0, -10.4, 41.5), n=3)                                          # Gitter in der Scheibe
    box(bm, cols, (7, 7, 10), (0, -1, 58), 'metal', S2)                               # Hals
    tread((4, 1.2, 8), (0, -4.6, 58), n=5)
    box(bm, cols, (9, 10, 6), (0, -3, 66), 'metal', S2, taper=(0.8, 0.9))             # Kopf
    for sx in (1, -1):
        box(bm, cols, (3.4, 3.6, 1.2), (sx * 3.8, -5, 68.6), 'yellow', Y, rot=(0, sx * 18, sx * -15))   # Visiere
    for f in add_cone(bm, V((0, -1, 69)), V((0, 0.4, 1)), 1.0, 4, 5):                # kleines Horn
        f.material_index = kaiju93.ORDER.index('red')
    # große Sägescheibe auf dem Rücken (Star-Falcon-Teil)
    rod(bm, cols, (-0.9, 10, 53), (0.9, 10, 53), 13, 13, 'metal', S2, 24)
    rod(bm, cols, (-1.2, 10, 53), (1.2, 10, 53), 5, 5, 'metal', DK, 16)
    for k in range(16):
        a = k * 2 * math.pi / 16
        d = V((0, math.cos(a), math.sin(a)))
        t = d.cross(V((1, 0, 0)))
        for f in add_cone(bm, V((0, 10, 53)) + d * 12.5, (d + t * 0.6).normalized(), 1.4, 3.2, 3):
            f.material_index = kaiju93.ORDER.index('metal')
    fix(bm, {'metal': 'metal', 'dark': 'dark', 'yellow': 'yellow', 'red': 'red'})
    return to_object('MOG_body', bm, cols, M)


def drill(M):
    bm = bmesh.new(); cols = {}
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=4, radius2=0.2, depth=14,
                              matrix=Matrix.Translation(V((0, -7, 0))) @ Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    for v in r['verts']:
        cols[v] = V((0.22, 0.27, 0.5))
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = ORDER.index('drill')
    for k in range(10):                                                  # Spiralrippen
        a = k * 1.1
        t = k / 10
        p = V((math.cos(a) * 3.6 * (1 - t), -1 - t * 12, math.sin(a) * 3.6 * (1 - t)))
        for f in add_cone(bm, p, V((math.cos(a), -0.3, math.sin(a))), 0.6, 1.6, 4):
            f.material_index = ORDER.index('dark')
    return to_object('MOG_drill', bm, cols, M)


def crystal(M):
    """Kristallgruppe: ein großer Mittelkristall, fünf kleinere schräg nach außen (Sechskant mit Spitze)."""
    bm = bmesh.new(); cols = {}
    def hexa(base, d, r, h):
        q = d.normalized().to_track_quat('Z', 'Y').to_matrix().to_4x4()
        res = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r, radius2=r * 0.9, depth=h * 0.8,
                                    matrix=Matrix.Translation(base + d.normalized() * h * 0.4) @ q)
        for f in {f for v in res['verts'] for f in v.link_faces}:
            f.material_index = ORDER.index('crystal'); f.smooth = False
        for f in add_cone(bm, base + d.normalized() * h * 0.8, d, r * 0.9, h * 0.35, 6):
            f.material_index = ORDER.index('crystal')
    hexa(V((0, 0, 0)), V((0, 0, 1)), 3.2, 30)
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        hexa(V((math.cos(a) * 3, math.sin(a) * 3, 0)), V((math.cos(a) * 0.45, math.sin(a) * 0.45, 1)), 1.8 + (k % 2) * 0.6, 16 + (k % 3) * 4)
    return to_object('SG_crystal', bm, cols, M)


def shoulder(M):
    """SpaceGodzillas Schulterkristall nach Filmbildern: ein riesiger, leicht gebogener Kristall (weiß bis rosa, an der
    Basis rot), daneben zwei kleine; Ursprung an der Basis, wächst nach +Z."""
    bm = bmesh.new(); cols = {}
    def spike(base, d, r, h, segs=6):
        d = d.normalized()
        q = d.to_track_quat('Z', 'Y')
        rings = [(0, 0.85), (0.18, 1.0), (0.55, 0.92), (0.8, 0.6), (1.0, 0.0)]
        loops = []
        for t, k in rings:
            c = base + d * h * t
            loops.append([bm.verts.new(c + q @ V((math.cos(2 * math.pi * i / segs) * r * k, math.sin(2 * math.pi * i / segs) * r * k * 0.8, 0)))
                          for i in range(segs)])
        for a, b in zip(loops, loops[1:]):
            for i in range(segs):
                j = (i + 1) % segs
                f = bm.faces.new((a[i], a[j], b[j], b[i]))
                f.material_index = ORDER.index('shoulder'); f.smooth = False
        f = bm.faces.new(list(reversed(loops[0]))); f.material_index = ORDER.index('shoulder')
        for li, (t, k) in enumerate(rings):
            for v in loops[li]:
                cols[v] = V((0.7, 0.1, 0.14)).lerp(V((1.0, 0.92, 0.95)), min(1, t * 4))
    spike(V((0, 0, 0)), V((0, 0.15, 1)), 6.5, 30)
    spike(V((3.5, 2, 0)), V((0.5, 0.4, 1)), 2.6, 11)
    spike(V((-3, 3, 0)), V((-0.4, 0.6, 1)), 2.2, 9)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    return to_object('SG_shoulder', bm, cols, M)


def build():
    M = mats()
    return [moguera(M), drill(M), crystal(M), shoulder(M)]


def layout_preview(objs):
    by = {o.name: o for o in objs}
    by['MOG_body'].location = (-40, 0, 0)
    d = by['MOG_drill']; d.location = V(DRILLS['nose']) + V((-40, 0, 0))
    for sx in (1, -1):
        h = d.copy(); link(h); h.location = V((-40 + sx * DRILLS['hand'][0], DRILLS['hand'][1], DRILLS['hand'][2]))
    by['SG_crystal'].location = (40, 0, 0)
    by['SG_shoulder'].location = (70, 0, 0)
