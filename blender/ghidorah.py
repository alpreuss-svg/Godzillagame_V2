"""King Ghidorah (1991) und Mecha-King Ghidorah, nach Bildern vom Nutzer.
Exportiert nur die starren Teile; Hälse und Schwänze baut das Spiel als Ketten (wie Biollantes Ranken), die Flügel
schlagen als ganze Teile um das Schultergelenk, die Köpfe setzt das Spiel auf die Halsspitzen.
- GH_body / MGH_body: Rumpf mit Beinen in goldenen Schuppen (Mecha zusätzlich: Chrom-Brustpanzer, Stiefel)
- GH_wing: riesiger Fledermausflügel (Arm, sechs Finger mit Krallen, Membran mit stark gebogtem Hinterrand)
- MGH_wing: Metallflügel (Nabe, fünf Holme mit roten Lichtern und Antennenspitzen, Gitterplatten im Rahmen)
- GH_head: Drachenkopf (zwei lange Hörner nach hinten, Stachelkrone), MGH_head: Mechanik-Kopf mit grünen Augen
- GH_tailtip: Stachelbüschel am Schwanzende, MGH_clamp: Greifzange am Schwanzende (beide zeigen nach +Z)
Blender: Z oben, schaut nach -Y (im glTF +Z). Köpfe: Ursprung = Halsansatz hinten am Schädel."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Euler, Matrix, noise
from common import link, material, make_image
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
RNG = np.random.default_rng(1991)

# Gelenkpunkte (auch im Spiel benutzt: ghidorah.js, dort als glTF x, z, -y)
NECK_ROOTS = [(0, -5, 67), (8.5, -2.5, 64), (-8.5, -2.5, 64)]
TAIL_ROOTS = [(3.2, 11, 31), (-3.2, 11, 31)]
WING_ROOT = (7.5, 7, 63)
HEAD_SCALE = 1.45          # Köpfe im Verhältnis zum Rumpf (Kopf ~20 m lang)


def mesh_image():
    """Gitterplatten der Mecha-Flügel: goldbraunes Lochblech."""
    n = 128
    ys, xs = np.mgrid[0:n, 0:n] / n
    holes = ((np.sin(xs * np.pi * 32) * np.sin(ys * np.pi * 32)) > 0.55).astype(float)
    col = np.zeros((n, n, 3))
    base = np.array([0.62, 0.48, 0.22])
    for c in range(3):
        col[..., c] = base[c] * (1 - 0.55 * holes) * (0.9 + 0.1 * np.sin(ys * 9))
    return make_image('MGH_mesh_img', col)


def mats():
    return {
        'scale': material('GH_Scale', rough=0.45, metal=0.55, vcol=True),
        'membrane': material('GH_Membrane', rough=0.55, metal=0.35, vcol=True),
        'horn': material('GH_Horn', color=(0.86, 0.72, 0.36), rough=0.4, metal=0.6),
        'mouth': material('GH_Mouth', color=(0.45, 0.08, 0.06), rough=0.6),
        'teeth': material('GH_Teeth', color=(0.9, 0.86, 0.72), rough=0.5),
        'eye': material('GH_Eye', color=(0.9, 0.2, 0.05), emit=(1.0, 0.25, 0.05), emit_strength=3.0),
        'chrome': material('MGH_Chrome', rough=0.3, metal=0.55, vcol=True),     # weniger Metall: nachts sonst schwarz
        'red': material('MGH_Light', color=(0.9, 0.1, 0.05), emit=(1.0, 0.15, 0.05), emit_strength=4.0),
        'green': material('MGH_Eye', color=(0.1, 0.9, 0.3), emit=(0.2, 1.0, 0.4), emit_strength=5.0),
        'mesh': material('MGH_Mesh', rough=0.5, metal=0.6, img=mesh_image()),
    }


ORDER = ['scale', 'membrane', 'horn', 'mouth', 'teeth', 'eye', 'chrome', 'red', 'green', 'mesh']


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('scale', 'membrane')


def to_object(name, bm, cols, M, scale=1.0):
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
    """Goldene Schuppen: große, überlappende Schuppen mit dunklen Fugen."""
    edge = noise.noise(p * 0.7, noise_basis='VORONOI_F2F1')
    c = V((0.95, 0.74, 0.28)) * (0.88 + 0.22 * noise.noise(p * 0.08)) * k
    if edge < 0.06:
        c = c * 0.62
    return c


def box(bm, cols, size, loc, k, col, rot=(0, 0, 0)):
    Mx = Matrix.Translation(loc) @ Euler([math.radians(r) for r in rot]).to_matrix().to_4x4() @ Matrix.Diagonal((*size, 1))
    r = bmesh.ops.create_cube(bm, size=1.0, matrix=Mx)
    fs = list({f for v in r['verts'] for f in v.link_faces})
    set_mat(fs, k)
    for v in r['verts']:
        cols[v] = V(col)
    return r['verts']


def rod(bm, cols, a, b, r0, r1, k, col, seg=8):
    d = b - a
    q = d.to_track_quat('Z', 'Y')
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r0, radius2=r1, depth=d.length,
                              matrix=Matrix.Translation(a + d / 2) @ q.to_matrix().to_4x4())
    set_mat(list({f for v in r['verts'] for f in v.link_faces}), k)
    for v in r['verts']:
        cols[v] = V(col)


# ---------------- Rumpf ----------------
def body(M, mecha=False):
    E = [ell((0, -1, 51), (11.5, 9.8, 16.5), (10, 0, 0)),   # Rumpf, aufrecht, leicht vorgebeugt
         ell((0, -4, 61), (13.2, 9.8, 9.2)),                 # Brust und Schultern
         ell((0, -8, 57), (9.5, 4.5, 7)),                    # gewölbte Brust
         ell((0, -5.5, 44), (8.5, 7, 9)),                    # Bauch
         ell((0, 3, 35), (11, 9.5, 8))]                      # Becken
    for x, y, z in NECK_ROOTS:
        E.append(('b', V((x, y, z)), 5.4))
    for x, y, z in TAIL_ROOTS:
        chain(E, [(x * 0.6, 6, 34), (x, y, z), (x * 1.2, y + 5, z - 4)], 6.5, 4.6)
    for sx in (1, -1):
        E.append(('b', V((sx * 7, 6, 62)), 4.5))
        chain(E, [(sx * 8, 4, 35), (sx * 11, -3, 21), (sx * 10.5, 5, 7.5), (sx * 10.5, -1, 2.5)], 8.0, 4.2)
    name = 'MGH_body' if mecha else 'GH_body'
    me = metaball_mesh(name, E, 9000, res=1.1)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        belly = n.y < -0.5 and abs(p.x) < 7 and 32 < p.z < 64
        bump = noise.noise(p * 0.7, noise_basis='VORONOI_F2F1') * 0.6
        if belly:
            bump = 0.3 * math.sin(p.z * 1.4)                 # Bauchplatten
        v.co += n * bump
        cols[v] = gold(p, n, 1.15 if belly else 1.0)
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('scale')
    bm.normal_update()
    for sx in (1, -1):                                       # Krallen
        for k in (-1, 0, 1):
            set_mat(add_cone(bm, V((sx * 10.5 + k * 2.3, -5.5, 1.6)), V((k * 0.25, -1, -0.3)), 1.0, 3.6, 5), 'horn')
        set_mat(add_cone(bm, V((sx * 10.5, 3.5, 1.5)), V((0, 1, -0.3)), 0.9, 2.8, 5), 'horn')
    if mecha:
        steel, dark = (0.9, 0.9, 0.92), (0.38, 0.38, 0.42)
        # Brustpanzer: gewölbte Schale über Brust und Bauch, Plattenfugen, Gürtel, Mittelgrat, Halskragen
        r = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
        for v in r['verts']:
            d = v.co.copy()
            v.co = V((d.x * 17, d.y * 13.5 - 3.5, d.z * 18 + 54))
            if v.co.y < -14.5:
                v.co.y = -14.5 + (v.co.y + 14.5) * 0.35                # vorn abgeflacht
            groove = abs(math.sin(v.co.z * 0.5)) < 0.1 or abs(v.co.x) < 0.7 or abs(abs(v.co.x) - 8) < 0.5
            cols[v] = V(dark) if groove else V(steel)
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'chrome')
        box(bm, cols, (34, 28, 4.2), (0, -3, 46), 'chrome', dark)                   # breiter Gürtel
        box(bm, cols, (6, 2, 3.4), (0, -17.4, 46), 'chrome', steel)                 # Gürtelschnalle
        box(bm, cols, (2, 0.8, 1.2), (0, -18.5, 46), 'red', (1, 0.2, 0.1))
        for k in range(3):                                                           # erhabene Paneele auf der Brust
            for sx in (1, -1):
                box(bm, cols, (6.5, 1.2, 4.2), (sx * 4.2, -16.0 + k * 0.4, 61 - k * 5.2), 'chrome', steel, (0, 0, sx * 8))
        box(bm, cols, (12, 10, 3.5), (0, -4, 70), 'chrome', steel)                  # Halskragen
        for sx in (1, -1):
            box(bm, cols, (5, 6, 2.4), (sx * 6, -15.2, 58), 'chrome', dark, (0, 0, sx * 12))   # Panzerplatten
            box(bm, cols, (0.8, 1.4, 0.8), (sx * 9, -15.6, 52), 'red', (1, 0.2, 0.1))
            # Stiefel: kantige Panzer um die Unterschenkel
            box(bm, cols, (12, 13, 16), (sx * 10.8, 1.5, 11), 'chrome', steel)       # wuchtige Stiefel
            box(bm, cols, (12.6, 3.4, 2.6), (sx * 10.8, -5.4, 18.5), 'chrome', dark)
            box(bm, cols, (12.6, 14, 2.4), (sx * 10.8, 1.5, 3.4), 'chrome', dark)    # Sohle
            box(bm, cols, (1.2, 1.2, 1.2), (sx * 10.8, -5.8, 13), 'red', (1, 0.2, 0.1))
    return to_object(name, bm, cols, M)


# ---------------- Flügel ----------------
def wing(M):
    """King Ghidorahs Fledermausflügel (links): Oberarm, Unterarm bis zum hoch liegenden Handgelenk, sechs Finger
    fächern nach außen und unten; zwischen den Fingern Membran mit stark eingezogenem Hinterrand."""
    bm = bmesh.new()
    cols = {}
    root, elbow, wrist = V((0, 0, 0)), V((24, 6, 22)), V((44, 9, 46))
    tips = [V((98, 10, 70)), V((104, 13, 36)), V((96, 15, 4)), V((80, 15, -22)), V((60, 13, -38)), V((38, 10, -44))]
    body_pt = V((6, 8, -26))
    rib = (0.78, 0.56, 0.16)
    rod(bm, cols, root, elbow, 3.0, 2.4, 'scale', rib)
    rod(bm, cols, elbow, wrist, 2.4, 1.9, 'scale', rib)
    for t in tips:
        rod(bm, cols, wrist, t, 1.5, 0.35, 'scale', rib)
        set_mat(add_cone(bm, t, (t - wrist).normalized(), 0.7, 4.0, 5), 'horn')       # Kralle an der Fingerspitze
    set_mat(add_cone(bm, wrist + V((0, -1, 1)), V((0.3, -0.4, 1)), 1.0, 5, 5), 'horn')   # Daumenkralle

    def patch(A0, A1, B0, B1, sag, nu=6, nv=5):
        """Membran zwischen den Strecken A0-A1 und B0-B1; der äußere Rand (A1-B1) wird zur Mitte hin eingezogen."""
        grid = []
        for i in range(nu + 1):
            u = i / nu
            a, b = A0.lerp(A1, u), B0.lerp(B1, u)
            row = []
            for j in range(nv + 1):
                v = j / nv
                p = a.lerp(b, v)
                inward = ((A0 + B0) / 2 - (A1 + B1) / 2)
                p = p + inward * sag * math.sin(math.pi * v) * u ** 2
                vert = bm.verts.new(p)
                k = 0.7 + 0.18 * noise.noise(p * 0.06) + 0.22 * math.sin(math.pi * v) - 0.2 * u * u
                c = V((0.86, 0.6, 0.18)).lerp(V((0.62, 0.32, 0.08)), 0.5 * (1 - math.sin(math.pi * v)))
                cols[vert] = c * k
                row.append(vert)
            grid.append(row)
        for i in range(nu):
            for j in range(nv):
                f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
                set_mat([f], 'membrane')

    for a, b in zip(tips, tips[1:]):
        patch(wrist, a, wrist, b, 0.45, 8, 6)                  # stark gebogter Hinterrand
    patch(wrist, tips[-1], elbow, body_pt, 0.22)
    patch(elbow, body_pt, root, body_pt * 0.4, 0.0, 3, 3)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('GH_wing', bm, cols, M)


def mecha_wing(M):
    """Mecha-Flügel (links): runde Nabe, fünf Holme mit roten Lichtern und Antennenspitzen, dazwischen Gitterplatten in
    Rahmen (Lochblech-Textur, UV planar)."""
    bm = bmesh.new()
    cols = {}
    uv = bm.loops.layers.uv.verify()
    steel, dark = (0.76, 0.76, 0.78), (0.45, 0.45, 0.48)
    hub_n = V((1, 0, 0))
    r = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=9, radius2=8, depth=4,
                              matrix=Matrix.Translation(V((2, 0, 0))) @ hub_n.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'chrome')
    for v in r['verts']:
        cols[v] = V(steel)
    spars = [(62, 92), (28, 100), (-8, 96), (-42, 86), (-74, 66)]     # Winkel (Grad, von +X nach oben) und Länge
    ends = []
    for ang, L in spars:
        a = math.radians(ang)
        d = V((math.cos(a), 0.08, math.sin(a)))
        p0, p1 = V((4, 0, 0)) + d * 8, V((4, 0, 0)) + d * L
        rod(bm, cols, p0, p1, 1.4, 1.0, 'chrome', steel, 6)
        rod(bm, cols, p1, p1 + d * 14, 0.5, 0.05, 'chrome', steel, 5)          # Antennenspitze
        for k in (0.35, 0.65):
            box(bm, cols, (2.2, 2.2, 1.0), tuple(p0.lerp(p1, k)), 'red', (1, 0.2, 0.1), (0, -ang, 0))
        ends.append((p0, p1))
    for (a0, a1), (b0, b1) in zip(ends, ends[1:]):
        # Gitterplatte und Rahmen (Außenkante und Rand innen an der Nabe)
        quad = [a0, a1, b1, b0]
        vs = [bm.verts.new(p) for p in quad]
        f = bm.faces.new(vs)
        set_mat([f], 'mesh')
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x / 14, loop.vert.co.z / 14)
        for v in vs:
            cols[v] = V((1, 1, 1))
        rod(bm, cols, a1, b1, 0.9, 0.9, 'chrome', dark, 6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('MGH_wing', bm, cols, M)


# ---------------- Köpfe ----------------
def head(M):
    """Drachenkopf: lange Schnauze, Maul leicht offen, zwei lange Hörner nach hinten, Stachelkrone und Wangenstacheln."""
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
    cols = {v: gold(v.co * 1.2, v.normal) for v in bm.verts}
    for f in bm.faces:
        c = f.calc_center_median()
        inside = c.y < -5 and -1.6 < c.z < 0.3 and abs(c.x) < 1.9
        f.material_index = ORDER.index('mouth' if inside else 'scale')
        f.smooth = True
    for sx in (1, -1):
        set_mat(add_cone(bm, V((sx * 1.3, -3.0, 3.3)), V((sx * 0.25, 1, 0.8)), 1.0, 12.0, 6), 'horn')   # lange Hörner
        for k, (x, z, L) in enumerate(((2.3, 2.4, 5.5), (3.0, 1.0, 4.5), (3.2, -0.5, 3.5))):
            set_mat(add_cone(bm, V((sx * x, -1.5, z)), V((sx * 0.5, 1, 0.3 - 0.15 * k)), 0.6, L, 5), 'horn')   # Krone
        for k in range(3):
            set_mat(add_cone(bm, V((sx * 2.1, -7 - k * 1.6, -1.2)), V((sx * 1, 0.4, -0.3)), 0.25, 1.6, 4), 'horn')  # Wangenstacheln
        set_mat(add_cone(bm, V((sx * 2.2, -6.3, 2.0)), V((sx * 0.6, 0.2, 0.2)), 0.35, 0.6, 4), 'eye')
    set_mat(add_cone(bm, V((0, -4.5, 3.4)), V((0, 0.6, 1)), 0.6, 3.2, 5), 'horn')
    set_mat(add_cone(bm, V((0, -12.5, 1.6)), V((0, -0.3, 1)), 0.6, 2.4, 5), 'horn')               # Nasenhorn
    for i in range(7):                                                                         # Zähne
        y = -6.5 - i * 0.9
        for sx in (1, -1):
            x = sx * (1.7 - i * 0.12)
            set_mat(add_cone(bm, V((x, y, -0.4)), V((0, 0, -1)), 0.22, 0.9, 4), 'teeth')
            set_mat(add_cone(bm, V((x * 0.95, y + 0.3, -1.6 - i * 0.12)), V((0, 0, 1)), 0.2, 0.7, 4), 'teeth')
    return to_object('GH_head', bm, cols, M, HEAD_SCALE)


def mecha_head(M):
    """Mechanik-Kopf: kantige Silberplatten, grüne Augen, Hörner und Rückenstacheln aus Metall, Zahnreihen."""
    bm = bmesh.new()
    cols = {}
    steel, dark = (0.78, 0.78, 0.8), (0.48, 0.48, 0.5)

    def tbox(size, loc, rot=(0, 0, 0), k='chrome', col=steel, taper=None):
        vs = box(bm, cols, size, loc, k, col, rot)
        if taper:
            ymin = min(v.co.y for v in vs)
            for v in vs:
                if abs(v.co.y - ymin) < 1e-3:
                    v.co.x = loc[0] + (v.co.x - loc[0]) * taper
                    v.co.z = loc[2] + (v.co.z - loc[2]) * taper

    tbox((6.0, 7, 5.0), (0, -3, 1))                                  # Schädel
    tbox((4.2, 9.5, 2.4), (0, -10.2, 1.3), taper=0.55)               # Oberkiefer
    tbox((3.6, 8.5, 1.4), (0, -9.6, -1.5), rot=(-12, 0, 0), taper=0.55, col=dark)   # Unterkiefer
    tbox((5.0, 3.0, 4.4), (0, 1.5, 0.5), col=dark)                   # Halsgelenk
    for sx in (1, -1):
        tbox((0.9, 1.6, 1.0), (sx * 2.6, -6.4, 2.4), k='green', col=(0.2, 1, 0.4))   # Augen
        tbox((0.6, 6, 3.2), (sx * 3.2, -3, 1.0), col=dark)            # Wangenplatten
        set_mat(add_cone(bm, V((sx * 1.6, -2.5, 3.6)), V((sx * 0.3, 1, 0.7)), 0.8, 9.0, 4), 'chrome')
        set_mat(add_cone(bm, V((sx * 2.8, -1.0, 2.4)), V((sx * 0.6, 1, 0.3)), 0.5, 5.0, 4), 'chrome')
    for k in range(4):
        set_mat(add_cone(bm, V((0, -1 + k * 1.6, 3.6)), V((0, 0.4, 1)), 0.5, 3.0 - k * 0.4, 4), 'chrome')   # Rückenstacheln
    tbox((0.6, 1.2, 0.6), (0, -12.5, 2.6), k='red', col=(1, 0.2, 0.1))
    for i in range(6):
        y = -7 - i * 1.0
        for sx in (1, -1):
            set_mat(add_cone(bm, V((sx * (1.6 - i * 0.12), y, 0.0)), V((0, 0, -1)), 0.22, 0.9, 4), 'teeth')
    for v in bm.verts:
        cols.setdefault(v, V(steel))
    return to_object('MGH_head', bm, cols, M, HEAD_SCALE)


def tail_tip(M):
    """Stachelbüschel am Schwanzende (zeigt nach +Z)."""
    bm = bmesh.new()
    cols = {}
    for ring, (n, r, out, L, w) in enumerate(((11, 1.4, 0.9, 8.5, 0.9), (8, 0.8, 0.45, 10, 0.8))):   # zwei Kränze
        for k in range(n):
            a = k * 2 * math.pi / n + ring * 0.3
            d = V((math.cos(a) * out, math.sin(a) * out, 1)).normalized()
            set_mat(add_cone(bm, V((math.cos(a) * r, math.sin(a) * r, ring * 1.5)), d, w, L, 4), 'horn')
    set_mat(add_cone(bm, V((0, 0, 0)), V((0, 0, 1)), 1.4, 11, 5), 'horn')
    return to_object('GH_tailtip', bm, cols, M)


def clamp(M):
    """Greifzange am Schwanzende des Mecha (zeigt nach +Z): Gelenkzylinder und drei Klauen."""
    bm = bmesh.new()
    cols = {}
    steel = (0.76, 0.76, 0.78)
    rod(bm, cols, V((0, 0, 0)), V((0, 0, 4)), 2.0, 2.0, 'chrome', steel, 10)
    for k in range(3):
        a = k * 2 * math.pi / 3
        o = V((math.cos(a), math.sin(a), 0))
        rod(bm, cols, o * 1.6 + V((0, 0, 4)), o * 3.6 + V((0, 0, 8)), 0.6, 0.5, 'chrome', steel, 6)
        rod(bm, cols, o * 3.6 + V((0, 0, 8)), o * 1.4 + V((0, 0, 12)), 0.5, 0.15, 'chrome', steel, 6)
    return to_object('MGH_clamp', bm, cols, M)


def build():
    M = mats()
    return [body(M), body(M, True), wing(M), mecha_wing(M), head(M), mecha_head(M), tail_tip(M), clamp(M)]


def layout_preview(objs):
    """Nur zur Vorschau (nach dem Export): beide Ghidorahs zusammengesetzt, Hälse und Schwänze als Röhren."""
    by = {o.name: o for o in objs}
    for prefix, ox in (('GH', -80), ('MGH', 80)):
        b = by[prefix + '_body']; b.location = (ox, 0, 0)
        for sx in (1, -1):
            src = by[prefix + '_wing']
            w = src if sx > 0 else src.copy()
            if sx < 0:
                link(w)
                w.scale = (-1, 1, 1)
            w.location = (ox + sx * WING_ROOT[0], WING_ROOT[1], WING_ROOT[2])
            w.rotation_euler = (0, sx * math.radians(-10), sx * math.radians(18))
        gold_mat, steel_mat = by['GH_body'].data.materials[0], by['MGH_head'].data.materials[0]
        for i, (x, y, z) in enumerate(NECK_ROOTS):
            tip = V((ox + x * 2.6, y - 16, z + 40 - 8 * (i > 0)))
            mech = prefix == 'MGH' and i == 0
            tube([V((ox + x, y, z)), V((ox + x * 1.8, y - 8, z + 22)), tip], 4.6, 3.2, steel_mat if mech else gold_mat)
            h = (by['MGH_head'] if mech else by['GH_head']).copy(); link(h)
            h.location = tip
        for x, y, z in TAIL_ROOTS:
            end = V((ox + x * 7, y + 72, 3))
            tube([V((ox + x, y, z)), V((ox + x * 3, y + 25, z - 22)), V((ox + x * 5, y + 55, 2)), end], 4.4, 0.9, gold_mat)
            t = (by['MGH_clamp'] if prefix == 'MGH' else by['GH_tailtip']).copy(); link(t)
            t.location = end; t.rotation_euler = (math.radians(-90), 0, 0)
    for n in ('GH_head', 'MGH_head', 'GH_tailtip', 'MGH_clamp'):
        by[n].hide_render = True


def tube(pts, r0, r1, mat):
    cu = bpy.data.curves.new('tube', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 1.0; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1); sp.points[i].radius = r0 + (r1 - r0) * i / (len(pts) - 1)
    ob = link(bpy.data.objects.new('tube', cu)); cu.materials.append(mat)
    return ob
