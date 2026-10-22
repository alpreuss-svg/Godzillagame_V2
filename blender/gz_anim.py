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


def pose_walk(t):
    p = 2 * PI * t
    r = {}
    for side, ph in (('L', 0.0), ('R', PI)):
        q = p + ph
        th = -24 * S(q) + 4
        swing = max(0.0, C(q))
        sh = 8 + 30 * swing
        r['thigh.' + side] = (th, 0, 0)
        r['shin.' + side] = (sh, 0, 0)
        r['foot.' + side] = (-(th + sh) * 0.75 + 4 * swing, 0, 0)
        r['upperarm.' + side] = (10 * S(q), 0, 0)
        r['forearm.' + side] = (-18, 0, 0)
        r['hand.' + side] = (-8, 0, 0)
    r['hips'] = (0, 4 * S(p), 3 * S(p))
    r['spine1'] = (2, -2 * S(p), -1.5 * S(p))
    r['spine2'] = (2, -2 * S(p), -1 * S(p))
    r['neck1'] = (0, 0, 0)
    r['neck2'] = (2 * C(2 * p), 0, 0)
    r['head'] = (-2 * C(2 * p), 2 * S(p), 0)
    r['jaw'] = (2, 0, 0)
    r.update(tail(p, 7, 3))
    loc = (0, -0.9 + 0.9 * C(2 * p), 0)
    return r, loc


def pose_idle(t):
    p = 2 * PI * t
    r = {n: (0, 0, 0) for n in ('hips', 'neck1', 'jaw')}
    r['spine1'] = (1.5 * S(p), 0, 0)
    r['spine2'] = (1.5 * S(p), 0, 0)
    r['neck2'] = (-1.5 * S(p), 0, 0)
    r['head'] = (2 * S(p + 1), 6 * S(p), 0)
    r['jaw'] = (2 + 1.5 * S(p), 0, 0)
    for s in 'LR':
        r['thigh.' + s] = (4, 0, 0); r['shin.' + s] = (8, 0, 0); r['foot.' + s] = (-9, 0, 0)
        r['upperarm.' + s] = (2 * S(p), 0, 0); r['forearm.' + s] = (-20, 0, 0); r['hand.' + s] = (-10, 0, 0)
    r.update(tail(p, 4, 2, 0.45))
    return r, (0, 0.25 * S(p), 0)


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
    ('idle', pose_idle, 3.0, True), ('walk', pose_walk, 1.7, True), ('roar', pose_roar, 2.2, False),
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
