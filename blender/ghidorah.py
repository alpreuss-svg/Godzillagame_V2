"""King Ghidorah (1991) und Mecha-King Ghidorah.
Exportiert nur die starren Teile; Hälse und Schwänze baut das Spiel als Ketten (wie Biollantes Ranken), die Flügel
schlagen als ganze Teile um das Schultergelenk, die Köpfe setzt das Spiel auf die Halsspitzen.
- GH_body / MGH_body: Rumpf mit Beinen (Mecha: verchromt, Brustpanzer, Schulterplatten, Ringe an den Beinen)
- GH_wing / MGH_wing: linker Flügel, Gelenk im Ursprung, spannt sich nach +X (rechts spiegelt das Spiel)
- GH_head: Drachenkopf mit Hörnerkrone, MGH_head: mechanischer Mittelkopf
Blender: Z oben, schaut nach -Y (im glTF +Z). Köpfe: Ursprung = Halsansatz hinten am Schädel."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Euler, Matrix, noise
from mathutils.bvhtree import BVHTree
from common import link, material
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
RNG = np.random.default_rng(1991)

# Gelenkpunkte (auch im Spiel benutzt: ghidorah.js, dort als glTF x, z, -y)
NECK_ROOTS = [(0, -5, 67), (8.5, -2.5, 64), (-8.5, -2.5, 64)]
TAIL_ROOTS = [(3.2, 11, 31), (-3.2, 11, 31)]
WING_ROOT = (7.5, 7, 63)


def mats():
    return {
        'scale': material('GH_Scale', rough=0.45, metal=0.55, vcol=True),
        'membrane': material('GH_Membrane', rough=0.6, metal=0.3, vcol=True),
        'horn': material('GH_Horn', color=(0.86, 0.72, 0.36), rough=0.4, metal=0.6),
        'mouth': material('GH_Mouth', color=(0.45, 0.08, 0.06), rough=0.6),
        'teeth': material('GH_Teeth', color=(0.9, 0.86, 0.72), rough=0.5),
        'eye': material('GH_Eye', color=(0.9, 0.2, 0.05), emit=(1.0, 0.25, 0.05), emit_strength=3.0),
        'chrome': material('MGH_Chrome', rough=0.25, metal=0.9, vcol=True),
        'red': material('MGH_Visor', color=(0.9, 0.1, 0.05), emit=(1.0, 0.15, 0.05), emit_strength=4.0),
    }


ORDER = ['scale', 'membrane', 'horn', 'mouth', 'teeth', 'eye', 'chrome', 'red']


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('scale', 'membrane', 'chrome')


HEAD_SCALE = 1.45          # Köpfe im Verhältnis zum Rumpf (Kopf ~20 m lang)


def to_object(name, bm, cols, M, keys, scale=1.0):
    """Mesh mit Vertexfarben (sRGB) und nur den benutzten Materialien."""
    if scale != 1.0:
        for v in bm.verts:
            v.co *= scale
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
        arr[v.index, :3] = lin(cols.get(v, (0.8, 0.62, 0.22)))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for i in used:
        me.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, me))


def gold(p, n, k=1.0):
    """Goldene Schuppen: dunkle Fugen (Voronoi), hellerer Bauch."""
    edge = noise.noise(p * 0.55, noise_basis='VORONOI_F2F1')
    c = V((0.95, 0.74, 0.28)) * (0.9 + 0.2 * noise.noise(p * 0.08)) * k
    if edge < 0.05:
        c = c * 0.7
    return c


def chrome(p, n):
    c = V((0.72, 0.72, 0.74)) * (0.9 + 0.15 * noise.noise(p * 0.1))
    if abs(math.sin(p.z * 0.9)) < 0.08:                 # Plattenfugen
        c = c * 0.5
    return c


# ---------------- Rumpf ----------------
def body(M, mecha=False):
    E = [ell((0, -1, 50), (11, 9.5, 15), (12, 0, 0)),      # Rumpf, leicht vorgebeugt
         ell((0, -4, 60), (12.5, 9.5, 8.5)),                 # Brust und Schultern
         ell((0, -5, 43), (9, 7, 9)),                        # Bauch
         ell((0, 3, 35), (11, 9.5, 8))]                      # Becken
    for x, y, z in NECK_ROOTS:                               # Halsansätze
        E.append(('b', V((x, y, z)), 5.2))
    for x, y, z in TAIL_ROOTS:                               # Schwanzwurzeln
        chain(E, [(x * 0.6, 6, 34), (x, y, z), (x * 1.2, y + 5, z - 4)], 6.5, 4.6)
    for sx in (1, -1):
        E.append(('b', V((sx * 7, 6, 62)), 4.5))            # Flügelansatz
        chain(E, [(sx * 8, 4, 34), (sx * 10.5, -2.5, 20), (sx * 10.5, 4.5, 7), (sx * 10.5, -1, 2.5)], 7.5, 4.0)  # Beine
    me = metaball_mesh('MGH_body' if mecha else 'GH_body', E, 9000, res=1.1)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        belly = n.y < -0.5 and abs(p.x) < 7 and 32 < p.z < 64
        if mecha:
            cols[v] = chrome(p, n)
            continue
        bump = noise.noise(p * 0.55, noise_basis='VORONOI_F2F1') * 0.5
        if belly:
            bump = 0.25 * math.sin(p.z * 1.5)                 # Bauchplatten
        v.co += n * bump
        cols[v] = gold(p, n, 1.15 if belly else 1.0)
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('chrome' if mecha else 'scale')
    bm.normal_update()
    # Krallen: drei vorn, eine hinten
    for sx in (1, -1):
        for k in (-1, 0, 1):
            set_mat(add_cone(bm, V((sx * 10.5 + k * 2.2, -5.5, 1.6)), V((k * 0.25, -1, -0.3)), 0.9, 3.2, 5), 'horn')
        set_mat(add_cone(bm, V((sx * 10.5, 3.5, 1.5)), V((0, 1, -0.3)), 0.8, 2.6, 5), 'horn')
    if mecha:
        # Brustpanzer, Schulterplatten, Ringe an den Beinen (gold abgesetzt)
        def box(size, loc, rot=(0, 0, 0), k='chrome', col=(0.85, 0.66, 0.25)):
            Mx = Matrix.Translation(loc) @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
            r = bmesh.ops.create_cube(bm, size=1.0, matrix=Mx)
            fs = list({f for v in r['verts'] for f in v.link_faces})
            set_mat(fs, k)
            for v in r['verts']:
                cols[v] = V(col)
            return fs
        box((17, 4, 16), (0, -11.5, 52), (12, 0, 0))
        for i in range(4):
            box((15 - i, 1.2, 1.4), (0, -13.8 + i * 0.3, 46 + i * 4), (12, 0, 0), col=(0.4, 0.4, 0.42))
        for sx in (1, -1):
            box((8, 9, 3), (sx * 10, -2, 66), (0, sx * -20, 0))
            for z in (14, 26):
                box((8.5, 8.5, 1.6), (sx * 10.5, 0.5 if z == 14 else -1, z), col=(0.85, 0.66, 0.25))
    return to_object('MGH_body' if mecha else 'GH_body', bm, cols, M, ORDER)


# ---------------- Flügel ----------------
def wing(M, mecha=False):
    """Linker Flügel: Arm vom Gelenk zum Ellbogen, vier Finger fächern sich auf, Membran mit gebogtem Hinterrand."""
    bm = bmesh.new()
    cols = {}
    root = V((0, 0, 0))
    elbow = V((26, 3, 16))
    tips = [V((72, 8, 34)), V((70, 14, 8)), V((58, 18, -16)), V((38, 16, -30))]
    rib_col = V((0.62, 0.45, 0.12)) if not mecha else V((0.45, 0.45, 0.48))

    def rib(a, b, r0, r1):
        d = b - a
        q = d.to_track_quat('Z', 'Y')
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=r0, radius2=r1, depth=d.length,
                                  matrix=Matrix.Translation(a + d / 2) @ q.to_matrix().to_4x4())
        fs = list({f for v in r['verts'] for f in v.link_faces})
        set_mat(fs, 'chrome' if mecha else 'scale')
        for v in r['verts']:
            cols[v] = rib_col

    rib(root, elbow, 2.6, 1.9)
    for t in tips:
        rib(elbow, t, 1.6, 0.4)
    # Membran: Fächer aus Dreiecksstreifen zwischen den Fingern, Hinterrand zur Mitte hin eingebuchtet
    N = 7
    def edge_pts(a, b):
        return [a.lerp(b, i / N) for i in range(N + 1)]
    rows = [edge_pts(elbow, t) for t in tips] + [edge_pts(elbow, V((12, 10, -6))), edge_pts(elbow, root)]
    for a, b in zip(rows, rows[1:]):
        # zwischen zwei Fingern: Streifen, die äußeren Punkte zum Gelenk hin gezogen (Bogen)
        vs_a = [bm.verts.new(p) for p in a]
        vs_b = [bm.verts.new(p) for p in b]
        for i in range(N - 1):                 # das letzte Stück schließt der Bogen am Hinterrand
            f = bm.faces.new((vs_a[i], vs_a[i + 1], vs_b[i + 1], vs_b[i]))
            set_mat([f], 'chrome' if mecha else 'membrane')
        # Bogen am Hinterrand: der letzte Punkt beider Finger wird durch einen eingezogenen Mittelpunkt verbunden
        m = bm.verts.new(elbow.lerp((a[-1] + b[-1]) / 2, 0.72))
        set_mat([bm.faces.new((vs_a[-2], vs_a[-1], m)), bm.faces.new((vs_b[-1], vs_b[-2], m)),
                 bm.faces.new((vs_a[-2], m, vs_b[-2]))], 'chrome' if mecha else 'membrane')
        for v in vs_a + vs_b + [m]:
            p = v.co
            if mecha:
                c = V((0.78, 0.78, 0.8)) if int(p.length / 7) % 2 else V((0.62, 0.62, 0.66))   # Metallsegmente
            else:
                c = V((0.86, 0.55, 0.16)) * (0.8 + 0.25 * noise.noise(p * 0.07))
            cols[v] = c
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('MGH_wing' if mecha else 'GH_wing', bm, cols, M, ORDER)


# ---------------- Köpfe ----------------
def head(M):
    """Drachenkopf: lange Schnauze, leicht geöffnetes Maul, Hörnerkrone nach hinten, kleines Nasenhorn."""
    E = [ell((0, -3, 1), (3.4, 4.2, 3.0)),
         ell((0, -9.5, 0.6), (2.3, 5.2, 1.7), (4, 0, 0)),      # Oberkiefer
         ell((0, -8.6, -1.9), (2.0, 4.6, 1.0), (-14, 0, 0)),   # Unterkiefer, offen
         ell((0, -9.0, -0.6), (1.8, 4.8, 0.7), None, True),    # Maul
         ell((0, 1, 0), (3.2, 3.0, 3.0))]                      # Halsansatz
    for sx in (1, -1):
        E.append(ell((sx * 1.9, -5.5, 2.4), (1.0, 2.6, 0.9)))  # Brauenwülste
    me = metaball_mesh('GH_head', E, 2600, res=0.45)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        cols[v] = gold(v.co * 1.2, v.normal)
    for f in bm.faces:
        c = f.calc_center_median()
        inside = c.y < -5 and -1.6 < c.z < 0.3 and abs(c.x) < 1.9
        f.material_index = ORDER.index('mouth' if inside else 'scale')
        f.smooth = True
    # Hörnerkrone: ein langes Mittelhorn und je drei seitlich, nach hinten geschwungen
    set_mat(add_cone(bm, V((0, -2.5, 3.4)), V((0, 1, 0.55)), 1.1, 9.5, 6), 'horn')
    for sx in (1, -1):
        for k, (x, z, L) in enumerate(((1.4, 3.0, 7.5), (2.4, 2.0, 6.5), (3.0, 0.6, 5.0))):
            set_mat(add_cone(bm, V((sx * x, -2.0, z)), V((sx * 0.45, 1, 0.35 - 0.15 * k)), 0.8, L, 5), 'horn')
        set_mat(add_cone(bm, V((sx * 2.2, -6.3, 2.0)), V((sx * 0.6, 0.2, 0.2)), 0.35, 0.6, 4), 'eye')   # Augen
    set_mat(add_cone(bm, V((0, -12.5, 1.6)), V((0, -0.3, 1)), 0.6, 2.4, 5), 'horn')               # Nasenhorn
    for i in range(7):                                                                         # Zähne
        y = -6.5 - i * 0.9
        for sx in (1, -1):
            x = sx * (1.7 - i * 0.12)
            set_mat(add_cone(bm, V((x, y, -0.4)), V((0, 0, -1)), 0.22, 0.9, 4), 'teeth')
            set_mat(add_cone(bm, V((x * 0.95, y + 0.3, -1.6 - i * 0.12)), V((0, 0, 1)), 0.2, 0.7, 4), 'teeth')
    return to_object('GH_head', bm, cols, M, ORDER, HEAD_SCALE)


def mecha_head(M):
    """Mechanischer Mittelkopf: kantige Panzerplatten, rotes Visier, Metallhörner."""
    bm = bmesh.new()
    cols = {}

    def box(size, loc, rot=(0, 0, 0), k='chrome', col=(0.7, 0.7, 0.72), taper=None):
        Mx = Matrix.Translation(loc) @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
        r = bmesh.ops.create_cube(bm, size=1.0, matrix=Mx)
        if taper:
            ymin = min(v.co.y for v in r['verts'])
            for v in r['verts']:
                if abs(v.co.y - ymin) < 1e-4:
                    v.co.x = loc[0] + (v.co.x - loc[0]) * taper
                    v.co.z = loc[2] + (v.co.z - loc[2]) * taper
        fs = list({f for v in r['verts'] for f in v.link_faces})
        set_mat(fs, k)
        for v in r['verts']:
            cols[v] = V(col)

    box((6.4, 7, 5.6), (0, -3, 1))                                  # Schädel
    box((4.4, 9, 2.6), (0, -10, 1.2), taper=0.6)                    # Oberkiefer
    box((3.8, 8, 1.4), (0, -9.4, -1.6), rot=(-12, 0, 0), taper=0.6, col=(0.55, 0.55, 0.58))   # Unterkiefer
    box((6.8, 1.0, 1.2), (0, -6.6, 2.6), k='red', col=(1, 0.2, 0.1))                 # Visier
    box((5.0, 3.0, 4.6), (0, 1.5, 0.5), col=(0.85, 0.66, 0.25))                     # Halsring (gold)
    for sx in (1, -1):
        box((0.8, 6, 3.6), (sx * 3.5, -3, 1.2), col=(0.85, 0.66, 0.25))             # Wangenplatten
    set_mat(add_cone(bm, V((0, -2.5, 3.8)), V((0, 1, 0.5)), 1.0, 8.5, 4), 'chrome')
    for sx in (1, -1):
        set_mat(add_cone(bm, V((sx * 2.2, -2, 3.0)), V((sx * 0.5, 1, 0.3)), 0.8, 6.0, 4), 'chrome')
    for i in range(6):
        y = -7 - i * 1.0
        for sx in (1, -1):
            set_mat(add_cone(bm, V((sx * (1.6 - i * 0.12), y, -0.1)), V((0, 0, -1)), 0.22, 0.8, 4), 'teeth')
    for v in bm.verts:
        cols.setdefault(v, V((0.7, 0.7, 0.72)))
    return to_object('MGH_head', bm, cols, M, ORDER, HEAD_SCALE)


def build():
    M = mats()
    return [body(M), body(M, True), wing(M), wing(M, True), head(M), mecha_head(M)]


def layout_preview(objs):
    """Nur zur Vorschau (nach dem Export): beide Ghidorahs zusammengesetzt, Hälse und Schwänze als Röhren."""
    by = {o.name: o for o in objs}
    for prefix, ox in (('GH', -70), ('MGH', 70)):
        b = by[prefix + '_body']; b.location = (ox, 0, 0)
        for sx in (1, -1):
            w = by[prefix + '_wing'] if sx > 0 else by[prefix + '_wing'].copy()
            if sx < 0:
                w.data = w.data.copy(); link(w)
                w.scale = (-1, 1, 1)
            w.location = (ox + sx * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2])
            w.rotation_euler = (0, sx * math.radians(-10), sx * math.radians(25))
        mat = b.data.materials[0]
        for i, (x, y, z) in enumerate(NECK_ROOTS):
            tip = V((ox + x * 2.2, y - 14, z + 32 - 6 * (i > 0)))
            tube([V((ox + x, y, z)), V((ox + x * 1.6, y - 10, z + 16)), tip], 4.4, 2.8, mat)
            h = by['GH_head'] if (i > 0 or prefix == 'GH') else by['MGH_head']
            if h.users_collection and h.location.length > 0.1:
                h = h.copy(); link(h)
            h.location = tip
        for x, y, z in TAIL_ROOTS:
            tube([V((ox + x, y, z)), V((ox + x * 3, y + 25, z - 22)), V((ox + x * 5, y + 55, 2)), V((ox + x * 7, y + 72, 3))], 4.2, 0.8, mat)


def tube(pts, r0, r1, mat):
    cu = bpy.data.curves.new('tube', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1); sp.points[i].radius = r0 + (r1 - r0) * i / (len(pts) - 1)
    ob = link(bpy.data.objects.new('tube', cu)); cu.materials.append(mat)
    return ob
