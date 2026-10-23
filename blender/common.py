"""Gemeinsame Helfer für die Blender-Asset-Skripte (Szene, Materialien, Texturen, Export)."""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.fps = 30
    s.frame_start, s.frame_end = 0, 120


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def obj_from_bm(name, bm, mats=()):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    return link(ob)


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def make_image(name, arr):
    """arr: H x W x 3|4 Werte 0..1 (sRGB-kodiert). Zeile 0 = oben."""
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1))], axis=2)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.clip(arr[::-1], 0, 1).astype(np.float32).ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def material(name, color=(0.5, 0.5, 0.5), rough=0.8, metal=0.0, emit=None, emit_strength=1.0,
             img=None, emit_img=None, vcol=False):
    """Principled-Material, so verdrahtet, dass der glTF-Exporter alles mitnimmt.
    color ist sRGB (wie im Farbwähler)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    lin = list(srgb_to_lin(color)) + [1.0]
    bsdf.inputs['Base Color'].default_value = lin
    m.diffuse_color = lin   # Viewport-/Workbench-Farbe für die Vorschau
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if img is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    elif vcol:
        a = nt.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        nt.links.new(a.outputs['Color'], bsdf.inputs['Base Color'])
    ein = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
    if emit_img is not None:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = emit_img
        nt.links.new(t.outputs['Color'], ein)
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    elif emit is not None:
        ein.default_value = list(srgb_to_lin(emit)) + [1.0]
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    return m


def export_glb(path, objs, anim=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_animations=anim, export_cameras=False, export_lights=False,
              export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
              export_image_format='AUTO', export_animation_mode='ACTIONS', export_force_sampling=True,
              export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_active_vertex_color_when_no_material=True,
              export_colors=True, export_extras=True, export_def_bones=True, export_optimize_animation_size=True)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = {k: v for k, v in kw.items() if k in props}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(**kw)
    print('exportiert:', path, os.path.getsize(path) // 1024, 'KB')



def _render_cam(path, target=(0, 0, 40), dist=200, elev=20, azim=-60, lens=50, size=(900, 700)):
    s = bpy.context.scene
    s.render.resolution_x, s.render.resolution_y = size
    s.render.film_transparent = False
    cam = bpy.data.cameras.new('cam'); cam.lens = lens; cam.clip_end = 5000
    co = bpy.data.objects.new('cam', cam); link(co)
    t = Vector(target)
    a, e = math.radians(azim), math.radians(elev)
    co.location = t + Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))) * dist
    co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
    s.camera = co
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(co)


def preview(path, color='MATERIAL', **cam):
    """Schnelle Workbench-Vorschau zur Kontrolle der Modelle. color: MATERIAL, TEXTURE oder VERTEX."""
    s = bpy.context.scene
    s.render.engine = 'BLENDER_WORKBENCH'
    sh = s.display.shading
    sh.light = 'STUDIO'; sh.color_type = color
    sh.show_cavity = True; sh.cavity_type = 'BOTH'; sh.show_shadows = True
    if s.world is None:
        s.world = bpy.data.worlds.new('W')
    _render_cam(path, **cam)


def night_preview(path, **cam):
    """EEVEE-Nachtansicht: fast schwarze Welt, schwaches Mondlicht – zeigt die Emission (Fenster, Neon)."""
    s = bpy.context.scene
    s.world = s.world or bpy.data.worlds.new('W')
    s.world.use_nodes = True
    s.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.004, 0.005, 0.009, 1)
    sun = link(bpy.data.objects.new('moon', bpy.data.lights.new('moon', 'SUN')))
    sun.data.energy = 0.25; sun.data.color = (0.6, 0.7, 1.0)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    s.render.engine = next(e for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT') if e in engines)
    s.view_settings.view_transform = 'AgX'
    _render_cam(path, **cam)
    bpy.data.objects.remove(sun)

def color_preview(path, **cam):
    """EEVEE-Ansicht bei Tageslicht: zeigt Vertexfarben, Texturen und Emission zusammen (zum Vergleich mit Fotos)."""
    s = bpy.context.scene
    s.world = s.world or bpy.data.worlds.new('W')
    s.world.use_nodes = True
    s.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.27, 0.3, 1)
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    sun = bpy.data.objects.get('pv_sun')
    if sun is None:
        sun = link(bpy.data.objects.new('pv_sun', bpy.data.lights.new('pv_sun', 'SUN')))
        sun.data.energy = 3.0
        sun.rotation_euler = (math.radians(40), math.radians(10), math.radians(-40))
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    s.render.engine = next(e for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT') if e in engines)
    s.view_settings.view_transform = 'Standard'
    _render_cam(path, **cam)
