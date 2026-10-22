"""Godzillas Animationen als einzelne Actions (glTF: je eine Animation).
Knochenachsen: lokales X = Welt-X (Nicken/Beugen), Y = Knochenachse (Drehen), Z = seitlich.
Positives X neigt eine nach hinten zeigende Kette nach oben, eine nach vorn zeigende nach unten."""
import bpy, math

S, C, PI = math.sin, math.cos, math.pi
FPS = 30


def clamp01(x):
    return max(0.0, min(1.0, x))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def env(t, a, b, c, d):
    """0 bis a, rampe bis b, halten bis c, abklingen bis d."""
    if t < a or t > d:
        return 0.0
    if t < b:
        return ease((t - a) / (b - a))
    if t < c:
        return 1.0
    return 1 - ease((t - c) / (d - c))


def tail(p, amp_z, amp_x=0.0, lag=0.55, base_x=0.0):
    out = {}
    for i in range(1, 8):
        k = 0.4 + 0.25 * i
        out['tail%d' % i] = (base_x + amp_x * S(p - i * lag) * 0.5, 0, amp_z * k * S(p - i * lag))
    return out


# ---------------- Beine per inverser Kinematik (Seitenebene Y/Z, Drehachse Welt-X) ----------------
# Winkel einer Richtung (dy, dz): 0 = senkrecht nach unten, positiv = nach hinten (+Y). Eine Drehung um +X
# erhöht diesen Winkel; Kinder erben die Drehung der Eltern, die Winkel addieren sich also entlang der Kette.
HIP, KNEE, ANKLE, TOE = (3.0, 30.0), (-3.2, 17.0), (2.6, 5.6), (-7.6, 1.9)   # wie godzilla.P (y, z)


def _ang(dy, dz):
    return math.atan2(dy, -dz)


L1 = math.hypot(KNEE[0] - HIP[0], KNEE[1] - HIP[1])
L2 = math.hypot(ANKLE[0] - KNEE[0], ANKLE[1] - KNEE[1])
A_T0 = _ang(KNEE[0] - HIP[0], KNEE[1] - HIP[1])
A_S0 = _ang(ANKLE[0] - KNEE[0], ANKLE[1] - KNEE[1])
A_F0 = _ang(TOE[0] - ANKLE[0], TOE[1] - ANKLE[1])


def leg_ik(hip, ankle, foot_pitch=0.0):
    """Gelenkwinkel (Grad) für Oberschenkel, Schienbein, Fuß, damit der Knöchel auf `ankle` liegt.
    Knie zeigt nach vorn (-Y). foot_pitch: Fußneigung gegenüber flach (Grad, positiv = Zehen nach unten)."""
    dy, dz = ankle[0] - hip[0], ankle[1] - hip[1]
    d = min(math.hypot(dy, dz), (L1 + L2) * 0.999)
    beta = math.acos(max(-1.0, min(1.0, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))))
    at = _ang(dy, dz) - beta
    ky, kz = hip[0] + L1 * S(at), hip[1] - L1 * C(at)
    a_s = _ang(ankle[0] - ky, ankle[1] - kz)
    th = at - A_T0
    sh = a_s - A_S0 - th
    ft = math.radians(foot_pitch) - th - sh
    return math.degrees(th), math.degrees(sh), math.degrees(ft)


def hips_drop(dz):
    """Pose-Location der Hüfte für eine rein senkrechte Verschiebung (Knochenachse zeigt schräg nach oben-vorn)."""
    return (0, 0.949 * dz, -0.316 * dz)


# Gang: ein Zyklus = zwei Schritte. Ein aufgesetzter Fuß wandert relativ zum Körper genau mit Laufgeschwindigkeit
# nach hinten, steht also auf dem Boden still. Das Spiel muss WALK_DIST / WALK_T (= 35 / 1,95 ≈ 18 m/s) laufen.
WALK_T = 1.95         # s pro Zyklus -> knapp ein Schritt pro Sekunde, schwer und gemessen
STANCE = 0.6          # Anteil Bodenkontakt je Fuß (Doppelstand beim Aufsetzen)
REACH = 21.0          # m, die ein Fuß relativ zum Körper während des Bodenkontakts zurücklegt
WALK_DIST = REACH / STANCE
FOOT_C = 2.0          # Mitte der Fußbahn (y), knapp vor der Hüfte
LIFT = 6.0            # m Schwunghöhe


def foot_path(u):
    """u = Phase dieses Fußes (0 = Aufsetzen vorn). Rückgabe ((y, z) des Knöchels, Fußneigung)."""
    if u < STANCE:
        return (FOOT_C - REACH / 2 + REACH * u / STANCE, ANKLE[1]), 0.0
    k = (u - STANCE) / (1 - STANCE)
    return (FOOT_C + REACH / 2 - REACH * ease(k), ANKLE[1] + LIFT * S(PI * k)), 25 * S(PI * k)


def pose_walk(t):
    p = 2 * PI * t
    r = {}
    dz = -0.6 - 0.6 * C(4 * PI * (t - 0.05))     # am tiefsten im Doppelstand
    hip = (HIP[0], HIP[1] + dz)
    for side, ph in (('L', 0.0), ('R', 0.5)):
        ankle, pitch = foot_path((t + ph) % 1.0)
        th, sh, ft = leg_ik(hip, ankle, pitch)
        r['thigh.' + side] = (th, 0, 0)
        r['shin.' + side] = (sh, 0, 0)
        r['foot.' + side] = (ft, 0, 0)
        r['upperarm.' + side] = (-10 * C(p + PI * 2 * ph), 0, 0)   # gegengleich zum Bein derselben Seite
        r['forearm.' + side] = (-18, 0, 0)
        r['hand.' + side] = (-8, 0, 0)
    # Die Hüfte bleibt gerade (sonst wandern die Hüftgelenke und die Füße rutschen); Wiegen im Oberkörper
    r['hips'] = (0, 0, 0)
    r['spine1'] = (2, 4 * S(p), 2.5 * S(p))
    r['spine2'] = (2, -2 * S(p), -1 * S(p))
    r['neck1'] = (0, 0, 0)
    r['neck2'] = (2 * C(2 * p), 0, 0)
    r['head'] = (-2 * C(2 * p), -3 * S(p), 0)
    r['jaw'] = (2, 0, 0)
    r.update(tail(p, 7, 3))
    return r, hips_drop(dz)


def pose_idle(t):
    p = 2 * PI * t
    r = {n: (0, 0, 0) for n in ('hips', 'neck1', 'jaw')}
    r['spine1'] = (1.5 * S(p), 0, 0)
    r['spine2'] = (1.5 * S(p), 0, 0)
    r['neck2'] = (-1.5 * S(p), 0, 0)
    r['head'] = (2 * S(p + 1), 6 * S(p), 0)
    r['jaw'] = (2 + 1.5 * S(p), 0, 0)
    dz = -0.6 + 0.25 * S(p)                       # Atmen: Hüfte hebt und senkt sich, Füße bleiben stehen
    th, sh, ft = leg_ik((HIP[0], HIP[1] + dz), ANKLE)
    for s in 'LR':
        r['thigh.' + s] = (th, 0, 0); r['shin.' + s] = (sh, 0, 0); r['foot.' + s] = (ft, 0, 0)
        r['upperarm.' + s] = (2 * S(p), 0, 0); r['forearm.' + s] = (-20, 0, 0); r['hand.' + s] = (-10, 0, 0)
    r.update(tail(p, 4, 2, 0.45))
    return r, hips_drop(dz)


def pose_roar(t):  # t in Sekunden, Länge 2.2
    e = env(t, 0.0, 0.45, 1.6, 2.2)
    r, loc = pose_idle(0)
    r['spine1'] = (-6 * e, 0, 0)
    r['spine2'] = (-10 * e, 0, 0)
    r['neck1'] = (-12 * e, 0, 0)
    r['neck2'] = (-16 * e, 0, 0)
    r['head'] = (-22 * e + 3 * S(t * 30) * e, 0, 0)
    r['jaw'] = (2 + 38 * e, 0, 0)
    for s in 'LR':
        r['upperarm.' + s] = (-38 * e, 0, 0)
        r['forearm.' + s] = (-30 * e - 15, 0, 0)
        r['hand.' + s] = (-10 - 20 * e, 0, 0)
    r.update(tail(t * 4, 6 * e, 0, 0.5, 8 * e))
    return r, (0, 0.5 * e, 0)


def pose_breath(t):  # Länge 0.8: Kopf nach vorn, Maul weit offen, Halteposition
    e = ease(t / 0.5)
    r, loc = pose_idle(0)
    r['spine1'] = (5 * e, 0, 0)
    r['spine2'] = (9 * e, 0, 0)
    r['neck1'] = (-6 * e, 0, 0)
    r['neck2'] = (-10 * e, 0, 0)
    r['head'] = (8 * e, 0, 0)
    r['jaw'] = (2 + 34 * e, 0, 0)
    for s in 'LR':
        r['upperarm.' + s] = (-14 * e, 0, 0)
        r['forearm.' + s] = (-30, 0, 0)
    r.update(tail(0, 0, 0, 0.5, 6 * e))
    return r, (0, -0.6 * e, 0)


def pose_claw(t, side):  # Länge 0.75
    other = 'R' if side == 'L' else 'L'
    wind = env(t, 0.0, 0.18, 0.2, 0.3)
    hit = env(t, 0.18, 0.32, 0.42, 0.75)
    r, loc = pose_idle(0)
    sg = 1 if side == 'L' else -1
    r['spine1'] = (6 * hit, sg * (10 * wind - 18 * hit), 0)
    r['spine2'] = (8 * hit, sg * (8 * wind - 14 * hit), 0)
    r['head'] = (4 * hit, -sg * 10 * hit, 0)
    r['jaw'] = (2 + 18 * hit, 0, 0)
    r['upperarm.' + side] = (30 * wind - 75 * hit, 0, 0)
    r['forearm.' + side] = (-40 * wind + 10 * hit - 20, 0, 0)
    r['hand.' + side] = (-30 * hit - 10, 0, 0)
    r['upperarm.' + other] = (8 * hit, 0, 0)
    r.update(tail(t * 6, 5, 0))
    return r, (0, 0, 0)


def pose_tail(t):  # Länge 1.1: Schwanz holt weit aus (das Spiel dreht den Körper)
    e = env(t, 0.0, 0.25, 0.75, 1.1)
    sw = S(clamp01(t / 1.1) * PI * 2) * e
    r, loc = pose_idle(0)
    r['spine1'] = (4 * e, 10 * sw, 0)
    r['spine2'] = (6 * e, 8 * sw, 0)
    r['head'] = (0, -12 * sw, 0)
    out = {}
    for i in range(1, 8):
        out['tail%d' % i] = (10 * e - 2 * i * e, 0, -sw * (6 + i * 3.2))
    r.update(out)
    return r, (0, -1.2 * e, 0)


def pose_hit(t):  # Länge 0.55
    e = env(t, 0.0, 0.08, 0.15, 0.55)
    r, loc = pose_idle(0)
    r['spine1'] = (-8 * e, 0, 0)
    r['spine2'] = (-10 * e, 0, 0)
    r['neck2'] = (-10 * e, 0, 0)
    r['head'] = (-14 * e, 6 * e, 0)
    r['jaw'] = (2 + 22 * e, 0, 0)
    for s in 'LR':
        r['upperarm.' + s] = (-20 * e, 0, 0)
    r.update(tail(0, 0, 0, 0.5, 10 * e))
    return r, (0, 0, 0)


def pose_down(t):  # Länge 1.6: Kadmium-Betäubung, sackt zusammen (Halteposition)
    e = ease(t / 1.4)
    r, loc = pose_idle(0)
    for s in 'LR':
        r['thigh.' + s] = (-38 * e + 4, 0, 0)
        r['shin.' + s] = (70 * e + 8, 0, 0)
        r['foot.' + s] = (-34 * e - 9, 0, 0)
        r['upperarm.' + s] = (30 * e, 0, 0)
        r['forearm.' + s] = (-10, 0, 0)
    r['hips'] = (12 * e, 0, 0)
    r['spine1'] = (14 * e, 0, 0)
    r['spine2'] = (12 * e, 0, 0)
    r['neck1'] = (10 * e, 0, 0)
    r['neck2'] = (14 * e, 0, 0)
    r['head'] = (16 * e, 8 * e, 0)
    r['jaw'] = (2 + 8 * e, 0, 0)
    r.update(tail(0, 0, 0, 0.5, -8 * e))
    return r, (0, -9.5 * e, 0)


def pose_death(t):  # Länge 3.0: kippt nach hinten
    e = ease(t / 2.6)
    r, loc = pose_down(1.6 * min(1, t / 1.2))
    r['hips'] = (-30 * e, 0, 0)
    r['head'] = (-30 * e, 0, 0)
    r['jaw'] = (30 * e, 0, 0)
    return r, (0, -9.5 - 6 * e, 3 * e)


ANIMS = [  # Name, Funktion, Länge in s, zyklisch (Funktion bekommt 0..1)
    ('idle', pose_idle, 3.0, True), ('walk', pose_walk, WALK_T, True), ('roar', pose_roar, 2.2, False),
    ('breath', pose_breath, 0.8, False), ('clawL', lambda t: pose_claw(t, 'L'), 0.75, False),
    ('clawR', lambda t: pose_claw(t, 'R'), 0.75, False), ('tail', pose_tail, 1.1, False),
    ('hit', pose_hit, 0.55, False), ('down', pose_down, 1.6, False), ('death', pose_death, 3.0, False),
]


def animate(arm):
    rad = math.radians
    arm.animation_data_create()
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for name, fn, length, cyc in ANIMS:
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        arm.animation_data.action = act
        nf = int(round(length * FPS))
        step = 2
        for f in list(range(0, nf, step)) + [nf]:
            x = f / nf if cyc else f / FPS
            rot, loc = fn(x)
            for pb in arm.pose.bones:
                e = rot.get(pb.name, (0, 0, 0))
                pb.rotation_euler = (rad(e[0]), rad(e[1]), rad(e[2]))
                pb.keyframe_insert('rotation_euler', frame=f)
                if pb.name == 'hips':
                    pb.location = loc
                    pb.keyframe_insert('location', frame=f)
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        track.mute = True
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
