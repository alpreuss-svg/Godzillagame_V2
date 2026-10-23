"""1993: Rodan und Mechagodzilla (mit Garuda). Erste Entwürfe ohne Bildvorlage.
- RO_body: Rodan – langer spitzer Schnabel, Kamm nach hinten, schlanker Hals, Rumpf, hängende Beine mit Krallen
- RO_wing: linker Flugsaurier-Flügel, waagrecht (XY), nach +X, Gelenk im Ursprung
- MG_torso, MG_head, MG_arm, MG_thigh, MG_shin, MG_garuda: Mechagodzilla in Gelenkteilen; jedes Teil hat seinen
  Ursprung im Gelenk (JOINTS), das Spiel setzt sie in Gelenk-Gruppen zusammen und bewegt sie (Gehen, Arme, Kopf).
Blender: Z oben, vorn = -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from common import link, material
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
RO_WING_ROOT = (5.5, -1, 2)
# Gelenke von Mechagodzilla (Blender, linke Seite +X); auch in kaiju93.js (glTF: x, z, -y)
JOINTS = {'hip': (8.5, 1, 34), 'knee': (9, -2, 18), 'shoulder': (15, -3, 58), 'neck': (0, -5, 67), 'tail': (0, 10, 33),
          'garuda': (0, 14, 56)}

ORDER = ['skin', 'membrane', 'horn', 'eye', 'metal', 'yellow', 'red', 'dark']


def mats():
    return {
        'skin': material('RO_Skin', rough=0.8, vcol=True),
        'membrane': material('RO_Membrane', rough=0.7, vcol=True),
        'horn': material('RO_Horn', color=(0.75, 0.66, 0.5), rough=0.5),
        'eye': material('RO_Eye', color=(1.0, 0.75, 0.2), emit=(1.0, 0.7, 0.2), emit_strength=3),
        'metal': material('MG_Metal', rough=0.3, metal=0.85, vcol=True),
        'yellow': material('MG_Light', color=(1, 0.85, 0.2), emit=(1, 0.8, 0.2), emit_strength=5),
        'red': material('MG_Red', color=(0.8, 0.1, 0.06), emit=(1, 0.15, 0.06), emit_strength=2.5),
        'dark': material('MG_Dark', color=(0.12, 0.13, 0.15), rough=0.6, metal=0.5),
    }


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('skin', 'membrane')


def to_object(name, bm, cols, M, origin=(0, 0, 0)):
    for v in bm.verts:
        v.co -= V(origin)
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
        arr[v.index, :3] = lin(cols.get(v, (0.6, 0.64, 0.7)))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for i in used:
        me.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, me))


def box(bm, cols, size, loc, mat, col, rot=(0, 0, 0), taper=None):
    Mx = Matrix.Translation(loc) @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=Mx)
    if taper:                                               # obere Fläche (lokal +Z) skalieren
        inv = Mx.inverted()
        for v in r['verts']:
            lv = inv @ v.co
            if lv.z > 0:
                lv.x *= taper[0]; lv.y *= taper[1]
                v.co = Mx @ lv
    set_mat(list({f for v in r['verts'] for f in v.link_faces}), mat)
    for v in r['verts']:
        cols[v] = V(col)
    return r['verts']


def rod(bm, cols, a, b, r0, r1, mat, col, seg=8):
    a, b = V(a), V(b)
    d = b - a
    q = d.to_track_quat('Z', 'Y')
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=d.length,
                              matrix=Matrix.Translation(a + d / 2) @ q.to_matrix().to_4x4())
    set_mat(list({f for v in r['verts'] for f in v.link_faces}), mat)
    for v in r['verts']:
        cols[v] = V(col)


# ---------------- Rodan ----------------
def rodan(M):
    E = [ell((0, 2, 0), (6.5, 12, 6), (-6, 0, 0)),          # Rumpf
         ell((0, -8, 1.5), (7, 6, 6)),                       # Brust
         ell((0, 14, -1), (3.5, 8, 3), (8, 0, 0))]           # Schwanzstummel
    chain(E, [(0, -12, 3), (0, -18, 7), (0, -23, 9)], 3.2, 2.4)   # Hals
    E += [ell((0, -27, 10), (3.2, 5, 3.0)),                  # Kopf
          ell((0, -36, 9), (1.6, 8, 1.4), (6, 0, 0)),        # langer Schnabel
          ell((0, -20, 13.5), (1.2, 8, 3.0), (-28, 0, 0))]   # Kamm nach hinten oben
    me = metaball_mesh('RO_body', E, 4500, res=0.6)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        v.co += n * noise.noise(p * 0.6, noise_basis='VORONOI_F2F1') * 0.35
        c = V((0.48, 0.24, 0.13)) * (0.85 + 0.3 * noise.noise(p * 0.15))
        if n.z < -0.4:
            c = c.lerp(V((0.7, 0.5, 0.32)), 0.4)               # hellerer Bauch
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('skin')
    bm.normal_update()
    for sx in (1, -1):
        r = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.9)
        for v in r['verts']:
            v.co += V((sx * 2.6, -28.5, 11))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eye')
        rod(bm, cols, (sx * 3, 6, -3), (sx * 3.4, 14, -9), 1.6, 1.1, 'skin', (0.42, 0.22, 0.12))     # Beine nach hinten
        for k in (-1, 0, 1):
            set_mat(add_cone(bm, V((sx * 3.4 + k * 0.9, 14, -9)), V((k * 0.3, -0.4, -1)), 0.5, 3.2, 4), 'horn')
    return to_object('RO_body', bm, cols, M)


def rodan_wing(M):
    poly = [(0, -6), (16, -9), (34, -12), (58, -16), (86, -8), (74, 4), (60, 10), (44, 16), (26, 20), (10, 18), (0, 10)]
    bm = bmesh.new()
    cols = {}
    vs = [bm.verts.new(V((x, y, 0.5 * math.sin(x * 0.06)))) for x, y in poly]
    f = bm.faces.new(vs)
    res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
    set_mat(res['faces'], 'membrane')
    for v in vs:
        k = v.co.x / 86
        cols[v] = V((0.42, 0.2, 0.11)).lerp(V((0.62, 0.36, 0.2)), k) if v.co.y > -5 else V((0.32, 0.15, 0.08))
    rod(bm, cols, (0, -2, 0.5), (34, -12, 1), 2.0, 1.4, 'skin', (0.4, 0.2, 0.1))      # Arm
    rod(bm, cols, (34, -12, 1), (86, -8, 0.5), 1.3, 0.4, 'skin', (0.4, 0.2, 0.1))     # Flugfinger
    set_mat(add_cone(bm, V((34, -13, 1.5)), V((0.2, -1, 0.4)), 0.6, 3.5, 4), 'horn')  # Daumenkralle
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('RO_wing', bm, cols, M)


# ---------------- Mechagodzilla ----------------
S, D, Y = (0.66, 0.7, 0.76), (0.4, 0.43, 0.48), (1, 0.85, 0.2)


def mg_torso(M):
    bm = bmesh.new(); cols = {}
    box(bm, cols, (20, 15, 10), (0, 1, 36), 'metal', D)                              # Becken
    box(bm, cols, (25, 17, 24), (0, -1, 50), 'metal', S, taper=(1.12, 1.0))          # Rumpf, oben breiter
    box(bm, cols, (17, 3, 18), (0, -10, 50), 'metal', (0.74, 0.78, 0.84), taper=(1.1, 1))   # Brustplatte
    for k in range(4):
        box(bm, cols, (14 - k, 0.6, 1.0), (0, -11.6, 44 + k * 3.6), 'dark', D)       # Lüftungsschlitze
    for sx in (1, -1):
        box(bm, cols, (1.6, 0.6, 1.6), (sx * 5.5, -11.8, 57), 'yellow', Y)            # Brustlichter
        box(bm, cols, (9, 13, 6), (sx * 15, -2, 62), 'metal', D, rot=(0, sx * -18, 0))   # Schulterpanzer
        box(bm, cols, (2, 9, 1.5), (sx * 9, -2, 63.5), 'red', (1, 0.2, 0.1))
    box(bm, cols, (11, 10, 6), (0, -3, 64), 'metal', S)                              # Halsansatz
    for k in range(5):                                                                 # Rückenflossen aus Metall
        z = 40 + k * 5
        rod(bm, cols, (0, 8, z), (0, 13 + k * 0.3, z + 6), 2.2, 0.3, 'metal', D, 4)
    return to_object('MG_torso', bm, cols, M)


def mg_head(M):
    bm = bmesh.new(); cols = {}
    n = V(JOINTS['neck'])
    box(bm, cols, (7, 8, 7), n + V((0, -3, 3)), 'metal', S)                          # Schädel
    box(bm, cols, (5, 8, 3.2), n + V((0, -10, 2.6)), 'metal', S, taper=(0.7, 1))     # Schnauze
    box(bm, cols, (4.4, 7, 1.6), n + V((0, -9.5, 0.2)), 'metal', D)                  # Unterkiefer
    box(bm, cols, (7.4, 1.2, 1.4), n + V((0, -6.8, 5)), 'yellow', Y)                 # Augenvisier
    for sx in (1, -1):
        set_mat(add_cone(bm, n + V((sx * 2.4, -2, 6.5)), V((sx * 0.3, 0.8, 0.6)), 0.8, 4, 4), 'metal')
    return to_object('MG_head', bm, cols, M, JOINTS['neck'])


def mg_arm(M):
    bm = bmesh.new(); cols = {}
    s = V(JOINTS['shoulder'])
    rod(bm, cols, s, s + V((1.5, -2, -11)), 3.4, 2.8, 'metal', S)                    # Oberarm
    rod(bm, cols, s + V((1.5, -2, -11)), s + V((1.5, -11, -15)), 2.8, 2.4, 'metal', D)   # Unterarm nach vorn
    box(bm, cols, (4, 4, 3), s + V((1.5, -12.5, -15.5)), 'metal', S)                 # Hand
    for k in (-1, 0, 1):
        set_mat(add_cone(bm, s + V((1.5 + k * 1.2, -14, -16)), V((k * 0.2, -1, -0.6)), 0.5, 3.2, 4), 'metal')
    return to_object('MG_arm', bm, cols, M, JOINTS['shoulder'])


def mg_thigh(M):
    bm = bmesh.new(); cols = {}
    h, k = V(JOINTS['hip']), V(JOINTS['knee'])
    box(bm, cols, (9, 10, 18), (h + k) / 2, 'metal', S, taper=(0.8, 0.85))
    box(bm, cols, (9.5, 3, 4), h + V((0, -5, -6)), 'red', (1, 0.2, 0.1))
    return to_object('MG_thigh', bm, cols, M, JOINTS['hip'])


def mg_shin(M):
    bm = bmesh.new(); cols = {}
    k = V(JOINTS['knee'])
    box(bm, cols, (8, 9, 16), k + V((0, 1.5, -8)), 'metal', D, taper=(1.15, 1.1))   # Schienbein (unten breiter)
    box(bm, cols, (11, 16, 3.5), V((k.x, -1, 1.8)), 'metal', S)                       # Fuß
    for j in (-1, 0, 1):
        set_mat(add_cone(bm, V((k.x + j * 3, -9, 1.5)), V((0, -1, -0.2)), 1.0, 3, 4), 'metal')
    box(bm, cols, (6, 1, 2), k + V((0, -3.5, -4)), 'yellow', Y)
    return to_object('MG_shin', bm, cols, M, JOINTS['knee'])


def mg_garuda(M):
    """Garuda: Kampfjet, dockt auf dem Rücken an (Super-Mechagodzilla), zwei Kanonen nach vorn."""
    bm = bmesh.new(); cols = {}
    g = V(JOINTS['garuda'])
    box(bm, cols, (12, 24, 5), g, 'metal', (0.6, 0.62, 0.66), taper=(0.6, 0.9))
    box(bm, cols, (34, 10, 1.2), g + V((0, 4, -1)), 'metal', D, taper=(0.5, 0.7))     # Flügel
    for sx in (1, -1):
        rod(bm, cols, g + V((sx * 5, -2, 3)), g + V((sx * 5, -22, 6)), 1.2, 0.9, 'metal', D, 8)   # Kanonen
        rod(bm, cols, g + V((sx * 4, 12, 0)), g + V((sx * 4, 15, 0)), 1.6, 1.6, 'yellow', Y, 8)    # Düsen
    return to_object('MG_garuda', bm, cols, M, JOINTS['garuda'])


def build():
    M = mats()
    return [rodan(M), rodan_wing(M), mg_torso(M), mg_head(M), mg_arm(M), mg_thigh(M), mg_shin(M), mg_garuda(M)]


def layout_preview(objs):
    by = {o.name: o for o in objs}
    by['RO_body'].location = (-90, 0, 40)
    for sx in (1, -1):
        w = by['RO_wing'] if sx > 0 else by['RO_wing'].copy()
        if sx < 0:
            link(w); w.scale = (-1, 1, 1)
        w.location = (-90 + sx * RO_WING_ROOT[0], RO_WING_ROOT[1], 40 + RO_WING_ROOT[2])
        w.rotation_euler = (0, sx * math.radians(-15), 0)
    ox = 60
    by['MG_torso'].location = (ox, 0, 0)
    by['MG_head'].location = V(JOINTS['neck']) + V((ox, 0, 0))
    by['MG_garuda'].location = V(JOINTS['garuda']) + V((ox, 0, 0))
    for sx in (1, -1):
        for name, j in (('MG_arm', 'shoulder'), ('MG_thigh', 'hip'), ('MG_shin', 'knee')):
            o = by[name] if sx > 0 else by[name].copy()
            if sx < 0:
                link(o); o.scale = (-1, 1, 1)
            jj = V(JOINTS[j])
            o.location = (ox + sx * jj.x, jj.y, jj.z)
