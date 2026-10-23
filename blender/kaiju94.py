"""1994: Moguera und SpaceGodzillas Kristalle. Erste Entwürfe ohne Bildvorlage.
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
ORDER = ['metal', 'yellow', 'red', 'dark', 'drill', 'crystal']


def mats():
    return {
        'metal': material('MOG_Metal', rough=0.3, metal=0.85, vcol=True),
        'yellow': material('MOG_Light', color=(1, 0.85, 0.2), emit=(1, 0.8, 0.2), emit_strength=5),
        'red': material('MOG_Red', color=(0.8, 0.1, 0.06), emit=(1, 0.15, 0.06), emit_strength=2.5),
        'dark': material('MOG_Dark', color=(0.12, 0.13, 0.15), rough=0.6, metal=0.5),
        'drill': material('MOG_Drill', color=(0.75, 0.72, 0.62), rough=0.25, metal=0.9),
        'crystal': material('SG_Crystal', color=(0.55, 0.45, 1.0), rough=0.1, metal=0.2, emit=(0.5, 0.35, 1.0), emit_strength=1.6),
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
    bm = bmesh.new(); cols = {}
    for sx in (1, -1):                                                   # Kettenlaufwerk
        box(bm, cols, (9, 34, 12), (sx * 10, 2, 6), 'dark', D)
        for k in range(6):
            rod(bm, cols, (sx * 15, -12 + k * 5.6, 4), (sx * 15.8, -12 + k * 5.6, 4), 3.4, 3.4, 'metal', S, 10)
    box(bm, cols, (22, 22, 16), (0, 1, 18), 'metal', D)                   # Hüfte
    r = bmesh.ops.create_uvsphere(bm, u_segments=18, v_segments=12, radius=1.0)   # runder Brustpanzer
    for v in r['verts']:
        v.co = V((v.co.x * 17, v.co.y * 14 - 1, v.co.z * 16 + 40))
        cols[v] = V(S) if abs(v.co.x) > 3 else V((0.75, 0.8, 0.9))
    import kaiju93
    for f in {f for v in r['verts'] for f in v.link_faces}:
        f.material_index = kaiju93.ORDER.index('metal')
    box(bm, cols, (12, 12, 10), (0, -2, 58), 'metal', S)                  # Kopf
    box(bm, cols, (11, 1.2, 2.2), (0, -8.2, 61), 'yellow', Y)             # Augen
    box(bm, cols, (2, 4, 6), (0, 0, 66), 'red', (1, 0.2, 0.1))            # Antenne / Kamm
    for sx in (1, -1):
        box(bm, cols, (9, 12, 8), (sx * 17, -1, 50), 'metal', D, rot=(0, sx * -15, 0))      # Schultern
        rod(bm, cols, (sx * 17, -1, 46), (sx * 15, -8, 36), 3.4, 3.0, 'metal', S)          # Arme nach vorn
        box(bm, cols, (2, 10, 2), (sx * 9, -14, 44), 'yellow', Y)
    fix(bm, {'metal': 'metal', 'dark': 'dark', 'yellow': 'yellow', 'red': 'red'})
    return to_object('MOG_body', bm, cols, M)


def drill(M):
    bm = bmesh.new(); cols = {}
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=4, radius2=0.2, depth=14,
                              matrix=Matrix.Translation(V((0, -7, 0))) @ Euler((math.radians(90), 0, 0)).to_matrix().to_4x4())
    for v in r['verts']:
        cols[v] = V((0.8, 0.76, 0.66))
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


def build():
    M = mats()
    return [moguera(M), drill(M), crystal(M)]


def layout_preview(objs):
    by = {o.name: o for o in objs}
    by['MOG_body'].location = (-40, 0, 0)
    d = by['MOG_drill']; d.location = V(DRILLS['nose']) + V((-40, 0, 0))
    for sx in (1, -1):
        h = d.copy(); link(h); h.location = V((-40 + sx * DRILLS['hand'][0], DRILLS['hand'][1], DRILLS['hand'][2]))
    by['SG_crystal'].location = (40, 0, 0)
