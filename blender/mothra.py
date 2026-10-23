"""Mothra und Battra (1992) nach Filmbildern des Nutzers. Nur starre Teile; den Körper der Battra-Larve baut das Spiel
als Kette (chain.js), die Flügel schlagen als ganze Teile um die Körperlängsachse.
- MO_body: Mothra – weißer Pelz mit orangen Querstreifen an Brust und Hinterleib, schwarze Flecken an der Brust unter
  den Flügeln, großer runder Kopf mit riesigen blauen Facettenaugen, schwarze Schnauze, kurze gebogene weiße Fühler,
  graue Beine mit gelben Krallen, unter dem Körper angewinkelt.
- MO_wing: linker Flügel – Vorderflügel gelb-orange mit großen schwarzen Flammenflecken, Augenring an der Spitze und
  dicker gelber Pelzkante vorn; Hinterflügel orange-rot mit schwarzen Bögen.
- BT_body: Battra-Falter – schwarz gepanzert, Krone aus gelben Hörnern, rote Augen, Fangzähne, kräftige Krallenarme,
  geringelter Hinterleib mit roten Flecken und Zangen am Ende.
- BT_wing: linker Flügel – schwarz mit roten Blitzen, gelb umrandet, gezackter Hinterrand.
- MO_larva: Kopf der Mothra-Larve – rotbraune Kuppel mit vier tiefen Augenhöhlen, Rüsselmaul mit Hornzacken,
  Stummelbeine mit Borsten (den Körper baut das Spiel als Kette); MO_cocoon: weißer Seidenkokon.
- BT_head: Kopf der Battra-Larve – schiefergrau gepanzert mit goldenen Plattenrändern, langes goldenes Horn schräg nach
  vorn oben, große rote Schlitzaugen, geschwungene Hauer, Kiefer; schaut nach -Y (sitzt auf der Kettenspitze).
Blender: Z oben, Kopf nach -Y (im glTF +Z), Flügel in der XY-Ebene (waagrecht), linker Flügel nach +X."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, noise
from common import link, material, make_image
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
RNG = np.random.default_rng(1992)
WING_ROOT = (7.5, -5, 1.5)       # auch in kaiju.js (glTF x, z, -y)


def smooth(poly, it=2):
    """Chaikin-Glättung eines geschlossenen Umrisses (runde Flügelkanten)."""
    P = [V((x, y, 0)) for x, y in poly]
    for _ in range(it):
        Q = []
        for a, b in zip(P, P[1:] + P[:1]):
            Q += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        P = Q
    return [(p.x, p.y) for p in P]


# Flügelumrisse (x nach außen, y nach hinten), Vorder- und Hinterflügel
MO_FORE = smooth([(0, -6), (16, -16), (40, -28), (62, -36), (80, -34), (90, -22), (86, -8), (70, 4), (46, 10), (20, 10), (0, 4)])
MO_HIND = smooth([(0, 2), (20, 7), (40, 10), (52, 18), (54, 31), (44, 40), (28, 42), (12, 33), (0, 18)])
BT_FORE = [(0, -6), (20, -18), (46, -30), (74, -40), (94, -44), (86, -34), (90, -26), (80, -22), (84, -14), (72, -10),
           (76, -2), (62, 2), (64, 8), (48, 7), (46, 11), (30, 8), (24, 11), (0, 4)]
BT_HIND = [(0, 2), (22, 8), (46, 14), (62, 20), (56, 26), (64, 32), (54, 36), (58, 44), (46, 44), (48, 54), (36, 48),
           (30, 56), (22, 44), (12, 40), (0, 20)]
UV_W, UV_Y0, UV_H = 96.0, -46.0, 104.0
MO_LEAD = [(1, -5.5), (16, -15), (40, -27), (62, -35), (78, -33.5), (88, -23)]   # gelbe Pelzkante am Vorderflügel


def mats():
    return {
        'fur': material('MO_Fur', rough=0.95, vcol=True),
        'wingM': material('MO_Wing', rough=0.7, img=wing_image(True)),
        'wingB': material('BT_Wing', rough=0.55, metal=0.1, img=wing_image(False)),
        'horn': material('MO_Horn', color=(0.2, 0.19, 0.2), rough=0.45, metal=0.3),
        'claw': material('MO_Claw', color=(0.95, 0.78, 0.25), rough=0.4, metal=0.1),
        'gold': material('BT_Gold', color=(0.86, 0.66, 0.22), rough=0.35, metal=0.5),
        'bone': material('BT_Bone', color=(0.82, 0.78, 0.66), rough=0.5),
        'eyeM': material('MO_Eye', color=(0.1, 0.38, 0.95), emit=(0.2, 0.5, 1.0), emit_strength=0.7, rough=0.15),
        'eyeB': material('BT_Eye', color=(1.0, 0.12, 0.05), emit=(1.0, 0.15, 0.05), emit_strength=4.0),
        'eyeL': material('MO_LarvaEye', color=(0.04, 0.05, 0.09), emit=(0.15, 0.35, 0.9), emit_strength=0.35, rough=0.05, metal=0.3),
    }


ORDER = ['fur', 'wingM', 'wingB', 'horn', 'claw', 'gold', 'bone', 'eyeM', 'eyeB', 'eyeL']


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


def bent(bm, pts, r0, r1, k, segs=5):
    """Gebogenes Horn/Bein aus Kegelstümpfen entlang pts (r0 -> r1), letzter Abschnitt spitz."""
    faces = []
    n = len(pts) - 1
    for i in range(n):
        a, b = V(pts[i]), V(pts[i + 1])
        r = r0 + (r1 - r0) * i / n
        faces += add_cone(bm, a, b - a, r, (b - a).length * (1.0 if i == n - 1 else 1.25), segs)
    set_mat(faces, k)
    return faces


def merge_mesh(bm, me):
    """Metaball-Netz in ein bmesh übernehmen, gibt die neuen Punkte zurück."""
    before = set(bm.verts)
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return [v for v in bm.verts if v not in before]


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


def line_dist(px, py, pts):
    d = np.full(px.shape, 1e9)
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
        d = np.minimum(d, np.hypot(px - (x0 + t * dx), py - (y0 + t * dy)))
    return d


def vnoise(X, Y, scale, seed, octaves=3):
    """Wertrauschen 0..1 (bilinear, weich), für die Flammenflecken."""
    rng = np.random.default_rng(seed)
    out = np.zeros(X.shape)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        g = rng.random((64, 64))
        u, v = X / scale * 2 ** o, Y / scale * 2 ** o
        i, j = np.floor(u).astype(int), np.floor(v).astype(int)
        fu, fv = u - i, v - j
        fu, fv = fu * fu * (3 - 2 * fu), fv * fv * (3 - 2 * fv)
        i0, j0, i1, j1 = i % 64, j % 64, (i + 1) % 64, (j + 1) % 64
        out += amp * ((g[i0, j0] * (1 - fu) + g[i1, j0] * fu) * (1 - fv) + (g[i0, j1] * (1 - fu) + g[i1, j1] * fu) * fv)
        tot += amp; amp *= 0.5
    return out / tot


def wing_image(mothra, n=1024):
    ys, xs = np.mgrid[0:n, 0:n] / n
    X, Y = xs * UV_W, UV_Y0 + (1 - ys) * UV_H            # Bildzeile 0 = oben = großes v
    col = np.zeros((n, n, 3))
    fore, hind = (MO_FORE, MO_HIND) if mothra else (BT_FORE, BT_HIND)
    df, inf = poly_dist(X, Y, fore)
    dh, inh = poly_dist(X, Y, hind)
    BLACK = np.array([0.05, 0.04, 0.035])
    if mothra:
        # Vorderflügel: gelb (innen) -> orange (außen), große schwarze Flammenflecken, schwarzer Außenrand, Augenring
        k = np.clip((np.hypot(X, Y + 10) - 15) / 60, 0, 1)[..., None]
        fcol = np.array([1.0, 0.8, 0.2]) * (1 - k) + np.array([0.98, 0.5, 0.08]) * k
        warp = vnoise(X + 7, Y, 26, 3, 2) * 14
        blot = vnoise(X + warp, Y - warp, 20, 11) > 0.5
        blot |= (np.abs(np.sin((X + warp) * 0.12)) < 0.3) & (X > 22) & (vnoise(X, Y, 30, 5) > 0.4)
        blot &= np.hypot(X, Y + 6) > 12                                                 # heller Ansatz am Körper
        fc = np.where(blot[..., None], BLACK, fcol)
        fc = np.where(((df < 6) & (X > 30))[..., None], BLACK, fc)                     # schwarzer Rand außen
        rr = np.hypot(X - 70, Y + 20) / 11                                             # Augenring („9“) an der Spitze
        fc = np.where((rr < 1.0)[..., None], BLACK, fc)
        fc = np.where(((rr > 0.42) & (rr < 0.72))[..., None], np.array([0.98, 0.42, 0.1]), fc)
        tail = (np.abs(np.hypot(X - 62, Y + 13) - 6) < 1.7) & (Y > -16) & (X < 66)
        fc = np.where(tail[..., None], np.array([0.98, 0.42, 0.1]), fc)
        # Hinterflügel: orange-rot mit schwarzen Bögen und dunklem Rand
        hc = np.zeros_like(col) + np.array([0.97, 0.4, 0.12])
        rh = np.hypot(X - 28, Y - 24)
        arcs = (np.abs(np.sin(rh * 0.2 + vnoise(X, Y, 18, 7, 2) * 2.5)) < 0.3) & (rh > 9)
        hc = np.where(arcs[..., None], BLACK, hc)
        hc = np.where((dh < 3)[..., None], BLACK, hc)
        hc = np.where((np.hypot(X - 6, Y - 9) < 7)[..., None], np.array([0.98, 0.7, 0.3]), hc)   # heller Ansatz
        col = np.where(inf[..., None], fc, hc)
    else:
        # Battra: schwarz, rote Blitze mit gelbem Saum, die vom Gelenk nach außen zucken
        col[:] = np.array([0.06, 0.05, 0.05])
        bolt_d = np.full(X.shape, 1e9)
        def bolt(x, y, ang, L, depth=0):
            nonlocal bolt_d
            pts = [(x, y)]
            while len(pts) < 14 and math.hypot(x, y) < L:
                seg = RNG.uniform(4, 11)
                turn = RNG.uniform(0.25, 1.1) * RNG.choice((-1, 1))
                x += math.cos(ang + turn) * seg; y += math.sin(ang + turn) * seg
                pts.append((x, y))
                if depth == 0 and RNG.random() < 0.3:
                    bolt(x, y, ang + RNG.choice((-0.6, 0.6)), L * 0.85, 1)
            bolt_d = np.minimum(bolt_d, line_dist(X, Y, pts))
        for a0, y0, L in ((-24, -6, 96), (-10, -1, 86), (6, 5, 70), (30, 10, 62), (52, 14, 52)):
            bolt(2.0, y0, math.radians(a0), L)
        wid = 2.6 + 2.6 * vnoise(X, Y, 14, 21, 2)
        col[bolt_d < wid + 1.3] = [1.0, 0.85, 0.2]
        col[bolt_d < wid] = [0.95, 0.18, 0.06]
        col[bolt_d < wid * 0.45] = [1.0, 0.45, 0.08]
        d = np.where(inf, df, dh)
        col[d < 2.2] = [0.16, 0.14, 0.12]                                              # grauer Rand mit Zacken
    return make_image('MO_wing_img' if mothra else 'BT_wing_img', col)


def wing(M, mothra):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    cols = {}
    for poly in ((MO_FORE, MO_HIND) if mothra else (BT_FORE, BT_HIND)):
        vs = [bm.verts.new(V((x, y, 0.5 * math.sin(x * 0.05)))) for x, y in poly]   # leicht gewölbt
        f = bm.faces.new(vs)
        res = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
        set_mat(res['faces'], 'wingM' if mothra else 'wingB')
        for t in res['faces']:
            for loop in t.loops:
                loop[uv].uv = (loop.vert.co.x / UV_W, (loop.vert.co.y - UV_Y0) / UV_H)
        for v in vs:
            cols[v] = V((1, 1, 1))
    if mothra:                                                  # dicke gelbe Pelzkante vorn
        E = []
        chain(E, [(x, y, 0.5 * math.sin(x * 0.05)) for x, y in MO_LEAD], 2.4, 1.3, step=0.5)
        new = merge_mesh(bm, metaball_mesh('MO_lead', E, 1600, res=0.5))
        for v in new:
            v.co += V((noise.noise(v.co * 1.3) * 0.35, 0, noise.noise(v.co * 1.1 + V((5, 0, 0))) * 0.35))
            cols[v] = V((1.0, 0.86, 0.25)) * (0.85 + 0.25 * noise.noise(v.co * 0.8))
            if abs(math.sin(v.co.x * 0.28)) < 0.2:
                cols[v] = V((0.95, 0.45, 0.12))                 # orange Streifen in der Kante
        for f in bm.faces:
            if all(v in new for v in f.verts):
                f.material_index = ORDER.index('fur'); f.smooth = True
    else:                                                       # Battra: dunkle Vorderkante mit kleinen Stacheln
        for i, (x, y) in enumerate(BT_FORE[:5]):
            if i:
                set_mat(add_cone(bm, V((x, y + 0.5, 0.6)), V((0.2, -1, 0.5)), 0.7, 3.5, 4), 'gold')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object('MO_wing' if mothra else 'BT_wing', bm, cols, M)


# ---------------- Körper ----------------
def mothra_body(M):
    E = [ell((0, -8, 0), (9.5, 10, 9)),                      # Brust (pelzig, breit)
         ell((0, -12, 1.5), (10.5, 4.5, 8.5)),               # Pelzkragen
         ell((0, -20.5, 1), (7.5, 7, 7.2)),                  # runder Kopf
         ell((0, 12, -1), (7, 21, 7), (-4, 0, 0))]           # Hinterleib
    for i in range(6):                                        # Ringwülste am Hinterleib
        E.append(ell((0, 1 + i * 6, -1 - i * 0.35), (7.8 - i * 0.65, 2.4, 7.6 - i * 0.65)))
    for sx in (1, -1):                                        # kurze, nach außen gebogene Fühler
        chain(E, [(sx * 2.5, -23, 6.5), (sx * 4, -25, 10), (sx * 6, -26, 12.5), (sx * 8, -25, 12.5), (sx * 8.6, -23.5, 11)],
              1.3, 0.8, step=0.4)
    me = metaball_mesh('MO_body', E, 6000, res=0.6)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    WHITE, ORANGE, BLACK = V((0.93, 0.91, 0.86)), V((0.96, 0.46, 0.12)), V((0.07, 0.06, 0.06))
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        v.co += n * noise.noise(p * 1.1) * 0.55                    # Pelz
        c = WHITE * (0.9 + 0.12 * noise.noise(p * 0.5))
        if -17 < p.y < 0 and abs(math.sin(p.y * 0.62)) < 0.42 and p.z > -4:
            c = ORANGE                                             # Querstreifen auf der Brust
        if abs(p.x) > 5.5 and -10 < p.y < 1 and -3 < p.z < 5:
            c = BLACK                                              # schwarze Flecken unter den Flügeln
        if p.y > 0:
            c = ORANGE if math.sin(p.y * 0.52 + 0.6) > 0.15 else WHITE * 0.95
            if p.z < -5:
                c = c * 0.85
        if p.y < -25 and p.z < 1.5 and abs(p.x) < 4.5:
            c = BLACK                                              # schwarze Schnauze
        if p.y < -18 and p.z > 5 and abs(p.x) < 3.5:
            c = ORANGE * 0.9                                       # orange Stirn zwischen den Fühlern
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    bm.normal_update()
    for sx in (1, -1):
        r = bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
        for v in r['verts']:
            v.co = V((v.co.x * 3.3, v.co.y * 4.0, v.co.z * 4.2)) + V((sx * 5.6, -22.5, 2.4))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eyeM')
        for k in range(3):                                         # Beine nach vorn unter den Körper, gelbe Krallen
            b0 = V((sx * 5.5, -14 + k * 5, -5))
            knee = b0 + V((sx * 3, -2, -6))
            foot = knee + V((-sx * 1.5, -6 + k, -3))
            bent(bm, [b0, knee, foot], 1.4, 1.0, 'bone')
            for c in (-1, 0, 1):
                set_mat(add_cone(bm, foot, V((c * 0.5, -0.8, -0.6)), 0.6, 3.6, 4), 'claw')
    return to_object('MO_body', bm, cols, M)


def battra_body(M):
    E = [ell((0, -8, 0), (8.5, 10, 8.5)),                     # Brustpanzer
         ell((0, -21, 1), (5.5, 5, 5)),                       # Hals/Nacken
         ell((0, -25, 0.5), (5, 5.5, 4.5)),                   # Kopf
         ell((0, -30, -1.5), (3.6, 3.5, 2.8))]                # Schnauze/Kiefer
    E += [
         ell((0, 12, -1.5), (6.5, 20, 6.5), (-6, 0, 0))]      # Hinterleib
    for i in range(7):
        E.append(ell((0, 0 + i * 5.2, -1 - i * 0.5), (7.4 - i * 0.6, 2.2, 7.2 - i * 0.6)))
    for sx in (1, -1):                                        # Schultern und Krallenarme (nach vorn gestreckt)
        E.append(ell((sx * 7, -11, 1), (4, 5, 4)))
        chain(E, [(sx * 8, -12, -2), (sx * 13, -18, -8), (sx * 11, -27, -10)], 2.6, 1.8, step=0.5)
    me = metaball_mesh('BT_body', E, 6000, res=0.6)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        vor = noise.noise(p * 0.55, noise_basis='VORONOI_F2F1')
        v.co += n * vor * 0.8                                      # Panzerplatten
        c = V((0.07, 0.07, 0.08)) * (0.8 + 0.4 * noise.noise(p * 0.3))
        if vor < -0.97:
            c = V((0.25, 0.22, 0.18))                              # helle Plattenränder
        if p.y > 2 and abs(p.x) > 3.5 and math.sin(p.y * 0.6) > 0.55:
            c = V((0.8, 0.1, 0.06))                                # rote Flecken am Hinterleib
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    bm.normal_update()
    # Hornkrone: Mittelhorn nach vorn oben, zwei geschwungene Seitenhörner, dahinter rote Zacken
    bent(bm, [(0, -26, 4.5), (0, -30, 9), (0, -31, 15)], 1.7, 1.1, 'gold')
    for sx in (1, -1):
        bent(bm, [(sx * 3, -25, 4.5), (sx * 7, -27, 8), (sx * 9.5, -26, 12)], 1.3, 0.9, 'gold')
        bent(bm, [(sx * 4.5, -21, 5), (sx * 8.5, -20, 7), (sx * 11, -18, 7.5)], 1.0, 0.7, 'gold')
        for k in range(3):
            set_mat(add_cone(bm, V((sx * (2 + k * 1.5), -16 + k * 2, 6.5)), V((sx * 0.3, 0.5, 1)), 1.0, 4.5, 4), 'horn')
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)    # schräge rote Augen
        for v in r['verts']:
            v.co = V((v.co.x * 1.1, v.co.y * 2.0, v.co.z * 0.9)) + V((sx * 3.8, -28.5, 1.6))
            v.co.z += (v.co.y + 28.5) * -0.35
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eyeB')
        for k in range(3):                                          # Fangzähne
            set_mat(add_cone(bm, V((sx * (0.8 + k * 1.1), -32.5 + k * 0.9, -3)), V((0, -0.3, -1)), 0.45, 3.0 - k * 0.6, 4), 'bone')
        for c in (-1, 0, 1):                                        # Klauen an den Armen
            set_mat(add_cone(bm, V((sx * 11, -28, -10)), V((c * 0.5, -0.9, -0.5)), 0.7, 5, 4), 'bone')
        for k in range(2):                                          # hintere Beine
            b0 = V((sx * 6, -4 + k * 5, -6))
            bent(bm, [b0, b0 + V((sx * 4, -1, -6)), b0 + V((sx * 2, 4, -11))], 1.2, 0.8, 'horn')
        set_mat(add_cone(bm, V((sx * 7.5, -12, 4)), V((sx * 0.8, 0.3, 0.7)), 1.2, 5, 4), 'horn')   # Schulterstachel
        bent(bm, [(sx * 1.5, 31, -5), (sx * 4, 36, -6), (sx * 2.5, 40, -6)], 1.0, 0.6, 'bone')     # Zangen am Ende
    for k in range(6):                                              # Rückenstacheln
        set_mat(add_cone(bm, V((0, -12 + k * 6, 7.5 - k * 0.6)), V((0, 0.4, 1)), 1.0, 4, 4), 'horn')
    return to_object('BT_body', bm, cols, M)


def larva_head(M):
    """Kopf der Battra-Larve, schaut nach -Y (glTF +Z), Halsansatz bei y=0: schiefergrauer Panzer mit goldenen
    Plattenrändern, langes goldenes Horn, große rote Schlitzaugen, geschwungene Hauer, Kiefer."""
    E = [('b', V((0, 1, 0)), 9.5), ell((0, -6, 1), (9, 8, 8)), ell((0, -13, 0), (6.5, 6, 5.5)),
         ell((0, -18, -2), (4.5, 4, 3.5))]
    me = metaball_mesh('BT_head', E, 3000, res=0.6)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        vor = noise.noise(v.co * 0.45, noise_basis='VORONOI_F2F1')
        v.co += v.normal * vor * 0.7
        c = V((0.16, 0.19, 0.24)) * (0.8 + 0.3 * noise.noise(v.co * 0.2))
        if vor < -0.955 and v.normal.z > -0.2:
            c = V((0.72, 0.55, 0.2))                               # goldene Plattenränder
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    bent(bm, [(0, -10, 6.5), (0, -16, 11), (0, -22, 17), (0, -24, 24)], 2.8, 1.5, 'gold')   # langes Horn
    for k in range(4):                                              # Zackenkamm nach hinten
        set_mat(add_cone(bm, V((0, -4 + k * 3.5, 8.5 - k * 0.8)), V((0, 0.8, 0.6)), 1.4, 5, 4), 'gold')
    for sx in (1, -1):
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        for v in r['verts']:
            v.co = V((v.co.x * 1.6, v.co.y * 3.2, v.co.z * 1.4)) + V((sx * 6.2, -12, 3.5))
            v.co.z += (v.co.y + 12) * -0.25                        # schräg
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'eyeB')
        r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)       # goldene Brauenplatte
        for v in r['verts']:
            v.co = V((v.co.x * 2.2, v.co.y * 4.2, v.co.z * 0.9)) + V((sx * 6.4, -11.5, 5.3))
            v.co.z += (v.co.y + 11.5) * -0.3 + abs(v.co.x - sx * 6.4) * -0.2
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'gold')
        bent(bm, [(sx * 5, -16, -2), (sx * 9, -21, -5), (sx * 11, -27, -3), (sx * 10, -31, 1)], 1.6, 0.8, 'bone')  # Hauer
        set_mat(add_cone(bm, V((sx * 2.5, -21, -3)), V((-sx * 0.5, -1, -0.3)), 1.1, 5, 5), 'bone')   # Kiefer
        for k in range(3):                                          # Seitenstacheln
            set_mat(add_cone(bm, V((sx * 8.5, -4 + k * 4, 1)), V((sx * 1, 0.4, 0.3)), 1.0, 4, 4), 'gold')
    return to_object('BT_head', bm, cols, M)


def mothra_larva_head(M):
    """Kopf der Mothra-Larve nach Filmbildern, schaut nach -Y (glTF +Z), Halsansatz bei y=0: rotbraune, glatte Kuppel
    mit vier tiefen Augenhöhlen (blau schimmernde Augen darin), Rüsselmaul mit kurzen Hornzacken, Stummelbeine mit
    Borsten unten."""
    E = [('b', V((0, 1, 0)), 10.5), ell((0, -4, 1), (10.5, 8.5, 9.5)), ell((0, -10.5, -1.5), (7, 5, 6.5)),
         ell((0, -15, -3), (3.6, 3.2, 3.4))]
    for sx in (1, -1):                                         # vier tiefe Augenhöhlen (negative Ellipsoide)
        E.append(ell((sx * 3.6, -11.5, 3.5), (3.2, 2.6, 3.2), None, True))
        E.append(ell((sx * 7.8, -8, 1.0), (3.0, 2.6, 3.2), None, True))
    E.append(ell((0, -18, -3), (1.8, 2.5, 1.6), None, True))    # Mundöffnung
    me = metaball_mesh('MO_larva', E, 3500, res=0.5)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p = v.co.copy()
        v.co += v.normal * noise.noise(p * 0.35) * 0.35
        c = V((0.5, 0.25, 0.19)) * (0.85 + 0.25 * noise.noise(p * 0.25))
        if abs(math.sin(p.y * 0.9 + p.z * 0.25)) < 0.12 and p.y > -8:
            c = c * 0.65                                           # Hautfalten
        if v.normal.z < -0.5:
            c = c * 0.8
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    bm.normal_update()
    for sx in (1, -1):
        for pos, r in (((sx * 3.5, -9.6, 3.4), 1.1), ((sx * 7.0, -6.4, 1.0), 1.0)):
            res = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=r)
            for v in res['verts']:
                v.co += V(pos)
            set_mat(list({f for v in res['verts'] for f in v.link_faces}), 'eyeL')
        for k in range(3):                                         # Hornzacken um das Maul
            a = math.radians(-50 + k * 50)
            b0 = V((sx * (2 + math.cos(a) * 1.6), -16.5, -3 + math.sin(a) * 2.2))
            bent(bm, [b0, b0 + V((sx * 1.6, -2.6, math.sin(a) * 1.2)), b0 + V((sx * 3.2, -3.8, math.sin(a) * 2.5 + 0.5))], 0.8, 0.3, 'bone')
        for k in range(3):                                         # Stummelbeine mit Borsten
            b0 = V((sx * 5.5, -6 + k * 4.5, -7.5))
            set_mat(add_cone(bm, b0, V((sx * 0.3, -0.2, -1)), 1.4, 4, 5), 'bone')
            for j in range(3):
                set_mat(add_cone(bm, b0 + V((sx * 0.5, j - 1, -2)), V((sx * 0.4, (j - 1) * 0.4, -1)), 0.25, 3.5, 3), 'horn')
    return to_object('MO_larva', bm, cols, M)


def cocoon(M):
    """Seidenkokon der Mothra-Larve: länglich, weiß, mit Seidenfäden, Ursprung unten, liegt entlang Y."""
    E = [ell((0, 0, 14), (16, 30, 14)), ell((0, -16, 12), (11, 12, 11)), ell((0, 18, 11), (10, 12, 10))]
    me = metaball_mesh('MO_cocoon', E, 3000, res=0.8)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p = v.co.copy()
        v.co += v.normal * noise.noise(p * 0.3) * 1.2
        c = V((0.92, 0.9, 0.84)) * (0.85 + 0.15 * noise.noise(p * 0.5))
        if abs(math.sin(p.y * 0.8 + math.atan2(p.x, p.z - 12) * 3)) < 0.15:
            c = V((0.75, 0.72, 0.66))                              # Seidenfäden
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('fur')
    return to_object('MO_cocoon', bm, cols, M)


def build():
    M = mats()
    return [mothra_body(M), wing(M, True), battra_body(M), wing(M, False), larva_head(M), mothra_larva_head(M), cocoon(M)]


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
            w.rotation_euler = (0, sx * math.radians(-25), 0)
    by['BT_head'].location = (0, 0, 12)
    by['MO_larva'].location = (0, -60, 12)
    by['MO_cocoon'].location = (0, 60, 0)
