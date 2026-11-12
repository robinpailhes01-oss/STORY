# Garden 360° panoramas with Cycles: photographed sky, synthetic turf as real blades, glossy water.
# blender -b --python render_v2.py -- <scene.glb> <points.json> <outdir> <width> <samples> <assets dir>
import bpy, json, math, sys, time, os
A = sys.argv[sys.argv.index("--") + 1:]
glb, ptsf, out, W, SPP, AS = A[0], A[1], A[2], int(A[3]), int(A[4]), A[5]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene
for o in list(sc.objects):
    if o.type == 'LIGHT': bpy.data.objects.remove(o, do_unlink=True)
def under(o, prefix):
    while o:
        if o.name.startswith(prefix): return True
        o = o.parent
    return False
def bsdf(m): return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.node_tree else None
for m in bpy.data.materials:
    p = bsdf(m)
    if p: p.inputs['Roughness'].default_value = 0.8; p.inputs['Specular IOR Level'].default_value = 0.35
# the pool: glossy water on the textured surface
for o in sc.objects:
    if o.type == 'MESH' and under(o, 'item-04') and o.dimensions.z < 0.05:
        for s in o.material_slots:
            p = bsdf(s.material)
            if p and any(n.type == 'TEX_IMAGE' for n in s.material.node_tree.nodes): p.inputs['Roughness'].default_value = 0.04; p.inputs['Specular IOR Level'].default_value = 0.6
# synthetic turf: short dense blades on the lawn
lawn = next((o for o in sc.objects if o.type == 'MESH' and under(o, 'pelouse')), None)
if lawn:
    area = sum(p.area for p in lawn.data.polygons) * lawn.matrix_world.to_scale().x * lawn.matrix_world.to_scale().y
    ps = lawn.modifiers.new('gazon', 'PARTICLE_SYSTEM').particle_system.settings
    ps.type = 'HAIR'; ps.count = int(min(400000, area * 900)); ps.hair_length = 0.035; ps.use_advanced_hair = True
    ps.child_type = 'INTERPOLATED'; ps.rendered_child_count = 14; ps.child_length = 1.0; ps.clump_factor = 0.2; ps.roughness_2 = 0.006; ps.roughness_endpoint = 0.004
    ps.root_radius = 0.0016; ps.tip_radius = 0.0004; ps.radius_scale = 1.0
    ps.normal_factor = 1.0; ps.factor_random = 0.25; ps.brownian_factor = 0.0
    gm = bpy.data.materials.new('gazon'); gm.use_nodes = True; nt = gm.node_tree; p = bsdf(gm)
    info = nt.nodes.new('ShaderNodeHairInfo'); ramp = nt.nodes.new('ShaderNodeValToRGB'); rnd = nt.nodes.new('ShaderNodeMixRGB')
    ramp.color_ramp.elements[0].color = (0.035, 0.09, 0.02, 1); ramp.color_ramp.elements[1].color = (0.11, 0.22, 0.04, 1)
    nt.links.new(info.outputs['Intercept'], ramp.inputs[0])
    rnd.blend_type = 'MULTIPLY'; rnd.inputs[0].default_value = 0.35; nt.links.new(ramp.outputs[0], rnd.inputs[1])
    nt.links.new(info.outputs['Random'], rnd.inputs[2])
    nt.links.new(rnd.outputs[0], p.inputs['Base Color']); p.inputs['Roughness'].default_value = 0.55; p.inputs['Specular IOR Level'].default_value = 0.4
    lawn.data.materials.append(gm); ps.material = len(lawn.data.materials)
# photographed sky lights the scene, a sun lamp sharpens the shadows
w = bpy.data.worlds.new('Ciel'); sc.world = w; nt = w.node_tree; bg = nt.nodes['Background']
env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(os.path.join(AS, 'sky.hdr'))
mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord'); nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs[0], env.inputs[0])
mp.inputs['Rotation'].default_value[2] = math.radians(40)
nt.links.new(env.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.0
sun = bpy.data.lights.new('Soleil', 'SUN'); sun.energy = 2.6; sun.angle = math.radians(1.0); sun.color = (1.0, 0.92, 0.82)
so = bpy.data.objects.new('Soleil', sun); sc.collection.objects.link(so); so.rotation_euler = (math.radians(58), 0, math.radians(40))
cd = bpy.data.cameras.new('Visite'); cd.type = 'PANO'; cd.panorama_type = 'EQUIRECTANGULAR'
cam = bpy.data.objects.new('Visite', cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.max_bounces = 5; sc.render.resolution_x = W; sc.render.resolution_y = W // 2
sc.view_settings.view_transform = 'AgX'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass
sc.view_settings.exposure = -0.2
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 90
os.makedirs(out, exist_ok=True)
for p in json.load(open(ptsf)):
    cam.location = (p['x'], -p['z'], 1.6); cam.rotation_euler = (math.radians(90), 0, -p['yaw'])
    t0 = time.time(); sc.render.filepath = os.path.join(out, 'pano-%s.jpg' % p['label']); bpy.ops.render.render(write_still=True)
    print('point', p['label'], round(time.time() - t0), 's', flush=True)
