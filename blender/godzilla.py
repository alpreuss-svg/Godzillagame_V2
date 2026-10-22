"""Heisei-Godzilla (1984er Gestalt): Körper aus Metaballs entlang eines Skelettgraphen,
Hautrelief per Rauschen, Rückenplatten in drei Reihen, eigenes Rig mit Gewichten und Animationen.
Blender-Koordinaten: Z oben, Godzilla schaut nach -Y (wird im glTF zu +Z)."""
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from mathutils.bvhtree import BVHTree
from common import link, material, obj_from_bm

V = Vector

# ---------------- Skelettgraph (Meter) ----------------
P = {
    'pelvis': (0, 3, 31), 'belly': (0, 0, 40), 'chest': (0, -2.5, 50.5), 'shoulder': (0, -4.2, 58.5),
    'neck0': (0, -6.2, 64.5), 'neck1': (0, -8.6, 69.5), 'head0': (0, -10.8, 73.6), 'skull': (0, -14.2, 75.2),
    'snout': (0, -19.6, 74.0), 'jaw0': (0, -12.0, 71.0), 'chin': (0, -18.2, 70.6),
    # Schwanz: Spitze 105 m hinter der Hüfte (zweimal auf Wunsch verlängert)
    't1': (0, 14.5, 27), 't2': (0, 26.3, 21), 't3': (0, 41.8, 14.5), 't4': (0, 57.6, 9.0), 't5': (0, 74.2, 6.2), 't6': (0, 89.7, 4.4), 't7': (0, 105.4, 2.6),
}
for s, sx in (('L', 1), ('R', -1)):
    P['hip' + s] = (8.6 * sx, 3, 30)
    P['knee' + s] = (10.2 * sx, -3.2, 17)
    P['ankle' + s] = (10.4 * sx, 2.6, 5.6)
    P['foot' + s] = (10.6 * sx, -2.6, 2.6)
    P['toe' + s] = (10.8 * sx, -7.6, 1.9)
    P['sh' + s] = (8.8 * sx, -5.2, 57.5)
    P['el' + s] = (12.8 * sx, -8.4, 50.2)
    P['wr' + s] = (12.4 * sx, -14.8, 47.8)
    P['fi' + s] = (12.0 * sx, -18.2, 46.8)

RAD = {
    'pelvis': 10.7, 'belly': 11.7, 'chest': 10.8, 'shoulder': 9.1, 'neck0': 7.6, 'neck1': 6.3, 'head0': 5.3,   # Rumpf ~7 % schlanker
    'skull': 4.9, 'snout': 2.9, 'jaw0': 3.3, 'chin': 1.9,
    # verjüngt sich vorn kräftig, im letzten Drittel nur noch wenig (keine Nadelspitze)
    't1': 9.4, 't2': 8.3, 't3': 7.1, 't4': 6.0, 't5': 5.1, 't6': 4.1, 't7': 2.6,
}
for s in 'LR':
    RAD.update({'hip' + s: 8.1, 'knee' + s: 6.6, 'ankle' + s: 5.0, 'foot' + s: 4.6, 'toe' + s: 3.0,
                'sh' + s: 4.4, 'el' + s: 3.6, 'wr' + s: 2.8, 'fi' + s: 1.9})

EDGES = [('pelvis', 'belly'), ('belly', 'chest'), ('chest', 'shoulder'), ('shoulder', 'neck0'), ('neck0', 'neck1'),
         ('neck1', 'head0'), ('head0', 'skull'), ('skull', 'snout'), ('neck1', 'jaw0'), ('jaw0', 'chin'),
         ('pelvis', 't1'), ('t1', 't2'), ('t2', 't3'), ('t3', 't4'), ('t4', 't5'), ('t5', 't6'), ('t6', 't7')]
for s in 'LR':
    EDGES += [('pelvis', 'hip' + s), ('hip' + s, 'knee' + s), ('knee' + s, 'ankle' + s), ('ankle' + s, 'foot' + s),
              ('foot' + s, 'toe' + s), ('shoulder', 'sh' + s), ('sh' + s, 'el' + s), ('el' + s, 'wr' + s), ('wr' + s, 'fi' + s)]

# ---------------- Knochen: Name, Kopf, Ende, Eltern ----------------
BONES = [('hips', 'pelvis', 'belly', None), ('spine1', 'belly', 'chest', 'hips'), ('spine2', 'chest', 'shoulder', 'spine1'),
         ('neck1', 'shoulder', 'neck0', 'spine2'), ('neck2', 'neck0', 'neck1', 'neck1'), ('head', 'neck1', 'skull', 'neck2'),
         ('jaw', 'jaw0', 'chin', 'head'),
         ('tail1', 'pelvis', 't1', 'hips'), ('tail2', 't1', 't2', 'tail1'), ('tail3', 't2', 't3', 'tail2'), ('tail4', 't3', 't4', 'tail3'),
         ('tail5', 't4', 't5', 'tail4'), ('tail6', 't5', 't6', 'tail5'), ('tail7', 't6', 't7', 'tail6')]
for s in 'LR':
    BONES += [('thigh.' + s, 'hip' + s, 'knee' + s, 'hips'), ('shin.' + s, 'knee' + s, 'ankle' + s, 'thigh.' + s),
              ('foot.' + s, 'ankle' + s, 'toe' + s, 'shin.' + s),
              ('upperarm.' + s, 'sh' + s, 'el' + s, 'spine2'), ('forearm.' + s, 'el' + s, 'wr' + s, 'upperarm.' + s),
              ('hand.' + s, 'wr' + s, 'fi' + s, 'forearm.' + s)]

BODY_SRGB = (0.16, 0.175, 0.165)


def _segdist(pts, a, b):
    ab = b - a
    t = np.clip(((pts - a) @ ab) / max(ab @ ab, 1e-9), 0, 1)
    return np.linalg.norm(pts - (a + t[:, None] * ab), axis=1), t


MB_K = 1.0 / 0.575   # sichtbarer Radius einer einzelnen Metaball-Kugel ~ 0.575 * Radius
HEAD_EDGES = {('neck1', 'head0'), ('head0', 'skull'), ('skull', 'snout'), ('neck1', 'jaw0'), ('jaw0', 'chin')}


def build_body(target_tris=26000):
    """Körper aus Metaballs: Kugelketten entlang der Skelettkanten verschmelzen weich (Muskeln, Übergänge),
    Kopf aus Ellipsoiden, ein negatives Ellipsoid schneidet das Maul auf."""
    mb = bpy.data.metaballs.new('gz_mb')
    mb.resolution = mb.render_resolution = 0.75
    mb.threshold = 0.6
    ob = link(bpy.data.objects.new('gz_mb', mb))

    def ball(co, r):
        e = mb.elements.new(type='BALL'); e.co = co; e.radius = r * MB_K * 0.8; e.stiffness = 2.0

    def ell(co, size, rot=None, neg=False):
        e = mb.elements.new(type='ELLIPSOID'); e.co = co; e.radius = MB_K
        e.size_x, e.size_y, e.size_z = size
        if rot:
            e.rotation = Euler([math.radians(a) for a in rot]).to_quaternion()
        e.use_negative = neg
        e.stiffness = 2.0

    for a, b in EDGES:
        if (a, b) in HEAD_EDGES:
            continue
        pa, pb = V(P[a]), V(P[b])
        ra, rb = RAD[a], RAD[b]
        n = max(2, int((pa - pb).length / (min(ra, rb) * 0.26)) + 1)
        for i in range(n + 1):
            k = i / n
            ball(pa.lerp(pb, k), ra + (rb - ra) * k)
    # Kopf: flacher Schädel, lange Schnauze, schwere Brauen, Kaumuskeln, Unterkiefer
    ell((0, -10.5, 72.6), (5.6, 4.6, 4.8))
    ell((0, -13.8, 75.0), (4.5, 5.2, 3.3), rot=(-6, 0, 0))
    ell((0, -18.0, 74.4), (3.0, 3.6, 2.1), rot=(8, 0, 0))
    for sx in (1, -1):
        ell((sx * 2.7, -15.4, 76.4), (1.3, 2.0, 0.9))
        ell((sx * 3.6, -12.2, 72.6), (2.0, 3.0, 2.4))
    ell((0, -15.8, 71.6), (3.1, 4.4, 1.35), rot=(-4, 0, 0))
    ell((0, -11.8, 71.6), (3.6, 2.6, 1.9))
    # Maulhöhle bis zu den Mundwinkeln, damit der Kiefer sich öffnen kann und Zähne Platz haben
    ell((0, -17.0, 72.85), (3.6, 5.4, 0.85), rot=(-4, 0, 0), neg=True)
    ell((0, -13.6, 72.5), (2.9, 3.0, 0.7), rot=(-4, 0, 0), neg=True)
    # Brust und Oberschenkel kräftiger
    for sx in (1, -1):
        ell((sx * 4.7, -7.3, 51), (4.6, 2.8, 5.3))
        ell((sx * 9.4, 0.5, 24), (7.2, 7.0, 9.2), rot=(-15, 0, 0))
    dg = bpy.context.evaluated_depsgraph_get()
    raw = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    tmp = link(bpy.data.objects.new('gz_tmp', raw))
    tris = sum(len(p.vertices) - 2 for p in raw.polygons)
    if tris > target_tris:
        d = tmp.modifiers.new('dec', 'DECIMATE'); d.ratio = target_tris / tris
    dg = bpy.context.evaluated_depsgraph_get()
    body = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    print('Godzilla-Körper: %d -> %d Dreiecke' % (tris, sum(len(p.vertices) - 2 for p in body.polygons)))
    return body


def skin_detail(bm):
    """Raues, borkiges Heisei-Hautrelief + Farbverlauf in Vertexfarben."""
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        head = p.y < -9 and p.z > 66
        amp = 0.22 if head else 0.42
        if n.y < -0.35 and abs(p.x) < 8 and 28 < p.z < 62:
            amp *= 0.45  # Bauch glatter, gerippt
        bump = noise.noise(p * 0.32, noise_basis='VORONOI_F2F1') * 1.4 + noise.noise(p * 0.9) * 0.35
        ridge = 0.0
        if n.y < -0.35 and abs(p.x) < 8 and 28 < p.z < 62:
            ridge = 0.18 * math.sin(p.z * 1.6)  # Bauchquerfalten
        v.co += n * (bump * amp + ridge)
        # Farbe (sRGB, wird später linearisiert)
        c = V(BODY_SRGB)
        k = 0.85 + 0.3 * noise.noise(p * 0.15 + V((5, 5, 5)))
        if n.z > 0.5 or (n.y > 0.4 and p.z > 20):
            k *= 0.8  # Rücken dunkler
        if n.y < -0.35 and abs(p.x) < 8 and 28 < p.z < 62:
            c = c.lerp(V((0.25, 0.24, 0.2)), 0.55)
        if bump > 0.45:
            k *= 1.15
        cols[v.index] = c * k
    return cols


def mouth_color(bm, cols):
    """Innenseiten von Ober- und Unterkiefer dunkelrot."""
    for v in bm.verts:
        p, n = v.co, v.normal
        if p.y < -11.5 and 69 < p.z < 74.5 and abs(p.x) < 4.5:
            zm = 71.0 + (73.6 - 71.0) * min(1, max(0, (p.y + 12) / -7.6)) * 0.0 + 1.6
            if (p.z > zm and n.z < -0.25) or (p.z < zm and n.z > 0.25):
                cols[v.index] = V((0.24, 0.05, 0.05))


def add_cone(bm, base, direction, r, h, segs=5):
    d = direction.normalized()
    q = d.to_track_quat('Z', 'Y')
    ring = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring.append(bm.verts.new(base + q @ V((math.cos(a) * r, math.sin(a) * r, 0))))
    tip = bm.verts.new(base + d * h)
    for i in range(segs):
        bm.faces.new((ring[i], ring[(i + 1) % segs], tip))
    bm.faces.new(list(reversed(ring)))
    return ring + [tip]


PLATE_OUTLINE = [(-0.55, 0), (-0.5, 0.16), (-0.66, 0.3), (-0.46, 0.36), (-0.5, 0.54), (-0.3, 0.58), (-0.26, 0.78), (-0.08, 0.8), (0.04, 1.0),
                 (0.14, 0.8), (0.34, 0.74), (0.28, 0.56), (0.5, 0.48), (0.4, 0.32), (0.56, 0.22), (0.5, 0)]


def add_plate(bm, base, up, fwd, h, thick):
    """Ahornblattförmige Platte: Umriss in der (fwd, up)-Ebene, Dicke zur Seite."""
    side = fwd.cross(up).normalized()
    top, bot = [], []
    for (u, w) in PLATE_OUTLINE:
        c = base + fwd * (u * h * 0.9) + up * (w * h)
        taper = thick * (1 - 0.75 * w)
        top.append(bm.verts.new(c + side * taper))
        bot.append(bm.verts.new(c - side * taper))
    # Mittelgrat
    ct = bm.verts.new(base + up * (h * 0.45) + side * thick * 1.6)
    cb = bm.verts.new(base + up * (h * 0.45) - side * thick * 1.6)
    n = len(PLATE_OUTLINE)
    for i in range(n - 1):
        bm.faces.new((top[i], top[i + 1], ct))
        bm.faces.new((bot[i + 1], bot[i], cb))
        bm.faces.new((top[i + 1], top[i], bot[i], bot[i + 1]))
    bm.faces.new((top[n - 1], top[0], bot[0], bot[n - 1]))
    bm.faces.new((top[n - 1], top[0], ct))
    bm.faces.new((bot[0], bot[n - 1], cb))
    return top + bot + [ct, cb]


def spine_path():
    chain = ['neck1', 'neck0', 'shoulder', 'chest', 'belly', 'pelvis', 't1', 't2', 't3', 't4', 't5', 't6', 't7']
    pts = [V(P[c]) for c in chain]
    rads = [RAD[c] * 0.84 for c in chain]
    lens = [0]
    for i in range(1, len(pts)):
        lens.append(lens[-1] + (pts[i] - pts[i - 1]).length)
    return chain, pts, rads, lens


def sample_path(s):
    chain, pts, rads, lens = spine_path()
    L = lens[-1] * s
    for i in range(1, len(pts)):
        if L <= lens[i] or i == len(pts) - 1:
            k = (L - lens[i - 1]) / max(lens[i] - lens[i - 1], 1e-6)
            k = min(max(k, 0), 1)
            c = pts[i - 1].lerp(pts[i], k)
            r = rads[i - 1] + (rads[i] - rads[i - 1]) * k
            T = (pts[i] - pts[i - 1]).normalized()
            N = V((0, -T.z, T.y)).normalized()
            return c, r, T, N


def build():
    body_me = build_body()
    bm = bmesh.new(); bm.from_mesh(body_me)
    bpy.data.meshes.remove(body_me)
    bm.normal_update()
    cols = skin_detail(bm)
    mouth_color(bm, cols)
    bm.normal_update()
    nbody = len(bm.verts)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.smooth = True
        f.material_index = 0
    bvh = BVHTree.FromBMesh(bm)

    extra = {}   # vert -> (bone, color)
    def tag(vs, bone, col):
        for v in vs:
            extra[v] = (bone, col)

    ivory = V((0.62, 0.58, 0.48))
    # --- Zähne in der Maulhöhle: senkrechter Strahl von oben durch den Kopf, Höhle = Gaumen (Normale nach
    # unten) direkt gefolgt vom Unterkiefer (Normale nach oben). Zahnlänge richtet sich nach der Höhlenhöhe.
    def cavity(x, y):
        z, prev = 80.0, None
        while True:
            h = bvh.ray_cast(V((x, y, z)), V((0, 0, -1)), z - 66)
            if h[0] is None:
                return None
            if prev is not None and prev[1].z < -0.3 and h[1].z > 0.3 and 71 < h[0].z < 74.5:
                return prev[0], h[0]
            prev, z = h, h[0].z - 0.01

    nt = [0, 0]
    for i in range(8):
        y = -15.3 - i * 0.6
        for sx in (1, -1):
            xo = sx * (2.5 - i * 0.14)
            cav = cavity(xo, y)
            if cav is None:
                continue
            top, bot = cav
            gap = top.z - bot.z
            vs = add_cone(bm, top + V((0, 0, 0.15)), V((0, -0.15, -1)), 0.3, min(0.9 + 0.25 * (i % 2), gap * 0.75), 4)
            tag(vs, 'head', ivory); nt[0] += 1
            if i < 7:
                vs = add_cone(bm, bot - V((0, 0, 0.15)), V((0, -0.15, 1)), 0.26, min(0.75, gap * 0.55), 4)
                tag(vs, 'jaw', ivory); nt[1] += 1
    print('Zähne oben/unten:', *nt)
    # --- Augen (klein, bernsteinfarben, unter schwerem Brauenwulst)
    eye = V((0.55, 0.32, 0.06))
    for sx in (1, -1):
        hit = bvh.ray_cast(V((sx * 12, -15.6, 75.6)), V((-sx, 0, 0)), 15)
        if hit[0] is not None:
            c = hit[0] - V((sx * 0.25, 0, 0))
            vs = []
            for k in range(6):
                a = 2 * math.pi * k / 6
                vs.append(bm.verts.new(c + V((sx * 0.35, math.cos(a) * 0.62, math.sin(a) * 0.42))))
            ctr = bm.verts.new(c + V((sx * 0.55, 0, 0)))
            for k in range(6):
                f = bm.faces.new((vs[k], vs[(k + 1) % 6], ctr) if sx < 0 else (vs[(k + 1) % 6], vs[k], ctr))
            tag(vs + [ctr], 'head', eye)
    # --- Klauen an Händen und Zehen
    for s, sx in (('L', 1), ('R', -1)):
        fi = V(P['fi' + s])
        for k in range(4):
            off = V((sx * (k - 1.5) * 0.9, -1.1, -0.4 - abs(k - 1.5) * 0.2))
            vs = add_cone(bm, fi + off, V((0, -0.6, -1)), 0.35, 1.6, 4)
            tag(vs, 'hand.' + s, ivory)
        toe = V(P['toe' + s])
        for k in range(4):
            dx = (k - 1.5) * 1.9
            o = V((toe.x + dx * sx * -1, toe.y - 2.6 + abs(k - 1.5) * 0.7, 1.0))
            vs = add_cone(bm, o, V((0, -1, -0.25)), 0.6, 1.9, 4)
            tag(vs, 'foot.' + s, ivory)

    # --- Rückenplatten (eigenes Material, leuchten im Spiel)
    plate_verts = []
    chain, pts, rads, lens = spine_path()
    nC = 26
    for i in range(nC):
        s = 0.02 + 0.96 * i / (nC - 1)
        c, r, T, N = sample_path(s)
        prof = math.sin(min(1, s / 0.55) * math.pi * 0.5) * (1 - max(0, s - 0.3) / 0.7 * 0.62)   # Schwanzplatten größer
        h = 2.4 + 11.5 * prof
        up = (N * 0.9 - T * 0.25).normalized()
        base = c + N * (r * 0.96 - 0.4)
        vs = add_plate(bm, base, up, -T, h, 0.16 + 0.05 * h)
        plate_verts.append((vs, s))
    for sx in (1, -1):
        nS = 19
        for i in range(nS):
            s = 0.06 + 0.88 * i / (nS - 1)
            c, r, T, N = sample_path(s)
            prof = math.sin(min(1, s / 0.5) * math.pi * 0.5) * (1 - max(0, s - 0.3) / 0.7 * 0.68)
            h = 1.6 + 6.5 * prof
            side = V((sx, 0, 0))
            dirn = (N * 0.78 + side * 0.5).normalized()
            base = c + dirn * (r * 0.92 - 0.3) + (-T) * (1.2)
            up = (dirn * 0.9 - T * 0.25).normalized()
            vs = add_plate(bm, base, up, -T, h, 0.14 + 0.04 * h)
            plate_verts.append((vs, s))
    for vs, s in plate_verts:
        for v in vs:
            extra[v] = (None, V((0.72, 0.68, 0.58)) * (0.75 + 0.25 * (1 - s)))
    bm.verts.index_update()
    bm.faces.ensure_lookup_table()
    plate_set = set(v for vs, _ in plate_verts for v in vs)
    for f in bm.faces:
        if f.verts[0] in plate_set:
            f.material_index = 1
            f.smooth = False
        elif f.verts[0] in extra:
            f.smooth = False

    # Vertexfarben schreiben
    me = bpy.data.meshes.new('Godzilla')
    bm.to_mesh(me)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    lin = np.zeros((len(me.vertices), 4))
    lin[:, 3] = 1
    vmap = {v.index: v for v in bm.verts}
    for i in range(len(me.vertices)):
        v = vmap[i]
        c = extra[v][1] if v in extra else cols.get(i, V(BODY_SRGB))
        lin[i, :3] = srgb_to_lin_tuple(c)
    ca.data.foreach_set('color', lin.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    body_mat = material('GZ_Body', rough=0.82, vcol=True)
    plate_mat = material('GZ_Plates', color=(0.7, 0.66, 0.56), rough=0.6, vcol=True)
    me.materials.append(body_mat); me.materials.append(plate_mat)
    ob = link(bpy.data.objects.new('Godzilla', me))

    # Knochenzuordnung der Zusatzteile
    fixed = {}
    for v, (bone, _) in extra.items():
        if bone:
            fixed[v.index] = bone
    plate_bone = {}
    for vs, s in plate_verts:
        for v in vs:
            plate_bone[v.index] = s
    bm.free()

    arm = build_armature()
    weight(ob, arm, nbody, fixed, plate_bone)
    ob.parent = arm
    mod = ob.modifiers.new('arm', 'ARMATURE'); mod.object = arm
    import gz_anim
    gz_anim.animate(arm)
    return arm, ob


def srgb_to_lin_tuple(c):
    out = []
    for x in c:
        x = max(0.0, min(1.0, x))
        out.append(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4)
    return out


def build_armature():
    ad = bpy.data.armatures.new('GZ_Rig')
    arm = link(bpy.data.objects.new('GZ_Rig', ad))
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = {}
    for name, a, b, parent in BONES:
        eb = ad.edit_bones.new(name)
        eb.head, eb.tail = V(P[a]), V(P[b])
        d = (eb.tail - eb.head).normalized()
        z = V((1, 0, 0)).cross(d)
        if z.length < 0.2:
            z = V((0, 0, 1))
        eb.align_roll(z.normalized())
        if parent:
            eb.parent = ebs[parent]
            eb.use_connect = (V(P[a]) - ebs[parent].tail).length < 1e-3
        ebs[name] = eb
    bpy.ops.object.mode_set(mode='OBJECT')
    return arm


def weight(ob, arm, nbody, fixed, plate_s):
    me = ob.data
    pts = np.array([v.co[:] for v in me.vertices])
    names = [b[0] for b in BONES]
    segs = {b[0]: (np.array(P[b[1]]), np.array(P[b[2]])) for b in BONES}
    radius = {b[0]: (RAD[b[1]] + RAD[b[2]]) * 0.5 for b in BONES}
    D = np.zeros((len(pts), len(names)))
    for j, n in enumerate(names):
        d, _ = _segdist(pts, *segs[n])
        D[:, j] = np.maximum(d - radius[n] * 0.6, 0.05)
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    BIG = 1e6
    for j, n in enumerate(names):
        mask = np.zeros(len(pts), bool)
        if n.startswith(('thigh', 'shin', 'foot')):
            sgn = 1 if n.endswith('L') else -1
            mask |= (x * sgn < 1.5) | (z > 36)
        if n.startswith(('upperarm', 'forearm', 'hand')):
            sgn = 1 if n.endswith('L') else -1
            mask |= (x * sgn < 6.5) | (z > 61) | (z < 42)
        if n.startswith('tail'):
            mask |= (y < 4) & (z > 20)
        if n in ('head', 'jaw'):
            mask |= (y > -8) | (z < 64)
        D[mask, j] = BIG
    # Kiefer: alles unterhalb der Maullinie gehört dem Kiefer
    jaw_i, head_i = names.index('jaw'), names.index('head')
    dsn, _ = _segdist(pts, np.array(P['skull']), np.array(P['snout']))
    dch, _ = _segdist(pts, np.array(P['jaw0']), np.array(P['chin']))
    headzone = (y < -11.2) & (z > 66)
    jawv = headzone & (dch < dsn)
    D[headzone & ~jawv, jaw_i] = BIG
    D[jawv, head_i] = BIG
    W = 1.0 / D ** 4
    for vg in names:
        ob.vertex_groups.new(name=vg)
    top = np.argsort(-W, axis=1)[:, :3]
    for i in range(len(pts)):
        if i in fixed:
            ob.vertex_groups[fixed[i]].add([i], 1.0, 'REPLACE'); continue
        if i in plate_s:
            s = plate_s[i]
            c, _, _, _ = sample_path(s)
            d = [(np.linalg.norm(np.array(c[:]) - (segs[n][0] + segs[n][1]) / 2), n) for n in names
                 if n.startswith(('tail', 'spine', 'neck', 'hips'))]
            ob.vertex_groups[min(d)[1]].add([i], 1.0, 'REPLACE'); continue
        ws = W[i, top[i]]
        ws = ws / ws.sum()
        for j, w in zip(top[i], ws):
            if w > 0.02:
                ob.vertex_groups[names[j]].add([i], float(w), 'REPLACE')
