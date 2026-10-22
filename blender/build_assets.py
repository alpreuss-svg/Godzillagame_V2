"""Erzeugt alle 3D-Modelle des Spiels als .glb.
Aufruf: blender -b --factory-startup -P blender/build_assets.py -- [godzilla,city,units] [--preview]"""
import bpy, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import importlib
import common, godzilla, gz_anim, city, units
for m in (common, gz_anim, godzilla, city, units):
    importlib.reload(m)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = '--preview' in args
args = [a for a in args if not a.startswith('--')]
WHAT = args[0].split(',') if args else ['godzilla', 'city', 'units']
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
