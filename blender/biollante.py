"""Biollante (1989) in zwei Stufen, nach Bildern vom Nutzer:
- BI_rose: Rosenform – Stamm aus verdrillten Rankensträngen, der im Wasser steht, hängende Blätter, glühender Saftsack
  vorn am Stamm, oben eine riesige rote Rose mit Zahnkranz in der Mitte.
- BI_beast: Bestienform – zottiger, gedrungener Pflanzenkörper, krokodilartiger Kopf mit offenem Maul, Hauern und
  vielen Zähnen, glühender Kern mit Rankennetz in der Brust, schwere Beinwülste.
- BI_head: Kopf einer Fangranke (Maul mit Zähnen), zeigt nach +Z; die Ranke selbst baut das Spiel als Schlauch mit
  Knochenkette und bewegt sie prozedural.
Blender: Z oben, Biollante schaut nach -Y (im glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Euler, noise
from mathutils.bvhtree import BVHTree
from common import link, material, make_image

V = Vector
MB_K = 1.0 / 0.575
RNG = np.random.default_rng(1989)


def lin(c):
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in (max(0, min(1, y)) for y in c)]


# ---------------- Metaball-Helfer ----------------
def metaball_mesh(name, elems, target_tris, res=1.2):
    """elems: ('b', co, r) Kugel oder ('e', co, size, rot_deg, neg) Ellipsoid."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = mb.render_resolution = res
    mb.threshold = 0.6
    ob = link(bpy.data.objects.new(name, mb))
    for el in elems:
        if el[0] == 'b':
            e = mb.elements.new(type='BALL'); e.co = el[1]; e.radius = el[2] * MB_K * 0.8
        else:
            _, co, size, rot, neg = el
            e = mb.elements.new(type='ELLIPSOID'); e.co = co; e.radius = MB_K
            e.size_x, e.size_y, e.size_z = size
            if rot:
                e.rotation = Euler([math.radians(a) for a in rot]).to_quaternion()
            e.use_negative = neg
        e.stiffness = 2.0
    dg = bpy.context.evaluated_depsgraph_get()
    raw = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    tmp = link(bpy.data.objects.new(name + '_tmp', raw))
    tris = sum(len(p.vertices) - 2 for p in raw.polygons)
    if tris > target_tris:
        d = tmp.modifiers.new('dec', 'DECIMATE'); d.ratio = target_tris / tris
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    print('%s: %d -> %d Dreiecke' % (name, tris, sum(len(p.vertices) - 2 for p in me.polygons)))
    return me


def ell(co, size, rot=None, neg=False):
    return ('e', V(co), size, rot, neg)


def chain(elems, pts, r0, r1, step=0.3):
    """Kugelkette entlang einer Punktliste, Radius r0 -> r1."""
    total = sum((V(pts[i + 1]) - V(pts[i])).length for i in range(len(pts) - 1))
    L = 0.0
    for i in range(len(pts) - 1):
        a, b = V(pts[i]), V(pts[i + 1])
        seg = (b - a).length
        n = max(2, int(seg / (min(r0, r1) * step)) + 1)
        for k in range(n):
            t = (L + seg * k / n) / total
            elems.append(('b', a.lerp(b, k / n), r0 + (r1 - r0) * t))
        L += seg
    elems.append(('b', V(pts[-1]), r1))


# ---------------- Geometrie-Helfer ----------------
def add_cone(bm, base, direction, r, h, segs=5):
    d = direction.normalized()
    q = d.to_track_quat('Z', 'Y')
    ring = [bm.verts.new(base + q @ V((math.cos(2 * math.pi * i / segs) * r, math.sin(2 * math.pi * i / segs) * r, 0)))
            for i in range(segs)]
    tip = bm.verts.new(base + d * h)
    faces = [bm.faces.new((ring[i], ring[(i + 1) % segs], tip)) for i in range(segs)]
    faces.append(bm.faces.new(list(reversed(ring))))
    return faces


def add_grid(bm, fn, nu, nv):
    """Fläche aus fn(u, v) mit u in -1..1, v in 0..1 (Blätter, Blütenblätter)."""
    rows = [[bm.verts.new(fn(-1 + 2 * i / (nu - 1), j / (nv - 1))) for i in range(nu)] for j in range(nv)]
    faces = []
    for j in range(nv - 1):
        for i in range(nu - 1):
            faces.append(bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])))
    return faces


def add_sphere(bm, center, size, segs=16, rings=10, bumps=0.0):
    bm.loops.layers.uv.verify()                       # UV-Ebene nötig, sonst schreibt calc_uvs nichts (Metaball-Körper hat keine)
    r = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0, calc_uvs=True)
    for v in r['verts']:
        d = v.co.copy()
        k = 1 + bumps * noise.noise(d * 2.5)
        v.co = V(center) + V((d.x * size[0] * k, d.y * size[1] * k, d.z * size[2] * k))
    return list({f for v in r['verts'] for f in v.link_faces})


def glow_image(name, base=(1.0, 0.55, 0.12), size=256, cells=26):
    """Glühende Zellen mit dunklem Rankennetz darüber (Kern der Bestie, Saftsack der Rose)."""
    ys, xs = np.mgrid[0:size, 0:size] / size
    pts = RNG.random((cells, 2))
    dx = np.abs(xs[..., None] - pts[None, None, :, 0]); dx = np.minimum(dx, 1 - dx)
    dy = ys[..., None] - pts[None, None, :, 1]
    dist = np.sqrt(dx ** 2 + dy ** 2)
    s = np.sort(dist, axis=-1)
    edge = s[..., 1] - s[..., 0]
    core = np.clip(1 - s[..., 0] * cells ** 0.5 * 1.1, 0, 1)
    line = np.clip(edge * size / 6, 0, 1)
    col = np.zeros((size, size, 3))
    for c in range(3):
        col[..., c] = (base[c] * (0.55 + 0.45 * core)) * line + (0.06, 0.08, 0.04)[c] * (1 - line)
    return make_image(name, col)


# ---------------- Materialien ----------------
def mats():
    glow = glow_image('BI_glow_img')
    return {
        'skin': material('BI_Skin', rough=0.9, vcol=True),
        'glow': material('BI_Glow', rough=0.5, img=glow, emit_img=glow, emit_strength=3.0),
        'petal': material('BI_Petal', color=(0.6, 0.07, 0.07), rough=0.55, emit=(0.5, 0.03, 0.03), emit_strength=0.35),
        'leaf': material('BI_Leaf', color=(0.15, 0.24, 0.12), rough=0.85),
        'mouth': material('BI_Mouth', color=(0.42, 0.07, 0.08), rough=0.6, emit=(0.5, 0.05, 0.05), emit_strength=0.4),
        'teeth': material('BI_Teeth', color=(0.86, 0.8, 0.66), rough=0.5),
        'vine': material('BI_Vine', color=(0.13, 0.17, 0.11), rough=0.85),
    }


ORDER = ['skin', 'glow', 'petal', 'leaf', 'mouth', 'teeth', 'vine']


def finish(name, me_body, extra_fn, M, skin_fn):
    """Körpermesh mit Rauschrelief und Vertexfarben, dann Zusatzgeometrie (Zähne, Blätter ...) per extra_fn(bm)."""
    bm = bmesh.new(); bm.from_mesh(me_body)
    bpy.data.meshes.remove(me_body)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        disp, c = skin_fn(v.co.copy(), v.normal.copy())
        v.co += v.normal * disp
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = 0
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    extra_fn(bm, bvh)
    me = bpy.data.meshes.new(name)
    bm.verts.index_update()
    bm.to_mesh(me)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    arr = np.ones((len(me.vertices), 4))
    for v in bm.verts:
        arr[v.index, :3] = lin(cols.get(v, (0.5, 0.48, 0.4)))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for k in ORDER:
        me.materials.append(M[k])
    return link(bpy.data.objects.new(name, me))


def mat_faces(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('petal', 'leaf', 'glow')


# ---------------- Rosenform ----------------
def rose(M):
    E = []
    # Stamm: sieben verdrillte Stränge um einen Kern, unten breit mit Wurzeln, oben schmal
    prof = [(0, 21), (12, 17), (30, 13.5), (50, 11), (66, 8.5), (80, 6.5)]
    def R(z):
        for (z0, r0), (z1, r1) in zip(prof, prof[1:]):
            if z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return prof[-1][1]
    for s in range(7):
        pts = []
        for z in np.arange(-4, 82, 3.0):
            a = s * 2 * math.pi / 7 + z * 0.035
            r = R(z) * 0.62
            pts.append((math.cos(a) * r, math.sin(a) * r + 1.5, z))
        chain(E, pts, 7.5, 3.4, step=0.45)
    chain(E, [(0, 1.5, -2), (0, 1.5, 40), (0, 0, 84)], 11, 4.5, step=0.5)
    # gebeugter Oberteil (Rücken), die Rose schaut nach vorn
    E.append(ell((0, 4, 66), (10, 9, 9)))
    # Wurzeln, die ins Wasser laufen
    for k in range(9):
        a = k * 2 * math.pi / 9 + 0.3
        d = V((math.cos(a), math.sin(a), 0))
        chain(E, [d * 14 + V((0, 0, 6)), d * 26 + V((0, 0, 1)), d * 36 + V((0, 0, -2))], 5.5, 2.0)
    me = metaball_mesh('BI_rose', E, 14000, res=1.3)

    def skin(p, n):
        bump = noise.noise(p * V((0.25, 0.25, 0.06))) * 1.6 + noise.noise(p * 0.6) * 0.4   # Längsfasern
        k = 0.8 + 0.35 * noise.noise(p * 0.08 + V((3, 3, 3)))
        c = V((0.2, 0.24, 0.14)) * k
        if p.z < 3:
            c = c.lerp(V((0.1, 0.1, 0.08)), 0.6)          # nass
        return bump * 0.9, c

    def extra(bm, bvh):
        # glühender Saftsack vorn am Stamm
        mat_faces(add_sphere(bm, (0, -11.5, 31), (8.5, 4.0, 15), bumps=0.12), 'glow')
        # hängende Blätter unter der Rose, wie ein Kragen
        for k in range(11):
            a = -math.pi / 2 + (k - 5) * 0.5
            out = V((math.cos(a), math.sin(a), 0))
            tan = V((-out.y, out.x, 0))
            base = V((0, 1, 74)) + out * 6.5
            L, W = 26 + 6 * RNG.random(), 12 + 3 * RNG.random()
            droop = 0.55 + 0.25 * RNG.random()
            def leaf(u, v, out=out, tan=tan, base=base, L=L, W=W, droop=droop):
                w = W * 0.5 * math.sin(math.pi * min(1, 0.12 + v)) * u
                return base + out * (v * L * 0.75) + V((0, 0, -1)) * (v * v * L * droop) + tan * w + V((0, 0, 1)) * (-0.12 * W * abs(u)) \
                    + out * (0.1 * W * (1 - u * u) * v)
            mat_faces(add_grid(bm, leaf, 5, 6), 'leaf')
        # Stiel und Kelchblätter
        up = V((0, -math.sin(math.radians(38)), math.cos(math.radians(38))))
        ctr = V((0, -7, 90))
        right = V((1, 0, 0))
        fwd = up.cross(right).normalized()
        for k in range(7):
            a = k * 2 * math.pi / 7
            rd = right * math.cos(a) + fwd * math.sin(a)
            def sepal(u, v, rd=rd):
                return ctr - up * 5 + rd * (4 + v * 15) + up * (-v * v * 7) + rd.cross(up) * (u * 4 * math.sin(math.pi * min(1, v + 0.1)))
            mat_faces(add_grid(bm, sepal, 3, 4), 'leaf')
        # Rose: sechs Ringe runder, stark gewölbter Blütenblätter, innen fast senkrecht, außen offen
        rings = [(5, 4.0, 7, 10, 82), (6, 5.5, 9, 12, 72), (7, 7.5, 10, 13, 60), (8, 9.5, 11, 14, 47), (9, 11.5, 11, 15, 33), (10, 13, 10, 14, 18)]
        for ring, (n, r0, L, W, tilt) in enumerate(rings):
            for k in range(n):
                a = k * 2 * math.pi / n + ring * 0.7
                rd = right * math.cos(a) + fwd * math.sin(a)
                td = up.cross(rd).normalized()
                t = math.radians(tilt)
                def petal(u, v, rd=rd, td=td, r0=r0, L=L, W=W, t=t):
                    # stumpfe, runde Kante; die Lippe rollt nach außen; die Mitte ist nach innen gewölbt
                    w = W * 0.5 * (0.55 + 0.45 * math.sin(math.pi * min(1.0, 0.25 + 0.75 * v))) * (1 - 0.3 * v ** 4) * u
                    curl = 0.3 * L * max(0.0, v - 0.6) ** 2 / 0.16
                    cup = 0.32 * W * (1 - u * u) * math.sin(math.pi * min(1.0, v * 0.9))
                    return ctr + rd * (r0 + v * L * math.cos(t) + curl * 0.5 - cup * math.sin(t)) \
                        + up * (v * L * math.sin(t) - curl * 0.3 + cup * math.cos(t) * 0.4) + td * w
                mat_faces(add_grid(bm, petal, 6, 6), 'petal')
        # Schlund mit Zahnkranz in der Blütenmitte
        rim = [bm.verts.new(ctr + up * 4 + (right * math.cos(a) + fwd * math.sin(a)) * 4.2)
               for a in np.linspace(0, 2 * math.pi, 14, endpoint=False)]
        deep = bm.verts.new(ctr - up * 2)
        mat_faces([bm.faces.new((rim[i], rim[(i + 1) % 14], deep)) for i in range(14)], 'mouth')
        for i in range(14):
            a = i * 2 * math.pi / 14
            rd = right * math.cos(a) + fwd * math.sin(a)
            mat_faces(add_cone(bm, ctr + up * 4.3 + rd * 4.4, -rd * 0.8 + up * 0.5, 0.7, 2.6, 4), 'teeth')

    return finish('BI_rose', me, extra, M, skin)


# ---------------- Bestienform ----------------
def beast(M):
    E = [
        ell((0, 6, 36), (30, 27, 30)),            # Hauptkörper, gedrungen
        ell((0, 10, 14), (38, 34, 16)),           # breite Basis
        ell((0, 14, 56), (22, 20, 18), (15, 0, 0)),   # Buckel
        ell((0, -8, 58), (17, 15, 15)),           # Hals/Schultern
        ell((0, -16, 68), (12, 12, 11)),
        # Kopf: flacher Schädel, lange Krokodilschnauze, offenes Maul
        ell((0, -24, 79), (10.5, 11, 8.5)),
        ell((0, -40, 80.5), (7, 13.5, 4.2), (-6, 0, 0)),
        ell((0, -38, 69), (6.2, 13, 3.0), (24, 0, 0)),
        ell((0, -28, 72), (8, 6, 5)),             # Kiefergelenk
        ell((0, -39, 75.2), (5.6, 14, 3.4), (8, 0, 0), True),   # Maulhöhle
        ell((0, -30, 74.5), (6, 5, 3.0), None, True),
    ]
    for sx in (1, -1):
        E += [ell((sx * 5.5, -27, 85), (3.2, 6, 2.4)),             # Brauenwülste
              ell((sx * 22, -6, 40), (12, 12, 14))]                # Schultermasse
        # Beine als ausladende, zum Boden hin dünner werdende Rankenwülste (wie die Figur)
        chain(E, [(sx * 20, -6, 24), (sx * 36, -18, 12), (sx * 50, -27, 3)], 11, 5.5, step=0.4)
        chain(E, [(sx * 22, 20, 22), (sx * 40, 28, 9), (sx * 54, 36, 2)], 11, 5.5, step=0.4)
    me = metaball_mesh('BI_beast', E, 18000, res=1.25)

    def skin(p, n):
        shag = noise.noise(p * 0.35, noise_basis='VORONOI_F2F1') * 2.2 + noise.noise(p * 0.12) * 1.6
        head = p.y < -20 and p.z > 64
        k = 0.75 + 0.4 * noise.noise(p * 0.07 + V((7, 1, 2)))
        c = V((0.15, 0.19, 0.14)) * k
        if n.z > 0.4:
            c = c.lerp(V((0.22, 0.28, 0.16)), 0.4)            # Moos oben
        if head:
            shag *= 0.35
        return shag, c

    def extra(bm, bvh):
        # glühender Kern mit Rankennetz in der Brust
        mat_faces(add_sphere(bm, (0, -23.5, 40), (10, 5.5, 12), bumps=0.15), 'glow')
        # Zähne in der Maulhöhle: senkrecht von oben durch die Schnauze, Gaumen (Normale unten) über Unterkiefer
        def cavity(x, y):
            z, prev = 100.0, None
            while True:
                h = bvh.ray_cast(V((x, y, z)), V((0, 0, -1)), z - 55)
                if h[0] is None:
                    return None
                if prev is not None and prev[1].z < -0.3 and h[1].z > 0.3:
                    return prev[0], h[0]
                prev, z = h, h[0].z - 0.01
        for i in range(12):
            y = -30 - i * 1.9
            for sx in (1, -1):
                cav = cavity(sx * (4.6 - i * 0.22), y)
                if cav is None:
                    continue
                top, bot = cav
                gap = top.z - bot.z
                mat_faces(add_cone(bm, top + V((0, 0, 0.3)), V((0, -0.2, -1)), 0.7, min(3.2, gap * 0.4) * (1.3 if i % 3 == 0 else 1), 4), 'teeth')
                mat_faces(add_cone(bm, bot - V((0, 0, 0.3)), V((0, -0.2, 1)), 0.65, min(2.8, gap * 0.35), 4), 'teeth')
        # Hauer vorn am Unterkiefer, nach oben gebogen
        for sx in (1, -1):
            mat_faces(add_cone(bm, V((sx * 3.4, -47, 68.5)), V((sx * 0.25, -0.35, 1)), 1.3, 9, 6), 'teeth')
        # Gaumen und Zunge dunkelrot: Flächen in der Maulhöhle
        for f in bm.faces:
            if f.material_index != 0:
                continue
            c = f.calc_center_median()
            if c.y < -27 and 66 < c.z < 80 and abs(c.x) < 5.8:
                nz = f.normal.z
                if (c.z > 75 and nz < -0.2) or (c.z < 75 and nz > 0.2):
                    f.material_index = ORDER.index('mouth')
        # Stacheln und Zotteln auf Rücken und Buckel
        for _ in range(70):
            a = RNG.random() * 2 * math.pi
            el = RNG.random() * 0.9
            d = V((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el) * 0.9 + 0.2, math.sin(el)))
            o = V((0, 8, 40)) + d * 60
            h = bvh.ray_cast(o, (V((0, 8, 40)) - o).normalized(), 70)
            if h[0] is None or h[0].z < 25 or h[0].y < -22:
                continue
            mat_faces(add_cone(bm, h[0] - h[1] * 0.4, h[1] + V((0, 0.5, 0.6)), 1.1, 4 + 3 * RNG.random(), 4), 'vine')

    return finish('BI_beast', me, extra, M, skin)


# ---------------- Rankenkopf ----------------
def vine_head(M):
    E = [('b', V((0, 0, 1)), 3.4), ('b', V((0, 0, 5)), 4.6),
         ell((0, 2.8, 11), (3.3, 1.5, 6.4), (-32, 0, 0)),    # Oberkiefer, weit aufgerissen
         ell((0, -2.6, 10.5), (3.0, 1.3, 5.8), (30, 0, 0)),  # Unterkiefer
         ell((0, 0, 11.5), (2.6, 2.2, 5.5), None, True)]     # Maul
    me = metaball_mesh('BI_head', E, 1600, res=0.5)

    def skin(p, n):
        return noise.noise(p * 0.8) * 0.25, V((0.16, 0.2, 0.13))

    def extra(bm, bvh):
        for f in bm.faces:
            c = f.calc_center_median()
            if c.z > 7.0 and abs(c.y) < 4.5 and f.normal.dot(V((0, -math.copysign(1, c.y), 0))) > 0.3:
                f.material_index = ORDER.index('mouth')
            else:
                f.material_index = ORDER.index('vine')
        for i in range(6):
            t = i / 5
            z = 8 + t * 7.5
            for sx in (1, -1):
                x = sx * 2.3 * (1 - 0.55 * t)
                mat_faces(add_cone(bm, V((x, 1.0 + 3.6 * t, z)), V((0, -1, 0.25)), 0.38, 1.7, 4), 'teeth')
                mat_faces(add_cone(bm, V((x, -1.0 - 3.3 * t, z - 0.3)), V((0, 1, 0.25)), 0.34, 1.4, 4), 'teeth')

    return finish('BI_head', me, extra, M, skin)


def build():
    M = mats()
    objs = [rose(M), beast(M), vine_head(M)]
    return objs


def layout_preview(objs):
    xs = {'BI_rose': -70, 'BI_beast': 60, 'BI_head': 0}
    for o in objs:
        o.location = (xs[o.name], 0, 0 if o.name != 'BI_head' else 20)
