"""1995: Destoroyah in drei Formen. Erste Entwürfe ohne Bildvorlage.
- DE_juvenile: Jungtier – krabbenartig, flacher Panzer, sechs Beine, zwei Scheren, Hornkamm, ~25 m
- DEF_body / DEF_wing: Flugform – schlanker Dämonenkörper mit Hornkopf, Fledermausflügel (links, waagrecht nach +X)
- DE_body / DE_wing: Endform – riesiger roter Dämon auf kräftigen Beinen, Brustpanzer, Kopf mit großem Horn (Laserhorn),
  kleine Arme, große Fledermausflügel; DE_pincer: Schwanzschere (zeigt nach +Z, sitzt auf der Kettenspitze)
Blender: Z oben, vorn = -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from common import link, material
from biollante import metaball_mesh, ell, chain, add_cone, lin

V = Vector
WING_FLY = (5, 3, 4)          # Flügelgelenk Flugform (Blender)
WING_FINAL = (14, 6, 66)      # Flügelgelenk Endform (Blender)
ORDER = ['skin', 'membrane', 'horn', 'eye', 'mouth']


def mats():
    return {
        'skin': material('DE_Skin', rough=0.55, metal=0.25, vcol=True),
        'membrane': material('DE_Membrane', rough=0.6, metal=0.2, vcol=True),
        'horn': material('DE_Horn', color=(0.85, 0.75, 0.55), rough=0.4, metal=0.3),
        'eye': material('DE_Eye', color=(1, 0.85, 0.2), emit=(1, 0.8, 0.2), emit_strength=4),
        'mouth': material('DE_Mouth', color=(0.6, 0.1, 0.25), emit=(0.8, 0.15, 0.4), emit_strength=1.2),
    }


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('skin', 'membrane')


def finish(name, E, tris, M, skin_col, res=0.8, extra=None, origin=(0, 0, 0)):
    me = metaball_mesh(name, E, tris, res=res)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        v.co += n * noise.noise(p * 0.5, noise_basis='VORONOI_F2F1') * 0.5            # Panzerplatten
        c = V(skin_col) * (0.8 + 0.35 * noise.noise(p * 0.12))
        if n.z > 0.5:
            c = c * 0.7                                                                  # Rücken dunkler
        if noise.noise(p * 0.35, noise_basis='VORONOI_F2F1') < 0.08:
            c = c * 0.5                                                                  # Fugen
        cols[v] = c
    for f in bm.faces:
        f.smooth = True
        f.material_index = ORDER.index('skin')
    bm.normal_update()
    if extra:
        extra(bm, cols)
    for v in bm.verts:
        v.co -= V(origin)
    out = bpy.data.meshes.new(name)
    bm.verts.index_update()
    used = sorted({f.material_index for f in bm.faces})
    remap = {old: i for i, old in enumerate(used)}
    for f in bm.faces:
        f.material_index = remap[f.material_index]
    bm.to_mesh(out)
    ca = out.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    arr = np.ones((len(out.vertices), 4))
    for v in bm.verts:
        arr[v.index, :3] = lin(cols.get(v, skin_col))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    out.color_attributes.active_color = ca
    bm.free()
    for i in used:
        out.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, out))


def eyes(bm, pos, r, sx_list=(1, -1)):
    for sx in sx_list:
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=r)
        for v in res['verts']:
            v.co += V((sx * pos[0], pos[1], pos[2]))
        set_mat(list({f for v in res['verts'] for f in v.link_faces}), 'eye')


RED = (0.55, 0.1, 0.08)


def juvenile(M):
    E = [ell((0, 0, 6), (9, 12, 4.5)), ell((0, -10, 7), (6, 5, 4)), ell((0, 9, 5), (6, 6, 3.5))]
    for sx in (1, -1):
        for k in range(3):                                                    # sechs Beine
            chain(E, [(sx * 6, -4 + k * 6, 5), (sx * 13, -5 + k * 7, 8), (sx * 17, -6 + k * 8, 0.5)], 1.6, 0.8)
        chain(E, [(sx * 5, -12, 7), (sx * 9, -19, 8), (sx * 7, -24, 6)], 1.8, 2.4)   # Scherenarme
    def extra(bm, cols):
        eyes(bm, (2.4, -14, 9), 0.9)
        set_mat(add_cone(bm, V((0, -12, 10)), V((0, -0.6, 1)), 1.4, 7, 5), 'horn')
        for sx in (1, -1):
            for d in (1, -1):
                set_mat(add_cone(bm, V((sx * 7, -24, 6)), V((sx * 0.2 * d, -1, d * 0.3)), 1.2, 4.5, 4), 'horn')   # Scheren
        for k in range(4):
            set_mat(add_cone(bm, V((0, -4 + k * 4, 10)), V((0, 0.3, 1)), 0.8, 3, 4), 'horn')
    return finish('DE_juvenile', E, 3000, M, RED, 0.45, extra)


def flyer(M):
    E = [ell((0, 2, 0), (5, 14, 5), (-5, 0, 0)), ell((0, -10, 2), (5.5, 6, 6)), ell((0, 18, -2), (2.5, 9, 2.5), (10, 0, 0))]
    chain(E, [(0, -14, 4), (0, -19, 6)], 3, 2.6)
    E += [ell((0, -23, 6), (3.6, 5, 3.2))]
    def extra(bm, cols):
        eyes(bm, (2.4, -25, 7.5), 0.8)
        set_mat(add_cone(bm, V((0, -24, 9)), V((0, -0.8, 1)), 1.6, 9, 5), 'horn')
        for sx in (1, -1):
            set_mat(add_cone(bm, V((sx * 2.5, -21, 8.5)), V((sx * 0.5, 0.6, 0.8)), 0.9, 5, 4), 'horn')
    return finish('DEF_body', E, 3500, M, RED, 0.55, extra)


def bat_wing(M, name, span, color):
    """Fledermausflügel (links, waagrecht nach +X): Arm, vier Finger, Membran mit gebogtem Hinterrand."""
    bm = bmesh.new(); cols = {}
    k = span / 90
    root, wrist = V((0, 0, 0)), V((34 * k, -6 * k, 0))
    tips = [V((90 * k, -16 * k, 0)), V((86 * k, 10 * k, 0)), V((66 * k, 30 * k, 0)), V((40 * k, 40 * k, 0))]
    body = V((4 * k, 24 * k, 0))
    def rod(a, b, r0, r1):
        d = b - a
        r = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=r0, radius2=r1, depth=d.length,
                                  matrix=Matrix.Translation(a + d / 2) @ d.to_track_quat('Z', 'Y').to_matrix().to_4x4())
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'skin')
        for v in r['verts']:
            cols[v] = V(color) * 0.7
    rod(root, wrist, 2.2 * k, 1.6 * k)
    pts = [wrist] + tips + [body, root]
    for t in tips:
        rod(wrist, t, 1.3 * k, 0.3 * k)
        set_mat(add_cone(bm, t, (t - wrist).normalized(), 0.6 * k, 4 * k, 4), 'horn')
    ring = [wrist] + tips + [body]
    for a, b in zip(ring, ring[1:]):
        mid = (a + b) / 2
        inward = (wrist - mid) * 0.22
        vs = [bm.verts.new(wrist), bm.verts.new(a), bm.verts.new(mid + inward), bm.verts.new(b)]
        set_mat([bm.faces.new((vs[0], vs[1], vs[2])), bm.faces.new((vs[0], vs[2], vs[3]))], 'membrane')
        for v in vs:
            cols[v] = V(color) * (0.6 + 0.4 * (v.co.length / (90 * k)))
    vs = [bm.verts.new(root), bm.verts.new(wrist), bm.verts.new(body)]
    set_mat([bm.faces.new(vs)], 'membrane')
    for v in vs:
        cols[v] = V(color) * 0.6
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
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
        arr[v.index, :3] = lin(cols.get(v, color))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    me.color_attributes.active_color = ca
    bm.free()
    for i in used:
        me.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, me))


def final_form(M):
    E = [ell((0, 2, 44), (14, 11, 18), (8, 0, 0)),            # Rumpf
         ell((0, -4, 60), (15, 11, 10)),                       # Brust und Schultern
         ell((0, 6, 30), (14, 12, 9))]                         # Becken
    for sx in (1, -1):                                          # kräftige Beine mit nach hinten geknicktem Fuß
        chain(E, [(sx * 9, 4, 30), (sx * 13, -4, 18), (sx * 12, 6, 8), (sx * 12, -2, 2)], 8.5, 4.5)
        chain(E, [(sx * 12, -6, 58), (sx * 16, -12, 50), (sx * 14, -18, 46)], 3.4, 2.2)   # kleine Arme
    chain(E, [(0, -8, 66), (0, -12, 72)], 7, 6)                 # Hals
    E += [ell((0, -17, 76), (7.5, 9, 6.5)), ell((0, -26, 74), (5, 7, 4), (8, 0, 0)),     # Kopf, Schnauze
          ell((0, -24, 71.5), (4.6, 7, 1.6), None, True)]                                 # Maul
    def extra(bm, cols):
        eyes(bm, (4.5, -21, 78), 1.3)
        set_mat(add_cone(bm, V((0, -18, 80)), V((0, -0.9, 0.7)), 3.2, 26, 6), 'horn')    # großes Laserhorn
        for sx in (1, -1):
            set_mat(add_cone(bm, V((sx * 5, -14, 80)), V((sx * 0.4, 0.6, 0.8)), 1.6, 9, 5), 'horn')
            for k in range(3):                                                            # Krallen
                set_mat(add_cone(bm, V((sx * 12 + (k - 1) * 2, -8, 1.5)), V(((k - 1) * 0.3, -1, -0.2)), 1.2, 4, 4), 'horn')
                set_mat(add_cone(bm, V((sx * 14 + (k - 1), -21, 45)), V(((k - 1) * 0.2, -1, -0.4)), 0.6, 3, 4), 'horn')
        for k in range(6):                                                                # Rückenstacheln
            set_mat(add_cone(bm, V((0, 10 + k * 1.5, 62 - k * 6)), V((0, 1, 0.7)), 1.6, 6, 4), 'horn')
        for f in bm.faces:                                                                # Maul innen
            c = f.calc_center_median()
            if f.material_index == ORDER.index('skin') and c.y < -20 and 70 < c.z < 73.5 and abs(c.x) < 4.4:
                f.material_index = ORDER.index('mouth')
    return finish('DE_body', E, 14000, M, (0.62, 0.1, 0.09), 1.0, extra)


def pincer(M):
    E = [('b', V((0, 0, 1)), 3.4), ell((0, 0, 5), (3.6, 3, 4))]
    def extra(bm, cols):
        for sx in (1, -1):
            set_mat(add_cone(bm, V((sx * 2.2, 0, 7)), V((-sx * 0.35, 0, 1)), 1.4, 9, 5), 'horn')
    return finish('DE_pincer', E, 900, M, RED, 0.4, extra)


def build():
    M = mats()
    return [juvenile(M), flyer(M), bat_wing(M, 'DEF_wing', 70, (0.5, 0.1, 0.1)), final_form(M),
            bat_wing(M, 'DE_wing', 95, (0.55, 0.12, 0.12)), pincer(M)]


def layout_preview(objs):
    by = {o.name: o for o in objs}
    by['DE_juvenile'].location = (-150, 0, 0)
    by['DEF_body'].location = (-70, 0, 30)
    for sx in (1, -1):
        w = by['DEF_wing'] if sx > 0 else by['DEF_wing'].copy()
        if sx < 0:
            link(w); w.scale = (-1, 1, 1)
        w.location = (-70 + sx * WING_FLY[0], WING_FLY[1], 30 + WING_FLY[2])
    by['DE_body'].location = (60, 0, 0)
    for sx in (1, -1):
        w = by['DE_wing'] if sx > 0 else by['DE_wing'].copy()
        if sx < 0:
            link(w); w.scale = (-1, 1, 1)
        w.location = (60 + sx * WING_FINAL[0], WING_FINAL[1], WING_FINAL[2])
        w.rotation_euler = (0, sx * math.radians(-50), sx * math.radians(-20))
    by['DE_pincer'].location = (140, 0, 0)
