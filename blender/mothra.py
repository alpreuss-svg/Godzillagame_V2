"""Mothra und Battra (1992). Nur starre Teile; den Körper der Battra-Larve baut das Spiel als Kette (chain.js), die
Flügel schlagen als ganze Teile um die Körperlängsachse.
- MO_body: Mothra, pelziger Körper (Brust, Kopf mit großen blauen Augen und gefiederten Fühlern, geringelter Hinterleib)
- MO_wing: linker Flügel (Vorder- und Hinterflügel), orange-gelb mit schwarzem Rand, gelben Randflecken, Augenflecken
- BT_body: Battra-Falter, dunkel gepanzert, langes Horn, rote Augen, stachliger Hinterleib
- BT_wing: linker Flügel, spitz und gezackt, schwarzbraun mit roten Zickzacklinien
- BT_head: Kopf der Battra-Larve (Horn, rote Augen, Kiefer), schaut nach -Y wie die Körper (sitzt auf der Kettenspitze)
Blender: Z oben, Kopf nach -Y (im glTF +Z), Flügel in der XY-Ebene (waagrecht), linker Flügel nach +X."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, noise
from common import link, material, make_image
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
RNG = np.random.default_rng(1992)
WING_ROOT = (7.5, -5, 1.5)       # auch in mothra.js (glTF x, z, -y)

# Flügelumrisse (x nach außen, y nach hinten), Vorder- und Hinterflügel
MO_FORE = [(0, -7), (18, -17), (42, -27), (66, -33), (82, -27), (84, -12), (74, 2), (52, 9), (26, 9), (0, 4)]
MO_HIND = [(0, 2), (24, 8), (50, 14), (66, 26), (64, 42), (48, 52), (28, 50), (12, 38), (0, 20)]
BT_FORE = [(0, -6), (20, -18), (46, -30), (74, -40), (92, -42), (80, -30), (86, -20), (74, -12), (80, -4), (64, 2),
           (68, 8), (48, 8), (24, 8), (0, 4)]
BT_HIND = [(0, 2), (22, 8), (46, 14), (60, 22), (54, 30), (62, 40), (48, 42), (50, 56), (36, 48), (26, 54), (18, 40),
           (8, 34), (0, 20)]
UV_W, UV_Y0, UV_H = 96.0, -46.0, 104.0


def mats():
    return {
        'fur': material('MO_Fur', rough=0.95, vcol=True),
        'wingM': material('MO_Wing', rough=0.7, img=wing_image(True), emit_img=None),
        'wingB': material('BT_Wing', rough=0.6, metal=0.15, img=wing_image(False)),
        'horn': material('MO_Horn', color=(0.35, 0.3, 0.26), rough=0.45, metal=0.3),
        'eyeM': material('MO_Eye', color=(0.15, 0.45, 1.0), emit=(0.25, 0.6, 1.0), emit_strength=2.5),
        'eyeB': material('BT_Eye', color=(1.0, 0.15, 0.05), emit=(1.0, 0.2, 0.05), emit_strength=4.0),
    }


ORDER = ['fur', 'wingM', 'wingB', 'horn', 'eyeM', 'eyeB']


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k == 'fur'


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
        arr[v.index, :3] = lin(cols.get(v, (0.5, 0.4, 0.3)))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for i in used:
        me.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, me))


# ---------------- Flügelmuster ----------------
def poly_dist(px, py, poly):
    """Abstand jedes Punkts zum Umriss und ob er innen liegt (numpy, vektorisiert)."""
    P = np.array(poly, float)
    d = np.full(px.shape, 1e9)
    inside = np.zeros(px.shape, bool)
    for (x0, y0), (x1, y1) in zip(P, np.roll(P, -1, axis=0)):
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        d = np.minimum(d, np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)))
        cross = ((y0 > py) != (y1 > py)) & (px < (x1 - x0) * (py - y0) / (y1 - y0 + 1e-9) + x0)
        inside ^= cross
    return d, inside


def wing_image(mothra, n=512):
    ys, xs = np.mgrid[0:n, 0:n] / n
    X, Y = xs * UV_W, UV_Y0 + (1 - ys) * UV_H            # Bildzeile 0 = oben = großes v
    col = np.zeros((n, n, 3))
    fore, hind = (MO_FORE, MO_HIND) if mothra else (BT_FORE, BT_HIND)
    df, inf = poly_dist(X, Y, fore)
    dh, inh = poly_dist(X, Y, hind)
    d = np.where(inf, df, dh)
    veins = np.abs(np.sin(np.arctan2(Y, X + 6) * 14)) < 0.06       # Adern strahlen vom Gelenk aus
    if mothra:
        base = np.array([0.96, 0.56, 0.14])
        inner = np.array([1.0, 0.86, 0.45])
        k = np.clip((np.hypot(X, Y) - 10) / 50, 0, 1)[..., None]
        col[:] = inner * (1 - k) + base * k
        band = d < 7
        col[band] = [0.08, 0.06, 0.05]
        spots = band & (np.abs(np.sin((X + Y) * 0.28)) > 0.75) & (d > 2.2) & (d < 5.5)
        col[spots] = [1.0, 0.85, 0.3]
        for cx, cy, r in ((48, -12, 10), (40, 30, 9)):                  # Augenflecken
            rr = np.hypot(X - cx, Y - cy) / r
            col[rr < 1.0] = [0.08, 0.06, 0.05]
            col[rr < 0.75] = [1.0, 0.82, 0.25]
            col[rr < 0.45] = [0.2, 0.45, 0.95]
            col[rr < 0.18] = [0.95, 0.95, 0.9]
        col[veins & ~band] *= 0.75
    else:
        base = np.array([0.12, 0.08, 0.06])
        col[:] = base
        zig = np.abs(np.sin(X * 0.35 + np.sin(Y * 0.5) * 2.2)) < 0.12
        lines = zig & (np.abs(np.sin(Y * 0.12)) > 0.55)
        col[lines] = [0.9, 0.22, 0.05]
        col[(d < 3.5)] = [0.55, 0.12, 0.04]
        for cx, cy, r in ((52, -18, 7), (34, 28, 6)):
            rr = np.hypot(X - cx, Y - cy) / r
            col[rr < 1.0] = [0.95, 0.35, 0.05]
            col[rr < 0.5] = [0.1, 0.05, 0.03]
        col[veins] = col[veins] * 0.6 + np.array([0.3, 0.08, 0.02]) * 0.4
    return make_image('MO_wing_img' if mothra else 'BT_wing_img', col)


def wing(M, mothra):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    cols = {}
    for poly in ((MO_FORE, MO_HIND) if mothra else (BT_FORE, BT_HIND)):
        vs = [bm.verts.new(V((x, y, 0.4 * math.sin(x * 0.05)))) for x, y in poly]   # leicht gewölbt
        f = bm.faces.new(vs)
        res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
        set_mat(res['faces'], 'wingM' if mothra else 'wingB')
        for t in res['faces']:
            for loop in t.loops:
                loop[uv].uv = (loop.vert.co.x / UV_W, (loop.vert.co.y - UV_Y0) / UV_H)
        for v in vs:
            cols[v] = V((1, 1, 1))
    # Flügeladern als flache Rippen am Vorderrand
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('MO_wing' if mothra else 'BT_wing', bm, cols, M)


# ---------------- Körper ----------------
def body(M, mothra):
    E = [ell((0, -8, 0), (9, 10, 8.5)),                      # Brust
         ell((0, -19, 1), (6.5, 6, 6)),                      # Kopf
         ell((0, 14, -1), (7, 22, 7), (-4, 0, 0))]           # Hinterleib
    for i in range(6):                                        # Ringe am Hinterleib
        E.append(ell((0, 2 + i * 6, -1 - i * 0.3), (7.6 - i * 0.6, 2.2, 7.4 - i * 0.6)))
    if mothra:
        E.append(ell((0, -13, 2), (10, 4, 8)))               # weißer Pelzkragen
    name = 'MO_body' if mothra else 'BT_body'
    me = metaball_mesh(name, E, 5000, res=0.7)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        if mothra:
            v.co += n * noise.noise(p * 0.9) * 0.6                    # Pelz
            c = V((0.62, 0.42, 0.22)) * (0.85 + 0.3 * noise.noise(p * 0.3))
            if -16 < p.y < -10:
                c = V((0.92, 0.88, 0.8))                               # Kragen
            if p.y > 0 and abs(math.sin(p.y * 0.52)) < 0.25:
                c = c * 0.6                                            # Ringe
        else:
            v.co += n * noise.noise(p * 0.5, noise_basis='VORONOI_F2F1') * 0.7   # Panzerplatten
            c = V((0.2, 0.14, 0.1)) * (0.85 + 0.3 * noise.noise(p * 0.2))
            if p.z > 3:
                c = c.lerp(V((0.5, 0.12, 0.04)), 0.35)
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    bm.normal_update()
    eye = 'eyeM' if mothra else 'eyeB'
    for sx in (1, -1):
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=3.0 if mothra else 2.2)
        for v in r['verts']:
            v.co += V((sx * 4.6, -21.5, 2.2))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), eye)
        # Beine: dünn, nach unten
        for k in range(3):
            base = V((sx * 5, -12 + k * 5, -5))
            set_mat(add_cone(bm, base, V((sx * 0.5, -0.2 + k * 0.2, -1)), 1.0, 13, 5), 'horn')
        if mothra:
            # gefiederte Fühler: Schaft und seitliche Federn
            a, b = V((sx * 2.5, -24, 5)), V((sx * 12, -40, 14))
            set_mat(add_cone(bm, a, (b - a).normalized(), 0.6, (b - a).length, 5), 'horn')
            for k in range(8):
                p0 = a.lerp(b, 0.2 + k * 0.1)
                set_mat(add_cone(bm, p0, V((sx * 0.8, 0.3, 0.2)), 0.35, 4.5 - k * 0.3, 4), 'horn')
                set_mat(add_cone(bm, p0, V((-sx * 0.3, 0.6, 0.3)), 0.35, 3.5 - k * 0.2, 4), 'horn')
        else:
            set_mat(add_cone(bm, V((sx * 2, -22, 5)), V((sx * 0.6, -0.7, 0.7)), 0.5, 7, 4), 'horn')   # kurze Fühler
            for k in range(5):                                             # Stacheln am Hinterleib
                set_mat(add_cone(bm, V((sx * 6, 4 + k * 6, 1)), V((sx * 1, 0.3, 0.5)), 1.0, 4.5, 4), 'horn')
    if not mothra:
        set_mat(add_cone(bm, V((0, -22, 4)), V((0, -1, 0.35)), 2.4, 20, 6), 'horn')   # langes Horn
        for k in range(5):
            set_mat(add_cone(bm, V((0, -4 + k * 7, 6.5 - k * 0.4)), V((0, 0.3, 1)), 1.2, 5, 4), 'horn')
    return to_object(name, bm, cols, M)


def larva_head(M):
    """Kopf der Battra-Larve, schaut nach -Y (glTF +Z), Halsansatz bei y=0: gepanzerter Kopf, langes Horn nach vorn
    oben, Reihen roter Augen, Kiefer vorn."""
    E = [('b', V((0, 1, 0)), 9), ell((0, -6, 0.5), (8.5, 7.5, 7)), ell((0, -12.5, -0.5), (5.5, 5, 4.5))]
    me = metaball_mesh('BT_head', E, 2400, res=0.6)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        v.co += v.normal * noise.noise(v.co * 0.5, noise_basis='VORONOI_F2F1') * 0.5
        c = V((0.2, 0.13, 0.09)) * (0.85 + 0.3 * noise.noise(v.co * 0.2))
        if v.normal.z > 0.6:
            c = c.lerp(V((0.55, 0.14, 0.05)), 0.3)
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    set_mat(add_cone(bm, V((0, -9, 5)), V((0, -1, 0.6)), 2.8, 20, 6), 'horn')          # langes Horn
    for sx in (1, -1):
        for k in range(3):
            r = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.4 - k * 0.2)
            for v in r['verts']:
                v.co += V((sx * (6.4 + k * 1.3), -11 + k * 2.6, 2.4 - k * 0.6))
            set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eyeB')
        set_mat(add_cone(bm, V((sx * 3.2, -15, -2.5)), V((-sx * 0.5, -1, -0.2)), 1.3, 6.5, 5), 'horn')   # Kiefer
    return to_object('BT_head', bm, cols, M)


def build():
    M = mats()
    return [body(M, True), wing(M, True), body(M, False), wing(M, False), larva_head(M)]


def layout_preview(objs):
    by = {o.name: o for o in objs}
    for prefix, ox in (('MO', -110), ('BT', 110)):
        b = by[prefix + '_body']; b.location = (ox, 0, 40)
        for sx in (1, -1):
            src = by[prefix + '_wing']
            w = src if sx > 0 else src.copy()
            if sx < 0:
                link(w); w.scale = (-1, 1, 1)
            w.location = (ox + sx * WING_ROOT[0], WING_ROOT[1], 40 + WING_ROOT[2])
            w.rotation_euler = (0, sx * math.radians(-12), 0)
    by['BT_head'].location = (0, 0, 12)
