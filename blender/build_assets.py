"""Erzeugt alle 3D-Modelle des Spiels als .glb.
Aufruf: blender -b --factory-startup -P blender/build_assets.py -- [godzilla,city,units,biollante,ghidorah,mothra,kaiju93] [--preview]"""
import bpy, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import common, godzilla, gz_anim, city, units, biollante, ghidorah, mothra, kaiju93, kaiju94, kaiju95
for m in (common, gz_anim, godzilla, city, units, biollante, ghidorah, mothra, kaiju93, kaiju94, kaiju95):
    importlib.reload(m)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in args
args = [a for a in args if not a.startswith('--')]
WHAT = args[0].split(',') if args else ['godzilla', 'city', 'units', 'biollante', 'ghidorah', 'mothra', 'kaiju93', 'kaiju94', 'kaiju95']
OUT = os.path.normpath(os.path.join(HERE, '..', 'assets', 'models'))
PRE = os.path.normpath(os.path.join(HERE, '..', 'tools', 'previews'))

if 'godzilla' in WHAT:
    common.reset()
    arm, ob = godzilla.build()
    common.export_glb(os.path.join(OUT, 'godzilla.glb'), [arm, ob], anim=True)
    if PREVIEW:
        common.preview(os.path.join(PRE, 'godzilla_front.png'), target=(0, 0, 40), dist=210, elev=12, azim=-70, color='VERTEX')
        common.preview(os.path.join(PRE, 'godzilla_side.png'), target=(0, 25, 35), dist=240, elev=8, azim=0, color='VERTEX')
        common.preview(os.path.join(PRE, 'godzilla_top.png'), target=(0, 10, 40), dist=260, elev=55, azim=-120, color='VERTEX')
        common.preview(os.path.join(PRE, 'godzilla_head.png'), target=(0, -14, 72), dist=40, elev=8, azim=-60, color='VERTEX')
        common.preview(os.path.join(PRE, 'godzilla_mouth.png'), target=(0, -17, 72.5), dist=26, elev=4, azim=-90, color='VERTEX')
        # Posen zur Kontrolle von Kiefer, Armen und Gewichtung (Aktion, Frame, Datei, Kamera)
        front = dict(target=(0, -8, 52), dist=110, elev=8, azim=-90)
        for act_name, frame, fname, cam in (
                ('breath', 20, 'godzilla_breath.png', dict(target=(0, -16, 70), dist=60, elev=6, azim=-40)),
                ('clawL', 6, 'godzilla_clawL_wind.png', front), ('clawL', 10, 'godzilla_clawL_hit.png', front),
                ('clawR', 10, 'godzilla_clawR_hit.png', front), ('roar', 30, 'godzilla_roar.png', front)):
            act = bpy.data.actions[act_name]
            arm.animation_data.action = act
            if hasattr(arm.animation_data, 'action_slot') and act.slots:
                arm.animation_data.action_slot = act.slots[0]
            bpy.context.scene.frame_set(frame)
            common.preview(os.path.join(PRE, fname), color='VERTEX', **cam)
        arm.animation_data.action = None

if 'city' in WHAT:
    common.reset()
    objs = city.build()
    common.export_glb(os.path.join(OUT, 'city.glb'), objs)
    if PREVIEW:
        city.layout_preview(objs)
        cam = dict(target=(180, -60, 30), dist=560, elev=30, azim=-105, lens=45)
        common.preview(os.path.join(PRE, 'city.png'), color='TEXTURE', **cam)
        common.night_preview(os.path.join(PRE, 'city_night.png'), **cam)
        rb = [o for o in objs if o.name.startswith('B_rubble')]
        c = sum((o.location for o in rb), bpy.data.objects[rb[0].name].location * 0) / len(rb)
        common.preview(os.path.join(PRE, 'city_rubble.png'), color='TEXTURE', target=c[:], dist=95, elev=35, azim=-100)

if 'units' in WHAT:
    common.reset()
    objs = units.build()
    common.export_glb(os.path.join(OUT, 'units.glb'), objs)
    if PREVIEW:
        units.layout_preview(objs)
        common.preview(os.path.join(PRE, 'units.png'), target=(40, 0, 5), dist=150, elev=25, azim=-100)
        common.preview(os.path.join(PRE, 'units_military.png'), target=(14, -8, 2), dist=48, elev=28, azim=-110)
        common.preview(os.path.join(PRE, 'units_superx.png'), target=next(o for o in objs if o.name == 'U_superx').location[:],
                       dist=55, elev=25, azim=-130)
        common.preview(os.path.join(PRE, 'units_superx2.png'), target=next(o for o in objs if o.name == 'U_superx2').location[:],
                       dist=60, elev=20, azim=-115)

if 'biollante' in WHAT:
    common.reset()
    objs = biollante.build()
    common.export_glb(os.path.join(OUT, 'biollante.glb'), objs)
    if PREVIEW:
        biollante.layout_preview(objs)
        common.preview(os.path.join(PRE, 'biollante.png'), color='VERTEX', target=(0, 0, 45), dist=300, elev=12, azim=-80)
        common.preview(os.path.join(PRE, 'biollante_rose.png'), target=(-70, 0, 55), dist=170, elev=10, azim=-75)
        common.preview(os.path.join(PRE, 'biollante_beast.png'), target=(60, -10, 50), dist=170, elev=12, azim=-60)
        common.preview(os.path.join(PRE, 'biollante_head.png'), target=(0, 0, 30), dist=40, elev=10, azim=-50)
        common.night_preview(os.path.join(PRE, 'biollante_night.png'), target=(0, 0, 45), dist=300, elev=12, azim=-80)

if 'ghidorah' in WHAT:
    common.reset()
    objs = ghidorah.build()
    common.export_glb(os.path.join(OUT, 'ghidorah.glb'), objs)
    if PREVIEW:
        ghidorah.layout_preview(objs)
        common.preview(os.path.join(PRE, 'ghidorah.png'), target=(0, 10, 70), dist=520, elev=10, azim=-90, color='VERTEX')
        common.preview(os.path.join(PRE, 'ghidorah_king.png'), target=(-80, 10, 70), dist=300, elev=10, azim=-75, color='VERTEX')
        common.preview(os.path.join(PRE, 'ghidorah_mecha.png'), target=(80, 10, 70), dist=300, elev=10, azim=-90, color='VERTEX')
        common.preview(os.path.join(PRE, 'ghidorah_mecha_side.png'), target=(80, 10, 70), dist=280, elev=14, azim=-35, color='TEXTURE')

if 'mothra' in WHAT:
    common.reset()
    objs = mothra.build()
    common.export_glb(os.path.join(OUT, 'mothra.glb'), objs)
    if PREVIEW:
        mothra.layout_preview(objs)
        common.color_preview(os.path.join(PRE, 'mothra_top.png'), target=(0, 5, 40), dist=420, elev=70, azim=-90)
        common.color_preview(os.path.join(PRE, 'mothra_mothra.png'), target=(-110, -5, 40), dist=210, elev=25, azim=-70)
        common.color_preview(os.path.join(PRE, 'mothra_mothra_head.png'), target=(-110, -18, 38), dist=70, elev=10, azim=-60)
        common.color_preview(os.path.join(PRE, 'mothra_battra.png'), target=(110, -5, 40), dist=210, elev=25, azim=-110)
        common.color_preview(os.path.join(PRE, 'mothra_battra_head.png'), target=(110, -18, 36), dist=75, elev=12, azim=-120)
        common.color_preview(os.path.join(PRE, 'mothra_larva.png'), target=(0, -10, 14), dist=80, elev=12, azim=-55)

if 'kaiju93' in WHAT:
    common.reset()
    objs = kaiju93.build()
    common.export_glb(os.path.join(OUT, 'kaiju93.glb'), objs)
    if PREVIEW:
        kaiju93.layout_preview(objs)
        common.color_preview(os.path.join(PRE, 'kaiju93_rodan.png'), target=(-90, 0, 40), dist=220, elev=30, azim=-70)
        common.color_preview(os.path.join(PRE, 'kaiju93_rodan_head.png'), target=(-90, -24, 50), dist=55, elev=10, azim=-40)
        common.color_preview(os.path.join(PRE, 'kaiju93_mecha.png'), target=(60, 0, 40), dist=170, elev=8, azim=-70)
        common.color_preview(os.path.join(PRE, 'kaiju93_mecha_front.png'), target=(60, 0, 40), dist=150, elev=5, azim=-90)

if 'kaiju94' in WHAT:
    common.reset()
    objs = kaiju94.build()
    common.export_glb(os.path.join(OUT, 'kaiju94.glb'), objs)
    if PREVIEW:
        kaiju94.layout_preview(objs)
        common.preview(os.path.join(PRE, 'kaiju94.png'), target=(0, 0, 35), dist=170, elev=12, azim=-70, color='VERTEX')

if 'kaiju95' in WHAT:
    common.reset()
    objs = kaiju95.build()
    common.export_glb(os.path.join(OUT, 'kaiju95.glb'), objs)
    if PREVIEW:
        kaiju95.layout_preview(objs)
        common.color_preview(os.path.join(PRE, 'kaiju95.png'), target=(-20, 0, 40), dist=330, elev=14, azim=-75)
        common.color_preview(os.path.join(PRE, 'kaiju95_final.png'), target=(60, 0, 50), dist=200, elev=8, azim=-75)
        common.color_preview(os.path.join(PRE, 'kaiju95_head.png'), target=(60, -22, 78), dist=70, elev=10, azim=-60)
        common.color_preview(os.path.join(PRE, 'kaiju95_juv.png'), target=(-150, -5, 12), dist=80, elev=20, azim=-60)
