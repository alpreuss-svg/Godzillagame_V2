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
        common.preview(os.path.join(PRE, 'godzilla_front.png'), target=(0, 0, 40), dist=210, elev=12, azim=-70)
        common.preview(os.path.join(PRE, 'godzilla_side.png'), target=(0, 25, 35), dist=240, elev=8, azim=0)
        common.preview(os.path.join(PRE, 'godzilla_top.png'), target=(0, 10, 40), dist=260, elev=55, azim=-120)
        common.preview(os.path.join(PRE, 'godzilla_head.png'), target=(0, -14, 72), dist=40, elev=8, azim=-60)

if 'city' in WHAT:
    common.reset()
    objs = city.build()
    common.export_glb(os.path.join(OUT, 'city.glb'), objs)
    if PREVIEW:
        city.layout_preview(objs)
        common.preview(os.path.join(PRE, 'city.png'), target=(120, 60, 20), dist=420, elev=28, azim=-110)

if 'units' in WHAT:
    common.reset()
    objs = units.build()
    common.export_glb(os.path.join(OUT, 'units.glb'), objs)
    if PREVIEW:
        units.layout_preview(objs)
        common.preview(os.path.join(PRE, 'units.png'), target=(40, 0, 5), dist=150, elev=25, azim=-100)
