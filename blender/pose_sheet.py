"""Bilderbogen von Godzilla auf hellem Hintergrund, aus der fertigen godzilla.glb (mit den echten Animationen).
Aufruf: blender -b --factory-startup -P blender/pose_sheet.py
Ergebnis: tools/previews/sheet_proportionen.png, sheet_klaue.png, sheet_angriffe.png
(Kacheln von links oben nach rechts unten, Reihenfolge siehe SHEETS)."""
import bpy, os, sys, math
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common

ROOT = os.path.normpath(os.path.join(HERE, '..'))
PRE = os.path.join(ROOT, 'tools', 'previews')
TILE = (640, 760)
BODY = dict(target=(0, 14, 40), dist=200)            # ganzer Körper samt Schwanz
FRONT = dict(target=(0, -6, 50), dist=118)           # Oberkörper und Arme
SIDE = dict(target=(0, -6, 50), dist=118, elev=4, azim=0)

# (Aktion, Frame oder Anteil der Länge, Kamera)  azim: -90 = von vorn (Godzilla schaut nach -Y), 0 = von rechts
SHEETS = {
    'sheet_proportionen': [
        ('idle', 0, dict(BODY, dist=150, target=(0, 0, 42), elev=6, azim=-90)),   # vorn
        ('idle', 0, dict(BODY, elev=10, azim=-45)),         # schräg vorn
        ('idle', 0, dict(BODY, dist=240, elev=4, azim=0)),  # Seite
        ('idle', 0, dict(BODY, elev=12, azim=135)),         # schräg hinten
        ('idle', 0, dict(BODY, dist=250, elev=53, azim=90)),   # wie die Spielkamera (von Süden, er geht nach Norden)
        ('idle', 0, dict(target=(0, -14, 72), dist=48, elev=8, azim=-60)),   # Kopf
    ],
    # Klauenhieb links als Bildfolge (Anteil der Animationslänge), oben von vorn, unten von der Seite
    'sheet_klaue': [('clawL', k, dict(FRONT, elev=6, azim=-90)) for k in (0.0, 0.27, 0.5, 0.7)]
                 + [('clawL', k, dict(SIDE)) for k in (0.0, 0.27, 0.5, 0.7)],
    # Kopf und Hals aus der Nähe: Ruhe und Brüllen (von der Seite, schräg, von vorn)
    'sheet_kopf': [
        ('idle', 0, dict(target=(0, -12, 68), dist=55, elev=4, azim=0)),
        ('idle', 0, dict(target=(0, -12, 68), dist=55, elev=8, azim=-50)),
        ('idle', 0, dict(target=(0, -10, 66), dist=60, elev=5, azim=-90)),
        ('roar', 0.45, dict(target=(0, -12, 70), dist=55, elev=4, azim=0)),
        ('roar', 0.45, dict(target=(0, -8, 60), dist=95, elev=8, azim=-50)),
        ('roarFwd', 0.45, dict(target=(0, -8, 58), dist=110, elev=6, azim=-70)),
    ],
    'sheet_angriffe': [
        ('clawR', 0.2, dict(FRONT, elev=6, azim=-90)),      # rechte Klaue holt aus
        ('clawR', 0.35, dict(FRONT, elev=6, azim=-90)),     # rechte Klaue trifft
        ('roar', 0.5, dict(FRONT, elev=6, azim=-60)),       # Brüllen
        ('tail', 0.3, dict(BODY, dist=260, elev=35, azim=-60)),   # Schwanzschlag
        ('tail', 0.5, dict(BODY, dist=260, elev=35, azim=-60)),
        ('breath', 0.5, dict(FRONT, elev=6, azim=-40)),     # Atomstrahl
    ],
}


def setup():
    common.reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'assets', 'models', 'godzilla.glb'))
    s = bpy.context.scene
    s.render.engine = 'BLENDER_WORKBENCH'
    sh = s.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'SINGLE'; sh.single_color = (0.62, 0.6, 0.56)   # wie Modellierton: Formen gut lesbar
    sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = True
    s.world = s.world or bpy.data.worlds.new('W')
    s.world.color = (0.82, 0.83, 0.85)                  # heller Hintergrund
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.animation_data_create()
    return arm


def pose(arm, name, frame):
    if isinstance(name, dict):                   # freie Pose zum Ausprobieren: {Knochen: (x, y, z) in Grad}
        arm.animation_data.action = None
        for pb in arm.pose.bones:
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = [math.radians(a) for a in name.get(pb.name, (0, 0, 0))]
        bpy.context.view_layer.update()
        return
    act = next((a for a in bpy.data.actions if a.name == name or a.name.startswith(name + '_') or a.name.startswith(name + '.')), None)
    if act is None:
        raise RuntimeError('Aktion fehlt: %s (%s)' % (name, [a.name for a in bpy.data.actions]))
    arm.animation_data.action = act
    if hasattr(arm.animation_data, 'action_slot') and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    f0, f1 = act.frame_range
    f = f0 + (f1 - f0) * frame if isinstance(frame, float) else frame
    bpy.context.scene.frame_set(int(round(f)))


def render_tile(path, cam):
    common._render_cam(path, size=TILE, **cam)
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE[1], TILE[0], 4)
    bpy.data.images.remove(img)
    os.remove(path)
    return px


def build_sheet(arm, name, tiles, cols=3, gap=6):
    cols = 4 if len(tiles) == 8 else cols
    rows = math.ceil(len(tiles) / cols)
    W, H = cols * TILE[0] + (cols + 1) * gap, rows * TILE[1] + (rows + 1) * gap
    sheet = np.ones((H, W, 4), dtype=np.float32)
    sheet[..., :3] = 0.55
    for k, (act, frame, cam) in enumerate(tiles):
        pose(arm, act, frame)
        px = render_tile(os.path.join(PRE, '_tile.png'), cam)
        r, c = divmod(k, cols)
        y0 = H - (r + 1) * (TILE[1] + gap)           # Blender-Bilder beginnen unten
        x0 = gap + c * (TILE[0] + gap)
        sheet[y0:y0 + TILE[1], x0:x0 + TILE[0]] = px
    img = bpy.data.images.new(name, W, H, alpha=True)
    img.pixels.foreach_set(sheet.ravel())
    img.filepath_raw = os.path.join(PRE, name + '.png')
    img.file_format = 'PNG'
    img.save()
    print('Bilderbogen:', img.filepath_raw)


if __name__ == '__main__':
    os.makedirs(PRE, exist_ok=True)
    arm = setup()
    for name, tiles in SHEETS.items():
        build_sheet(arm, name, tiles)
