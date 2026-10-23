"""1995: Destoroyah in drei Formen, nach Filmbildern des Nutzers.
- DE_juvenile: Jungtier (Aggregat) – krabben-/skorpionartig, sechs spitze Beine, zwei lange Sichelscheren nach oben
  gebogen, Kopf mit Stachelkrone und Kieferzangen, beiger Borstenfleck auf der Brust, dunkelrot-schwarz, ~25 m
- DEF_body / DEF_wing: Flugform – schlanker Dämonenkörper mit Hornkopf, Fledermausflügel (links, waagrecht nach +X)
- DE_body / DE_wing: Endform – kräftig rot mit schwarzbraunen, rauen Panzerflecken, leuchtende orange Brustblüte,
  Kopf mit Kragen aus nach hinten gebogenen Stacheln, langes gelb-oranges Laserhorn, gelbe Augen, rote Schulterhörner,
  große helle Krallen an Füßen und Knien, Fledermausflügel rot mit dunklen Fingerknochen;
  DE_pincer: Schwanzschere (zeigt nach +Z, sitzt auf der Kettenspitze)
Blender: Z oben, vorn = -Y (glTF +Z)."""
import bpy, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, Euler, noise
from common import link, material
from biollante import metaball_mesh, ell, chain, add_cone, lin, horn_tube

V = Vector
WING_FLY = (5, 3, 4)          # Flügelgelenk Flugform (Blender)
WING_FINAL = (14, 6, 66)      # Flügelgelenk Endform (Blender)
ORDER = ['skin', 'membrane', 'horn', 'eye', 'mouth', 'claw', 'laser', 'flower', 'spike']
RED, DARK = V((0.78, 0.1, 0.08)), V((0.16, 0.07, 0.06))


def mats():
    return {
        'skin': material('DE_Skin', rough=0.5, metal=0.2, vcol=True),
        'membrane': material('DE_Membrane', rough=0.5, metal=0.1, vcol=True),
        'horn': material('DE_Horn', color=(0.55, 0.08, 0.07), rough=0.4, metal=0.3),
        'spike': material('DE_Spike', color=(0.75, 0.1, 0.08), rough=0.35, metal=0.3),
        'claw': material('DE_Claw', color=(0.88, 0.82, 0.68), rough=0.45),
        'laser': material('DE_Laser', color=(1.0, 0.72, 0.2), emit=(1.0, 0.55, 0.1), emit_strength=0.8, rough=0.3),
        'eye': material('DE_Eye', color=(1, 0.8, 0.15), emit=(1, 0.75, 0.15), emit_strength=4),
        'mouth': material('DE_Mouth', color=(0.6, 0.1, 0.25), emit=(0.8, 0.15, 0.4), emit_strength=1.2),
        'flower': material('DE_Flower', color=(1.0, 0.55, 0.15), emit=(1.0, 0.5, 0.1), emit_strength=1.6),
    }


def set_mat(faces, k):
    for f in faces:
        f.material_index = ORDER.index(k)
        f.smooth = k in ('skin', 'membrane')


def bent(bm, pts, r0, r1, k, segs=6):
    """Gebogenes Horn/Bein als durchgehender Kegelstumpf entlang pts (r0 -> r1), spitz am Ende; k: Material oder Liste je Abschnitt."""
    parts = horn_tube(bm, pts, r0, r1, segs)
    faces = []
    for i, fs in enumerate(parts):
        set_mat(fs, k[i] if isinstance(k, (list, tuple)) else k)
        faces += fs
    return faces


def skin_color(p, n, dark_k=1.0):
    """Rote Schuppen mit dunklen Fugen; schwarzbraune raue Panzer an Schultern, Oberschenkeln und Armen."""
    cell = noise.noise(p * 0.45, noise_basis='VORONOI_F1')                    # Schuppenzelle
    c = RED * (0.75 + 0.25 * cell + 0.15 * noise.noise(p * 0.12))
    armor = (abs(p.x) > 11 and (p.z > 52 or 10 < p.z < 32)) or abs(p.x) > 16
    if armor and noise.noise(p * 0.09 + V((3, 1, 7))) > -0.25 * dark_k:
        c = DARK * (0.8 + 0.5 * noise.noise(p * 0.6))
    if noise.noise(p * 0.45, noise_basis='VORONOI_F2F1') < -0.93:
        c = c * 0.4                                                          # Schuppenfugen
    return c


def finish(name, E, tris, M, res=0.8, extra=None, origin=(0, 0, 0), color=skin_color):
    me = metaball_mesh(name, E, tris, res=res)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.normal_update()
    cols = {}
    for v in bm.verts:
        p, n = v.co.copy(), v.normal.copy()
        v.co += n * (noise.noise(p * 0.45, noise_basis='VORONOI_F2F1') + 0.9) * 0.5    # gewölbte Schuppen
        cols[v] = color(p, n)
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
        arr[v.index, :3] = lin(cols.get(v, RED))
    ca.data.foreach_set('color', arr.astype(np.float32).ravel())
    out.color_attributes.active_color = ca
    bm.free()
    for i in used:
        out.materials.append(M[ORDER[i]])
    return link(bpy.data.objects.new(name, out))


def eyes(bm, pos, r, slant=0.3):
    for sx in (1, -1):
        res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=1.0)
        for v in res['verts']:
            v.co = V((v.co.x * r * 1.2, v.co.y * r * 1.6, v.co.z * r * 0.8))
            v.co.z += v.co.x * sx * slant
            v.co += V((sx * pos[0], pos[1], pos[2]))
        set_mat(list({f for v in res['verts'] for f in v.link_faces}), 'eye')


def demon_head(bm, c, s, horn_len):
    """Destoroyahs Kopf (Zusatzteile): Laserhorn, Stachelkragen nach hinten, Augen, Zähne. c = Kopfmitte, s = Maßstab."""
    c = V(c)
    tip = c + V((0, -9, 3)) * s
    bent(bm, [tip, tip + V((0, -0.7, 0.55)) * horn_len * 0.5, tip + V((0, -0.55, 0.85)) * horn_len], 3.0 * s, 1.2 * s, 'laser', 6)
    eyes(bm, (c.x + 4.2 * s, c.y - 5 * s, c.z + 2 * s), 1.2 * s)
    for i in range(7):                                                # Kragen aus großen, nach hinten gebogenen Stacheln
        a = math.radians(-75 + i * 25)
        base = c + V((math.sin(a) * 6.5, 2 + abs(math.sin(a)) * 1.5, 3 + math.cos(a) * 2.5)) * s
        out = V((math.sin(a) * 0.9, 0.9, 0.5 + math.cos(a) * 0.6)).normalized()
        L = (12 - abs(i - 3) * 1.2) * s
        bent(bm, [base, base + out * L * 0.55 + V((0, 0, 1.5 * s)), base + out * L + V((0, 2 * s, -1 * s))], 2.0 * s, 1.0 * s, 'spike')
    for sx in (1, -1):                                                # zwei vordere Seitenfinnen
        b = c + V((sx * 5, -3, 3)) * s
        bent(bm, [b, b + V((sx * 4, -2, 5)) * s, b + V((sx * 5, 1, 9)) * s], 1.5 * s, 0.8 * s, 'spike')
        for k in range(4):                                            # Zähne
            set_mat(add_cone(bm, c + V((sx * (1.2 + k * 0.9), -12 + k * 1.6, -2.3)) * s, V((0, 0, -1)), 0.45 * s, 1.8 * s, 4), 'claw')
        set_mat(add_cone(bm, c + V((sx * 3.5, -9, -2.5)) * s, V((sx * 0.3, -0.5, -1)), 0.8 * s, 3.5 * s, 4), 'claw')   # Hauer


def juvenile(M):
    E = [ell((0, 2, 7), (9.5, 11, 3.6)), ell((0, -9, 8), (7, 5.5, 3.6)), ell((0, 11, 6), (6.5, 6.5, 3)),
         ell((0, -14, 9), (4.5, 4.2, 3.4))]
    for k in range(4):                                                        # Panzerwülste quer über dem Rücken
        E.append(ell((0, -5 + k * 5, 9.8), (8.5 - k * 0.8, 1.6, 1.4)))
    for sx in (1, -1):
        for k in range(3):                                                    # sechs spitze Beine
            chain(E, [(sx * 6, -2 + k * 6, 6), (sx * 13, -3 + k * 7, 12), (sx * 18, -4 + k * 8, 1)], 1.6, 0.9)
        chain(E, [(sx * 5, -11, 8), (sx * 11, -15, 16), (sx * 13, -14, 25)], 3.0, 2.5)   # kräftige Scherenarme nach oben

    def color(p, n):
        c = V((0.42, 0.05, 0.04)) * (0.8 + 0.3 * noise.noise(p * 0.3)) if n.z > 0.2 else DARK * 0.8
        if noise.noise(p * 0.18) > 0.0:
            c = DARK * 0.9                                                    # dunkelrot-schwarz
        if noise.noise(p * 0.45, noise_basis='VORONOI_F2F1') < -0.93:
            c = c * 0.5
        if -13 < p.y < -3 and n.z > 0.3 and abs(p.x) < 5:
            c = V((0.68, 0.56, 0.38)) * (0.85 + 0.3 * noise.noise(p * 1.5))  # beiger Borstenfleck
        return c

    def extra(bm, cols):
        eyes(bm, (2.2, -16.5, 11), 0.8)
        for sx in (1, -1):
            bent(bm, [(sx * 13, -14, 25), (sx * 14.5, -19, 30), (sx * 12.5, -26, 29.5), (sx * 10, -29, 24)], 2.8, 0.9, 'spike')   # dicke Sichelscheren
            set_mat(add_cone(bm, V((sx * 13, -14, 24)), V((sx * 0.3, -1, -0.6)), 1.4, 7, 4), 'spike')
            bent(bm, [(sx * 2.2, -17, 7.5), (sx * 4.5, -21, 6.5), (sx * 2.5, -25, 6)], 1.3, 0.5, 'claw')   # große Kieferzangen
            for k in range(3):                                               # Beinspitzen
                set_mat(add_cone(bm, V((sx * 18, -4 + k * 8, 1.5)), V((sx * 0.3, 0, -1)), 0.8, 3, 4), 'spike')
        for k in range(7):                                                   # große Stachelkrone
            a = math.radians(-75 + k * 25)
            set_mat(add_cone(bm, V((math.sin(a) * 3.6, -13, 11.5)), V((math.sin(a) * 0.6, 0.35, 1)), 1.3, 7.5 - abs(k - 3) * 0.8, 4), 'spike')
        for k in range(5):                                                   # Rückenstacheln
            set_mat(add_cone(bm, V((0, -4 + k * 4.5, 10.8)), V((0, 0.3, 1)), 0.9, 3.5, 4), 'spike')
    return finish('DE_juvenile', E, 3500, M, 0.45, extra, color=color)


def flyer(M):
    E = [ell((0, 2, 0), (8, 15, 7.5), (-5, 0, 0)), ell((0, -10, 2), (8.5, 7.5, 8)), ell((0, 19, -2), (3.5, 10, 3.2), (10, 0, 0))]
    chain(E, [(0, -15, 4), (0, -21, 6.5)], 4.4, 3.8)
    E += [ell((0, -26, 7), (5.2, 6.5, 4.6))]
    for sx in (1, -1):                                                        # Beine unter dem Körper
        chain(E, [(sx * 5, 4, -4), (sx * 7, 2, -10), (sx * 6, -2, -14)], 2.8, 2.0)

    def extra(bm, cols):
        demon_head(bm, (0, -26, 7), 0.72, 13)
        for sx in (1, -1):
            for k in range(3):                                                # helle Fußkrallen
                bent(bm, [(sx * 6 + (k - 1) * 1.5, -2, -14), (sx * 6 + (k - 1) * 2, -6, -15), (sx * 6 + (k - 1) * 2.2, -8, -13)], 1.1, 0.4, 'claw')
        r = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=6, radius=1.0)   # kleine Brustblüte
        for v in r['verts']:
            v.co = V((v.co.x * 3.6, v.co.y * 1.2, v.co.z * 3.6)) + V((0, -16.5, -1))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'flower')
    return finish('DEF_body', E, 3500, M, 0.55, extra)


def bat_wing(M, name, span, color):
    """Fledermausflügel (links, waagrecht nach +X): Arm, vier dunkle Fingerknochen, rote Membran mit Rippen und
    gebogtem Hinterrand."""
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
            cols[v] = DARK
    rod(root, wrist, 2.4 * k, 1.8 * k)
    for t in tips:
        rod(wrist, t, 1.4 * k, 0.35 * k)
        set_mat(add_cone(bm, t, (t - wrist).normalized(), 0.7 * k, 5 * k, 4), 'spike')
    set_mat(add_cone(bm, wrist, V((0.2, -1, 0.4)), 1.2 * k, 6 * k, 4), 'spike')      # Daumenkralle
    ring = [wrist] + tips + [body]
    for a, b in zip(ring, ring[1:]):                                # Membranfelder, in Streifen geteilt (Rippen)
        mid = (a + b) / 2
        inward = (wrist - mid) * 0.22
        edge = [a.lerp(mid + inward, t / 3) for t in range(3)] + [(mid + inward).lerp(b, t / 3) for t in range(4)]
        c0 = bm.verts.new(wrist); cols[c0] = V(color) * 0.55
        prev = None
        for i, e in enumerate(edge):
            ve = bm.verts.new(e)
            cols[ve] = V(color) * (1.1 if i % 2 else 0.55)         # kräftige helle und dunkle Rippen
            if i in (0, len(edge) - 1) or (i % 3 == 0):
                cols[ve] = V(color) * 0.35                          # dunkler Hinterrand
            if prev:
                set_mat([bm.faces.new((c0, prev, ve))], 'membrane')
            prev = ve
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
    E = [ell((0, 2, 44), (16, 12.5, 19), (8, 0, 0)),          # wuchtiger Rumpf
         ell((0, -4, 58), (18.5, 13, 12)),                     # breite Brust und Schultern
         ell((0, 6, 30), (16.5, 13.5, 10))]                    # Becken
    for sx in (1, -1):                                          # kräftige Beine mit nach hinten geknicktem Fuß
        chain(E, [(sx * 9, 4, 30), (sx * 13, -4, 18), (sx * 12, 6, 8), (sx * 12, -2, 2)], 9, 5)
        E.append(ell((sx * 13, -2, 4), (6.5, 8, 3.5)))         # breiter Fuß
        chain(E, [(sx * 14, -6, 57), (sx * 21, -14, 50), (sx * 18, -24, 45)], 5.2, 3.8)   # kräftige Arme
        E.append(ell((sx * 18, -25, 45), (3.8, 3.5, 3.4)))     # Hand
        E.append(ell((sx * 17, -6, 64), (7.5, 8, 6.5)))        # Schulterwulst
    chain(E, [(0, -8, 65), (0, -12, 71)], 7.5, 6.5)             # Hals
    E += [ell((0, -17, 76), (7.5, 9, 6.5)), ell((0, -26, 74), (5, 7, 4), (8, 0, 0)),     # Kopf, Schnauze
          ell((0, -24, 71.5), (4.6, 7, 1.6), None, True)]                                 # Maul

    def extra(bm, cols):
        demon_head(bm, (0, -18, 76), 1.0, 20)
        # leuchtende Brustblüte: Scheibe mit acht dunklen Blütenrippen
        FC = V((0, -16.5, 52))                                                       # Blütenmitte (vor der Brust)
        rot = Matrix.Rotation(math.radians(-12), 3, 'X')
        r = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)   # Blütenmitte
        for v in r['verts']:
            v.co = rot @ V((v.co.x * 2.4, v.co.y * 1.6, v.co.z * 2.4)) + FC + V((0, -1, 0))
        set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'flower')
        for i in range(8):                                                           # acht gewölbte Blütenblätter
            a = i * math.pi / 4 + math.pi / 8
            r = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=1.0)
            for v in r['verts']:
                lc = V((v.co.x * 1.9, v.co.y * 1.2, v.co.z * 4.2 + 4.6))              # Blatt nach außen gestreckt
                lc.y -= 0.12 * lc.z                                                  # leicht nach vorn gewölbt
                v.co = rot @ (Matrix.Rotation(a, 3, 'Y') @ lc) + FC
            set_mat(list({f for v in r['verts'] for f in v.link_faces}), 'flower')
        for i in range(8):                                                           # dunkle Rippen zwischen den Blättern
            a = i * math.pi / 4
            d = rot @ V((math.sin(a), 0, math.cos(a)))
            set_mat(add_cone(bm, FC + d * 1.5 + V((0, 0.6, 0)), d, 0.7, 8.5, 3), 'horn')
        for sx in (1, -1):
            for k, (yy, zz, L) in enumerate(((-5, 68, 17), (2, 64, 13), (7, 60, 9))):   # große rote Schulterhornplatten
                b = V((sx * 19, yy, zz))
                bent(bm, [b, b + V((sx * 0.6, -0.2, 0.8)) * L * 0.6, b + V((sx * 0.9, 0.3, 0.7)) * L], 4.2, 1.6, 'spike', 4)
            for k in range(4):                                                       # große helle Fußkrallen
                bent(bm, [(sx * 13 + (k - 1.5) * 3.2, -8, 3.5), (sx * 13 + (k - 1.5) * 3.8, -13, 3), (sx * 13 + (k - 1.5) * 4, -16, 0.5)], 2.4, 0.8, 'claw')
            for k in range(3):                                                       # Knie- und Fersenkrallen
                set_mat(add_cone(bm, V((sx * (15 + k * 1.5), -9 + k * 2, 18 + k * 2)), V((sx * 0.4, -1, 0.2)), 2.4, 8.5, 5), 'claw')
                set_mat(add_cone(bm, V((sx * 12.5, 9 + k, 9 + k * 2)), V((sx * 0.2, 1, -0.2)), 1.3, 4.5, 4), 'claw')
            for k in range(4):                                                       # große Handkrallen
                bent(bm, [(sx * 18 + (k - 1.5) * 1.8, -27, 45), (sx * 18 + (k - 1.5) * 2.2, -31, 44), (sx * 18 + (k - 1.5) * 2.4, -33, 41)], 1.2, 0.4, 'claw')
            for k in range(3):                                                       # Armstacheln
                set_mat(add_cone(bm, V((sx * 23, -12 + k * 3.5, 51 + k * 2)), V((sx * 1, 0.4, 0.4)), 1.4, 6, 4), 'spike')
        for k in range(7):                                                           # Rückenstacheln
            set_mat(add_cone(bm, V((0, 11 + k * 1.2, 64 - k * 5.5)), V((0, 1, 0.7)), 1.8, 7, 4), 'spike')
        for f in bm.faces:                                                           # Maul innen
            c = f.calc_center_median()
            if f.material_index == ORDER.index('skin') and c.y < -20 and 70 < c.z < 73.5 and abs(c.x) < 4.4:
                f.material_index = ORDER.index('mouth')
    return finish('DE_body', E, 15000, M, 1.0, extra)


def pincer(M):
    """Schwanzschere: zwei sichelförmige, nach innen gebogene Zangen (wie ein Halbmond)."""
    E = [('b', V((0, 0, 1)), 3.6), ell((0, 0, 5), (4.2, 3, 3.5))]

    def extra(bm, cols):
        for sx in (1, -1):
            bent(bm, [(sx * 2.5, 0, 6), (sx * 6, 0, 9), (sx * 6.5, 0, 14), (sx * 3.5, 0, 17)], 1.6, 0.5, 'spike')
    return finish('DE_pincer', E, 900, M, 0.4, extra)


def build():
    M = mats()
    return [juvenile(M), flyer(M), bat_wing(M, 'DEF_wing', 70, (0.62, 0.07, 0.05)), final_form(M),
            bat_wing(M, 'DE_wing', 95, (0.66, 0.08, 0.06)), pincer(M)]


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
