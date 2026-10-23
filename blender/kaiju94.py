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
        'drill': material('MOG_Drill', color=(0.35, 0.45, 0.85), rough=0.15, metal=0.6),
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

    def shell(center, size, sx):
        """Silberne Panzerschale über der Kugel: obere Außenhälfte, vorn und hinten offen."""
        r = bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=28, radius=1.0)
        drop = []
        for v in r['verts']:
            n = v.co.copy()
            v.co = V((n.x * size[0], n.y * size[1], n.z * size[2])) + V(center)
            band = n.z > 0.15 and abs(n.y) < 0.5                        # blauer, gerippter Kettenbogen oben
            cols[v] = (V(DK) if abs(math.sin(math.atan2(n.y, n.z) * 7)) < 0.22 else V(BL)) if band else V(S2)
            if n.x * sx < -0.1 or n.z < -0.25 or abs(n.y) > 0.8:
                drop.append(v)
        for f in {f for v in r['verts'] for f in v.link_faces}:
            f.material_index = kaiju93.ORDER.index('metal'); f.smooth = True
        bmesh.ops.delete(bm, geom=drop, context='VERTS')

    def arch(center, R, sx, n):
        """Blauer Kettenbogen über die Oberseite der Kugel (gerippte Glieder)."""
        c = V(center)
        for k in range(n):
            a = math.radians(-70 + k * 140 / (n - 1))
            p = c + V((sx * math.sin(abs(a)) * 0.35 * R, math.sin(a) * R * 0.9, math.cos(a) * R))
            box(bm, cols, (R * 0.55, R * 0.28, 1.6), p, 'metal', BL if k % 2 == 0 else DK, rot=(math.degrees(-a), 0, 0))

    for sx in (1, -1):
        box(bm, cols, (10, 18, 4), (sx * 9, -1, 2), 'metal', S2)                     # Fuß
        tread((8, 15, 1.6), (sx * 9, -1, 4.6), axis='y', n=6)                        # Kette auf dem Fuß
        for k in (-1, 0, 1):
            box(bm, cols, (2.4, 3, 2.6), (sx * 9 + k * 3, -11, 1.6), 'metal', S2, taper=(0.7, 0.6))   # Zehen
        box(bm, cols, (9.5, 8, 5), (sx * 9, 1, 7.5), 'metal', BR, taper=(0.85, 0.85))  # bronzener Knöchelblock
        box(bm, cols, (8, 9, 12), (sx * 9, 1, 15.5), 'metal', S2, taper=(1.1, 1.05))  # Schienbein
        tread((6, 1.6, 10), (sx * 9, -3.8, 15.5), n=5)
        pod((sx * 13, 0, 27), (9, 12, 10.5), 0)                                       # große Hüftkugel
        shell((sx * 13, 0, 27), (9.8, 12.8, 11.3), sx)                                # Panzerschale darüber
        pod((sx * 15.5, 0, 52), (7, 7.5, 7), 0)                                       # Schulterkugel
        shell((sx * 15.5, 0, 52), (7.7, 8.2, 7.7), sx)
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
    box(bm, cols, (9.5, 8.5, 11), (0, -1, 58), 'metal', S2, taper=(0.85, 0.9))        # kräftiger Hals
    tread((5, 1.4, 9), (0, -5.4, 58), n=6)
    box(bm, cols, (10, 11, 6.5), (0, -3, 66), 'metal', S2, taper=(0.75, 0.85))        # Kopf
    box(bm, cols, (7, 3, 2.4), (0, -8, 64.5), 'metal', DK, taper=(0.8, 0.8))         # Kinnschutz
    box(bm, cols, (1.6, 8, 4), (0, -1, 70), 'metal', S2, taper=(0.4, 0.7))           # Kopfkamm
    for sx in (1, -1):
        box(bm, cols, (1.2, 6, 5), (sx * 6, -2, 66.5), 'metal', S2, rot=(0, sx * -20, 0), taper=(0.5, 0.6))   # Seitenflossen
    for sx in (1, -1):
        box(bm, cols, (3.4, 3.6, 1.2), (sx * 3.8, -5, 68.6), 'yellow', Y, rot=(0, sx * 18, sx * -15))   # Visiere
    for f in add_cone(bm, V((0, -1, 69)), V((0, 0.4, 1)), 1.0, 4, 5):                # kleines Horn
        f.material_index = kaiju93.ORDER.index('red')
    # große Sägescheibe auf dem Rücken (Star-Falcon-Teil)
    rod(bm, cols, (-0.8, 10, 54), (0.8, 10, 54), 9.5, 9.5, 'metal', S2, 24)
    rod(bm, cols, (-1.2, 10, 54), (1.2, 10, 54), 3.4, 3.4, 'metal', DK, 16)
    for k in range(6):                                                                 # Speichen und dunkle Löcher
        a = k * math.pi / 3
        box(bm, cols, (1.9, 1.4, 1.4), V((0, 10, 54)) + V((0, math.cos(a), math.sin(a))) * 6.2, 'metal', DK)
    for k in range(20):
        a = k * 2 * math.pi / 20
        d = V((0, math.cos(a), math.sin(a)))
        t = d.cross(V((1, 0, 0)))
        for f in add_cone(bm, V((0, 10, 54)) + d * 9.2, (d + t * 0.7).normalized(), 1.0, 2.6, 3):
            f.material_index = kaiju93.ORDER.index('metal')

    fix(bm, {'metal': 'metal', 'dark': 'dark', 'yellow': 'yellow', 'red': 'red'})
    return to_object('MOG_body', bm, cols, M)


def drill(M):
    """Bohrer: metallisch blau glänzender Kegel mit erhabener Spiralrippe (Nase und Hände)."""
    bm = bmesh.new(); cols = {}
    L, R = 18, 5.2
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=R, radius2=0.25, depth=L,
                              matrix=Matrix.Translation(V((0, -L / 2, 0))) @ Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    for v in r['verts']:
        cols[v] = V((0.35, 0.45, 0.85))
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = ORDER.index('drill'); f.smooth = True
    prev = None
    for k in range(49):                                                  # Spiralrippe
        t = k / 48
        a = t * 4 * 2 * math.pi
        rr = R * (1 - t) + 0.35
        p = V((math.cos(a) * rr, -t * L * 0.97, math.sin(a) * rr))
        if prev is not None:
            d = p - prev
            q = bmesh.ops.create_cone(bm, cap_ends=False, segments=4, radius1=0.55 * (1 - t) + 0.15, radius2=0.55 * (1 - t) + 0.15,
                                      depth=d.length, matrix=Matrix.Translation(prev + d / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
            for v in q['verts']:
                cols[v] = V((0.55, 0.65, 0.95))
            for f in {f for v in q['verts'] for f in v.link_faces}:
                f.material_index = ORDER.index('drill')
        prev = p
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
