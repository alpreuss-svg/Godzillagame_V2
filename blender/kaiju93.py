"""1993: Rodan und Mechagodzilla (mit Garuda), nach Filmbildern des Nutzers.
- RO_body: Rodan – langer spitzer Schnabel, Kamm nach hinten, schlanker Hals, Rumpf, hängende Beine mit Krallen
- RO_wing: linker Flugsaurier-Flügel, waagrecht (XY), nach +X, Gelenk im Ursprung
- MG_torso, MG_head, MG_arm, MG_thigh, MG_shin, MG_garuda: Mechagodzilla in Gelenkteilen; jedes Teil hat seinen
  Ursprung im Gelenk (JOINTS), das Spiel setzt sie in Gelenk-Gruppen zusammen und bewegt sie (Gehen, Arme, Kopf).
Blender: Z oben, vorn = -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from common import link, material, make_image
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
        'membrane': material('RO_Membrane', rough=0.7, img=rodan_image()),
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
def bent(bm, pts, r0, r1, k, segs=5):
    """Gebogenes Horn aus Kegelstümpfen entlang pts (r0 -> r1)."""
    faces, n = [], len(pts) - 1
    for i in range(n):
        a, b = V(pts[i]), V(pts[i + 1])
        faces += add_cone(bm, a, b - a, r0 + (r1 - r0) * i / n, (b - a).length * (1.0 if i == n - 1 else 1.25), segs)
    set_mat(faces, k)


def rodan(M):
    """Rodan nach Filmbildern: rot-orange Haut, heller gerippter Hals und Bauch, langer dunkler Schnabel, zwei nach
    hinten gebogene Hörner mit hellen Spitzen, gelbe Augen, kleine Rückenstacheln, Greifklauen."""
    E = [ell((0, 3, 0), (6, 11, 5.5), (-6, 0, 0)),           # Rumpf
         ell((0, -8, 2), (7, 6.5, 6.5)),                      # Brust
         ell((0, 15, -1), (3, 8, 2.5), (8, 0, 0))]            # Schwanzstummel
    chain(E, [(0, -12, 4), (0, -17, 8.5), (0, -21, 11.5)], 3.4, 2.4)   # langer Hals
    E += [ell((0, -25, 12.5), (3.0, 4.5, 3.0)),               # Kopf
          ell((0, -33, 11.5), (1.5, 8, 1.6), (8, 0, 0)),      # Oberschnabel
          ell((0, -31.5, 10), (1.2, 6.5, 0.9), (2, 0, 0))]    # Unterschnabel
    me = metaball_mesh('RO_body', E, 5000, res=0.55)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        v.co += n * noise.noise(p * 0.7, noise_basis='VORONOI_F2F1') * 0.25
        c = V((0.6, 0.2, 0.1)).lerp(V((0.32, 0.09, 0.06)), max(0, n.z)) * (0.85 + 0.3 * noise.noise(p * 0.2))
        if n.z < -0.15 and p.y < 8:                            # heller, quer gerippter Hals- und Bauchpanzer
            c = V((0.88, 0.74, 0.55)) if math.sin(p.y * 1.7) < 0.6 else V((0.62, 0.45, 0.3))
        if p.y < -27.5:
            c = V((0.2, 0.19, 0.2))                            # dunkler Schnabel
        elif p.y < -21:
            c = c.lerp(V((0.38, 0.3, 0.32)), 0.5)              # gräulicher Kopf
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('skin')
    bm.normal_update()
    for sx in (1, -1):
        r = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.8)
        for v in r['verts']:
            v.co += V((sx * 2.5, -26.5, 13.4))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eye')
        bent(bm, [(sx * 1.3, -23.5, 14.5), (sx * 2.2, -19, 18), (sx * 3, -13, 19.5)], 1.2, 0.6, 'horn')   # Hörner
        rod(bm, cols, (sx * 3, 6, -3), (sx * 3.4, 13, -8), 1.6, 1.1, 'skin', (0.45, 0.13, 0.08))       # Beine
        for k in (-1, 0, 1):
            set_mat(add_cone(bm, V((sx * 3.4 + k * 0.9, 13, -8)), V((k * 0.3, -0.5, -1)), 0.5, 3.4, 4), 'horn')
    for k in range(9):                                          # kleine Stacheln über Nacken und Rücken
        y = -20 + k * 3.2
        z = 14 - k * 1.2 if k < 4 else 8 - (k - 4) * 0.6
        set_mat(add_cone(bm, V((0, y, z)), V((0, 0.6, 1)), 0.6, 2.2, 4), 'horn')
    return to_object('RO_body', bm, cols, M)


RO_POLY = [(0, -6), (16, -9), (34, -12), (58, -16), (88, -9), (80, -1), (71, 4), (64, 10), (54, 12), (46, 18), (34, 20),
           (24, 24), (12, 22), (0, 12)]


def rodan_image(n=512):
    from mothra import poly_dist, line_dist, vnoise
    ys, xs = np.mgrid[0:n, 0:n] / n
    X, Y = xs * 92.0, -20 + (1 - ys) * 46.0
    d, inside = poly_dist(X, Y, RO_POLY)
    k = np.clip((Y + 10) / 32, 0, 1)[..., None]                           # zum Hinterrand heller und orange
    col = np.array([0.5, 0.1, 0.08]) * (1 - k) + np.array([0.92, 0.45, 0.25]) * k
    col = col * (0.85 + 0.3 * vnoise(X, Y, 12, 4, 2))[..., None]
    rng = np.random.default_rng(93)
    vd = np.full(X.shape, 1e9)
    for i in range(16):                                                    # Adern vom Arm zum Hinterrand
        t = (i + 0.5) / 16
        x, y = 88 * t, -6 - 10 * math.sin(t * math.pi * 0.9)
        pts = [(x, y)]
        for _ in range(6):
            x += rng.uniform(-4, 3); y += rng.uniform(3, 6)
            pts.append((x, y))
            if rng.random() < 0.4:
                vd = np.minimum(vd, line_dist(X, Y, [(x, y), (x + rng.uniform(-6, 6), y + rng.uniform(3, 7))]))
        vd = np.minimum(vd, line_dist(X, Y, pts))
    col[vd < 0.5] = col[vd < 0.5] * 0.45
    col[d < 0.8] = [0.3, 0.07, 0.05]
    return make_image('RO_wing_img', col)


def rodan_wing(M):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    cols = {}
    vs = [bm.verts.new(V((x, y, 0.6 * math.sin(x * 0.06)))) for x, y in RO_POLY]
    f = bm.faces.new(vs)
    res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
    set_mat(res['faces'], 'membrane')
    for t in res['faces']:
        for loop in t.loops:
            loop[uv].uv = (loop.vert.co.x / 92.0, (loop.vert.co.y + 20) / 46.0)
    for v in vs:
        cols[v] = V((1, 1, 1))
    rod(bm, cols, (0, -2, 0.5), (34, -12, 1.4), 2.2, 1.5, 'skin', (0.35, 0.12, 0.08))     # Arm
    rod(bm, cols, (34, -12, 1.4), (88, -9, 0.6), 1.4, 0.4, 'skin', (0.32, 0.1, 0.07))     # Flugfinger
    for k in (-1, 0, 1):                                                                    # Hand mit Krallen
        set_mat(add_cone(bm, V((34, -13, 1.5)), V((k * 0.4, -1, 0.3)), 0.5, 3.5, 4), 'horn')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('RO_wing', bm, cols, M)


# ---------------- Mechagodzilla (1993): runde Chrompanzerung ----------------
S, D, Y = (0.72, 0.75, 0.8), (0.42, 0.45, 0.5), (1, 0.8, 0.2)
M_CUR = [None]


def chrome(name, E, tris, origin, extra=None, grooves=None):
    """Metaball-Panzerteil in Chrom; grooves(p) -> True für dunkle Fugen."""
    me = metaball_mesh(name, E, tris, res=0.5)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        c = V(S) * (0.92 + 0.12 * v.normal.z)
        if grooves and grooves(v.co):
            c = V((0.18, 0.19, 0.22))
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('metal')
    if extra:
        extra(bm, cols)
    return to_object(name, bm, cols, M_CUR[0], origin)


def mg_torso(M):
    E = [ell((0, 1, 36), (11, 8, 6)),                      # Becken
         ell((0, -1, 44), (10.5, 8, 6.5)),                 # Bauch
         ell((0, -2, 53), (13.5, 9.5, 8.5)),               # breite Brust
         ell((0, 6, 52), (11.5, 6.5, 9)),                  # Rücken
         ell((0, -3, 63), (6, 6, 5))]                      # Halsansatz
    for sx in (1, -1):
        E += [ell((sx * 6, -7, 54), (6, 4, 5.5)),            # Brustmuskeln
              ell((sx * 14.5, -2, 59), (6, 6.5, 5.5))]       # runde Schulterpanzer

    def grooves(p):
        if p.y < -6 and 47 < p.z < 59 and abs(abs(p.x) * 0.75 - (p.z - 47)) < 0.6:
            return True                                     # V-förmiger Brustpanzer
        if p.y < -4 and abs(p.z - 47.5) < 0.5:
            return True                                     # Gürtellinie
        return False

    def extra(bm, cols):
        r = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)    # Bauchlinse (Plasmagranate)
        for v in r['verts']:
            v.co = V((v.co.x * 3.2, v.co.y * 1.0, v.co.z * 3.2)) + V((0, -9.4, 45))
            cols[v] = V(D)
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'dark')
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.3)
        for v in r['verts']:
            v.co += V((0, -10.2, 45))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'yellow')
        for k in range(3):                                   # Lüftungsrillen am Bauch
            box(bm, cols, (5 - k, 0.5, 0.5), (0, -9.4, 40.6 - k * 1.3), 'dark', D)
        for sx in (1, -1):                                   # Rückendüsen
            rod(bm, cols, (sx * 5, 7, 58), (sx * 5.5, 13, 51), 2.0, 2.4, 'metal', D, 10)
            rod(bm, cols, (sx * 5.5, 13, 51), (sx * 5.6, 13.6, 50), 2.2, 2.2, 'dark', D, 10)
        for k in range(5):                                   # kleine Rückenzacken
            z = 40 + k * 4.5
            box(bm, cols, (1.2, 4, 4), (0, 10 + (k % 2) * 0.5, z), 'metal', S, rot=(30, 0, 0), taper=(0.4, 0.4))
    return chrome('MG_torso', E, 6000, (0, 0, 0), extra, grooves)


def mg_head(M):
    n = V(JOINTS['neck'])
    E = [ell(n + V((0, -0.5, 0.5)), (4.5, 4.5, 4.5)),       # Halsring
         ell(n + V((0, -3, 4)), (3.6, 4.5, 3.4)),          # Schädel
         ell(n + V((0, -9, 2.8)), (2.6, 5, 1.9)),          # Schnauze
         ell(n + V((0, -8.5, 0.6)), (2.3, 4.6, 1.2)),      # Unterkiefer
         ell(n + V((0, 0.5, -1.5)), (3.8, 4, 4))]          # Hals
    chain(E, [n + V((0, -6, 6.6)), n + V((0, -2, 7.8)), n + V((0, 2, 6.5))], 0.9, 0.7)   # Schädelkamm

    def grooves(p):
        return abs(p.z - (n.z + 1.75)) < 0.28 and p.y < n.y - 4      # Maulspalte

    def extra(bm, cols):
        for sx in (1, -1):
            box(bm, cols, (1.6, 2.4, 0.9), n + V((sx * 2.3, -6.5, 4.9)), 'yellow', Y, rot=(0, sx * 15, sx * -20))   # Augen
            for k in range(5):                               # Zahnreihen
                yy = -12 + k * 1.5
                set_mat(add_cone(bm, n + V((sx * (1.2 + k * 0.25), yy, 1.95)), V((0, 0, -1)), 0.32, 0.9, 4), 'metal')
                set_mat(add_cone(bm, n + V((sx * (1.1 + k * 0.25), yy + 0.6, 1.55)), V((0, 0, 1)), 0.3, 0.8, 4), 'metal')
        for k in range(4):                                   # Zacken auf dem Kamm
            set_mat(add_cone(bm, n + V((0, -5 + k * 2.2, 7.6 + (1 if k == 1 else 0))), V((0, 0.4, 1)), 0.6, 1.8, 4), 'metal')
    ob = chrome('MG_head', E, 3000, JOINTS['neck'], extra, grooves)
    for v in ob.data.vertices:                                # Kopf 1,3-fach, auf dem Hals etwas höher
        w = min(1.0, max(0.0, (v.co.z + 2) / 4))                # weicher Übergang zum Hals
        v.co = v.co * (1 + 0.3 * w) + V((0, 0, 1.2 * w))
    return ob


def mg_arm(M):
    s = V(JOINTS['shoulder'])
    el, wr = s + V((1.5, -2, -10)), s + V((1.5, -10, -14))
    E = []
    chain(E, [s, el], 3.8, 3.3, step=0.4)                   # Oberarm
    chain(E, [el, wr], 3.3, 3.0, step=0.4)                  # Unterarm
    E += [ell(wr + V((0, -0.5, 0)), (3.6, 1.6, 3.6)),       # Manschette
          ell(wr + V((0, -2.8, -0.4)), (2.6, 2.2, 2.4))]    # Hand

    def grooves(p):
        return abs((p - el).length - 3.2) < 0.25

    def extra(bm, cols):
        for k in (-1.5, -0.5, 0.5, 1.5):                     # gegliederte Finger
            b0 = wr + V((k * 1.2, -4.2, -0.6))
            rod(bm, cols, b0, b0 + V((k * 0.3, -1.8, -0.8)), 0.55, 0.5, 'metal', S, 6)
            set_mat(add_cone(bm, b0 + V((k * 0.3, -1.8, -0.8)), V((0, -0.6, -1)), 0.45, 1.6, 4), 'metal')
    return chrome('MG_arm', E, 2400, JOINTS['shoulder'], extra, grooves)


def mg_thigh(M):
    h, k = V(JOINTS['hip']), V(JOINTS['knee'])
    E = [ell((h + k) / 2 + V((0, 0, 1)), (6.5, 7, 9.5)),    # massiger Oberschenkel
         ell(h + V((5.5, 0, -7)), (1.8, 6, 7.5)),           # große Seitenplatte
         ell(k + V((0, -3.5, 0)), (4.2, 3.2, 4.2))]         # runder Kniepanzer

    def grooves(p):
        return abs(p.x - (h.x + 3.7)) < 0.3 and p.z > k.z + 2
    return chrome('MG_thigh', E, 2400, JOINTS['hip'], None, grooves)


def mg_shin(M):
    k = V(JOINTS['knee'])
    E = [ell(k + V((0, 1, -6)), (5.5, 6, 7.5)),             # Schienbein
         ell(V((k.x, 0, 5)), (6, 6.5, 2.5)),                 # Knöchelring
         ell(V((k.x, -3, 2)), (7, 9, 2.2))]                  # breiter Fuß

    def grooves(p):
        return abs(p.z - 7.6) < 0.35 or abs(p.z - 3.7) < 0.3

    def extra(bm, cols):
        for j in (-1.5, -0.5, 0.5, 1.5):                     # vier Krallenzehen
            set_mat(add_cone(bm, V((k.x + j * 3, -10.5, 1.4)), V((0, -1, -0.3)), 1.2, 3.2, 5), 'metal')
    return chrome('MG_shin', E, 2400, JOINTS['knee'], extra, grooves)


def mg_garuda(M):
    """Garuda: Kampfjet, dockt auf dem Rücken an (Super-Mechagodzilla), zwei lange Kanonen über die Schultern nach vorn."""
    g = V(JOINTS['garuda'])
    E = [ell(g, (5, 13, 3.2)), ell(g + V((0, -9, 1.6)), (3, 5, 2.2))]

    def extra(bm, cols):
        box(bm, cols, (30, 10, 1.0), g + V((0, 5, -1)), 'metal', D, taper=(0.4, 0.6))         # Deltaflügel
        for sx in (1, -1):
            box(bm, cols, (1, 7, 6), g + V((sx * 4, 9, 4)), 'metal', D, rot=(0, sx * 20, 0), taper=(0.6, 0.5))   # Leitwerk
            rod(bm, cols, g + V((sx * 5, -2, 2)), g + V((sx * 5, -36, 9)), 1.3, 1.0, 'metal', D, 8)  # Kanonen
            box(bm, cols, (2.6, 2.6, 2.6), g + V((sx * 5, -36.5, 9.1)), 'metal', S)                 # Mündung
            rod(bm, cols, g + V((sx * 3, 12, 0)), g + V((sx * 3, 15, 0)), 1.7, 1.7, 'yellow', Y, 8)  # Düsen
    return chrome('MG_garuda', E, 2000, JOINTS['garuda'], extra)


def build():
    M = mats()
    M_CUR[0] = M
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
