"""PayTrail hero: quote -> accepted -> page-turn into invoice -> payment card.

Run:  python3.11 scene.py --framing desktop --out /path/frames/ [--frames 1-180] [--scale 1.0] [--samples 40]
Writes RGBA PNGs (transparent background, shadow catcher floor) so the frames
can be composited onto any page background colour afterwards.
"""
import argparse, math, os, sys
import bpy, bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("--framing", default="desktop", choices=["desktop", "mobile"])
ap.add_argument("--out", required=True)
ap.add_argument("--frames", default="1-180")
ap.add_argument("--scale", type=float, default=1.0)
ap.add_argument("--samples", type=int, default=40)
ap.add_argument("--save", default="")
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "tex")
FPS = 24
W, H, T = 0.21, 0.297, 0.0009          # A4 sheet, slightly exaggerated thickness
CW, CH, CT, CR = 0.125, 0.073, 0.0022, 0.008   # payment card

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, 192

# ---------------------------------------------------------------- helpers
def key(obj, path, frame, value, index=-1, interp="BEZIER", easing=None):
    if index >= 0:
        getattr(obj, path)[index] = value
    else:
        setattr(obj, path, value)
    obj.keyframe_insert(data_path=path, frame=frame, index=index)

def finish_curves(idblock, interp="BEZIER"):
    ad = idblock.animation_data
    if not ad or not ad.action:
        return
    for layer in getattr(ad.action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = interp
                        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
    for fc in getattr(ad.action, "fcurves", []) or []:
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"

def image(name):
    return bpy.data.images.load(os.path.join(TEX, name + ".png"), check_existing=True)

def paper_material(name, tex_a, tex_b, flip_u=False, rough=0.62):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    n = nt.nodes
    for x in list(n):
        n.remove(x)
    out = n.new("ShaderNodeOutputMaterial")
    bsdf = n.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = 0.35
    uv = n.new("ShaderNodeTexCoord")
    mapping = n.new("ShaderNodeMapping")
    if flip_u:
        mapping.inputs["Location"].default_value = (1, 0, 0)
        mapping.inputs["Scale"].default_value = (-1, 1, 1)
    nt.links.new(uv.outputs["UV"], mapping.inputs["Vector"])
    ta = n.new("ShaderNodeTexImage"); ta.image = image(tex_a); ta.interpolation = "Linear"
    nt.links.new(mapping.outputs["Vector"], ta.inputs["Vector"])
    color = ta.outputs["Color"]
    mix = None
    if tex_b:
        tb = n.new("ShaderNodeTexImage"); tb.image = image(tex_b); tb.interpolation = "Linear"
        nt.links.new(mapping.outputs["Vector"], tb.inputs["Vector"])
        mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"
        mix.inputs["Factor"].default_value = 0.0
        nt.links.new(ta.outputs["Color"], mix.inputs[6])
        nt.links.new(tb.outputs["Color"], mix.inputs[7])
        color = mix.outputs[2]
    nt.links.new(color, bsdf.inputs["Base Color"])
    # faint paper tooth
    noise = n.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 900.0; noise.inputs["Detail"].default_value = 4.0
    bump = n.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.02; bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, mix

def plain_material(name, rgb, rough=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.3
    return m

def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

# ---------------------------------------------------------------- floor
bpy.ops.mesh.primitive_plane_add(size=6)
floor = bpy.context.object
floor.is_shadow_catcher = True
floor.data.materials.append(plain_material("floor", srgb("#f4f1ea"), 0.9))

# ---------------------------------------------------------------- document
# hierarchy: DocRoot (placement + yaw) -> Hinge (left edge, page turn) -> Doc mesh (x from 0..W)
root = bpy.data.objects.new("DocRoot", None); scene.collection.objects.link(root)
hinge = bpy.data.objects.new("Hinge", None); scene.collection.objects.link(hinge)
hinge.parent = root

NX, NY = 48, 64
me = bpy.data.meshes.new("doc")
bm = bmesh.new()
verts = [[bm.verts.new((W * i / NX, H * (j / NY - 0.5), 0)) for j in range(NY + 1)] for i in range(NX + 1)]
uvl = bm.loops.layers.uv.new("UV")
for i in range(NX):
    for j in range(NY):
        f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
        for loop in f.loops:
            co = loop.vert.co
            loop[uvl].uv = (co.x / W, co.y / H + 0.5)
bm.to_mesh(me); bm.free()
for p in me.polygons:
    p.use_smooth = True
doc = bpy.data.objects.new("Doc", me); scene.collection.objects.link(doc)
doc.parent = hinge

front, front_mix = paper_material("quote", "quote_pending", "quote_accepted")
back, back_mix = paper_material("invoice", "invoice_due", "invoice_paid", flip_u=True)
rim = plain_material("rim", srgb("#efebe2"), 0.8)
for m in (front, back, rim):
    me.materials.append(m)

# shape keys: "cup" (edges lifted, air under the sheet) and "lag" (free edge trails during the turn)
doc.shape_key_add(name="Basis")
cup = doc.shape_key_add(name="cup")
lag = doc.shape_key_add(name="lag")
for i, v in enumerate(me.vertices):
    u, w = v.co.x / W, v.co.y / H + 0.5
    cup.data[i].co.z = 0.014 * ((2 * u - 1) ** 2 * 0.7 + (2 * w - 1) ** 2 * 0.3)
    lag.data[i].co.z = -0.075 * u ** 2.2 * (1 - 0.12 * (2 * w - 1) ** 2)

solid = doc.modifiers.new("thickness", "SOLIDIFY")
solid.thickness = T; solid.offset = 0.0
solid.material_offset = 1; solid.material_offset_rim = 2
solid.use_even_offset = True
sub = doc.modifiers.new("smooth", "SUBSURF"); sub.levels = 0; sub.render_levels = 0

# ---------------------------------------------------------------- payment card
def rounded_rect(w, h, r, seg=10):
    pts = []
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

cme = bpy.data.meshes.new("card")
bm = bmesh.new()
outline = rounded_rect(CW, CH, CR)
ring = [bm.verts.new((x, y, 0)) for x, y in outline]
face = bm.faces.new(ring)
bmesh.ops.triangulate(bm, faces=[face])
uvl = bm.loops.layers.uv.new("UV")
for f in bm.faces:
    for loop in f.loops:
        loop[uvl].uv = (loop.vert.co.x / CW + 0.5, loop.vert.co.y / CH + 0.5)
bm.to_mesh(cme); bm.free()
card = bpy.data.objects.new("Card", cme); scene.collection.objects.link(card)
card_mat, _ = paper_material("card", "card", None, rough=0.45)
card_back = plain_material("card_back", srgb("#ffffff"), 0.5)
card_rim = plain_material("card_rim", srgb("#f1efe9"), 0.6)
for m in (card_mat, card_back, card_rim):
    cme.materials.append(m)
cs = card.modifiers.new("thickness", "SOLIDIFY")
cs.thickness = CT; cs.offset = 1.0
cs.material_offset = 1; cs.material_offset_rim = 2
cb = card.modifiers.new("bevel", "BEVEL"); cb.width = 0.0006; cb.segments = 3; cb.limit_method = "ANGLE"

# ---------------------------------------------------------------- animation
# 1-36    quote glides in and settles (camera eases in)
# 36-62   still: status turns "Accepted" (crossfaded in 2D between renders 36 and 62)
# 63-105  page turn: the quote becomes the invoice; camera pans to follow (63-120)
# 118-150 payment card arrives and settles
# 150-160 still: invoice turns "Paid" (2D crossfade between renders 150 and 160)
YAW = math.radians(-3.0)
key(root, "location", 1, Vector((0.05, 0.015, T / 2 + 0.03)))
key(root, "location", 34, Vector((0.0, 0.0, T / 2)))
key(root, "rotation_euler", 1, Vector((math.radians(1.5), math.radians(-2.0), math.radians(7.0))))
key(root, "rotation_euler", 36, Vector((0, 0, YAW)))
cup_kb = me.shape_keys.key_blocks["cup"]
lag_kb = me.shape_keys.key_blocks["lag"]
for fr, v in ((1, 1.0), (24, 0.55), (36, 0.0)):
    cup_kb.value = v; cup_kb.keyframe_insert("value", frame=fr)

front_fac = front_mix.inputs["Factor"]
for fr, v in ((45, 0.0), (46, 1.0)):
    front_fac.default_value = v; front_fac.keyframe_insert("default_value", frame=fr)

key(hinge, "rotation_euler", 63, Vector((0, 0, 0)))
key(hinge, "rotation_euler", 105, Vector((0, -math.pi, 0)))
for fr, v in ((63, 0.0), (71, 0.25), (83, 0.85), (97, 0.55), (105, 0.32), (120, 0.0)):
    lag_kb.value = v; lag_kb.keyframe_insert("value", frame=fr)
key(hinge, "location", 63, Vector((0, 0, 0)))
key(hinge, "location", 81, Vector((0, 0, 0.006)))
key(hinge, "location", 103, Vector((0, 0, 0)))

back_fac = back_mix.inputs["Factor"]
for fr, v in ((158, 0.0), (159, 1.0)):
    back_fac.default_value = v; back_fac.keyframe_insert("default_value", frame=fr)

CARD_REST = Vector((0.012, -0.098, 2 * T + 0.0002))
key(card, "location", 118, Vector((0.30, -0.27, 0.055)))
key(card, "location", 141, CARD_REST + Vector((0, 0, 0.005)))
key(card, "location", 150, CARD_REST)
key(card, "rotation_euler", 118, Vector((math.radians(-4), math.radians(6), math.radians(26))))
key(card, "rotation_euler", 144, Vector((0, 0, math.radians(-5.0))))
key(card, "rotation_euler", 150, Vector((0, 0, math.radians(-6.0))))

for ob in (root, hinge, card):
    finish_curves(ob)
finish_curves(me.shape_keys)
for m in (front, back):
    finish_curves(m.node_tree, "CONSTANT")

key(card, "hide_render", 1, True)
key(card, "hide_render", 117, True)
key(card, "hide_render", 118, False)
for fc_owner in (card,):
    ad = fc_owner.animation_data
    for layer in getattr(ad.action, "layers", []):
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    if fc.data_path == "hide_render":
                        for kp in fc.keyframe_points:
                            kp.interpolation = "CONSTANT"

# ---------------------------------------------------------------- camera
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam)
scene.camera = cam
target = bpy.data.objects.new("target", None); scene.collection.objects.link(target)
track = cam.constraints.new("TRACK_TO"); track.target = target
track.track_axis = "TRACK_NEGATIVE_Z"; track.up_axis = "UP_Y"

def place_camera(frame, look, dist, elev_deg, az_deg):
    e, a = math.radians(elev_deg), math.radians(az_deg)
    pos = look + Vector((dist * math.cos(e) * math.sin(a), -dist * math.cos(e) * math.cos(a), dist * math.sin(e)))
    key(target, "location", frame, look)
    key(cam, "location", frame, pos)

# (frame, look-at, distance, elevation, azimuth); equal neighbours = camera holds still
SHOTS = [
    (1, (0.11, 0.012, 0), 0.73, 64, -7),
    (36, (0.104, -0.004, 0), 0.645, 65, -6),
    (62, (0.104, -0.004, 0), 0.645, 65, -6),
    (86, (0.02, 0.016, 0), 0.88, 75, -5),
    (120, (-0.07, -0.02, 0), 0.62, 66, -4),
    (192, (-0.07, -0.02, 0), 0.62, 66, -4),
]
cam_data.lens = 58
W_PX, H_PX = 1200, 1080
for fr, look, dist, el, az in SHOTS:
    place_camera(fr, Vector(look), dist, el, az)
finish_curves(cam); finish_curves(target)
cam_data.sensor_width = 36

# ---------------------------------------------------------------- light
key_light = bpy.data.lights.new("key", "AREA")
key_light.shape = "DISK"; key_light.size = 1.7; key_light.energy = 30
kl = bpy.data.objects.new("key", key_light); scene.collection.objects.link(kl)
kl.location = (-0.75, 0.55, 1.15)
kt = kl.constraints.new("TRACK_TO"); kt.target = target; kt.track_axis = "TRACK_NEGATIVE_Z"; kt.up_axis = "UP_Y"
fill = bpy.data.lights.new("fill", "AREA"); fill.size = 2.4; fill.energy = 12
fl = bpy.data.objects.new("fill", fill); scene.collection.objects.link(fl)
fl.location = (0.9, -0.6, 0.9)
ft = fl.constraints.new("TRACK_TO"); ft.target = target; ft.track_axis = "TRACK_NEGATIVE_Z"; ft.up_axis = "UP_Y"

world = bpy.data.worlds.new("world"); scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*srgb("#f6f2ea"), 1)
bg.inputs["Strength"].default_value = 0.5

# ---------------------------------------------------------------- render
r = scene.render
r.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 0
scene.cycles.transparent_max_bounces = 2
r.film_transparent = True
r.use_motion_blur = os.environ.get("MB", "1") == "1"
r.motion_blur_shutter = 0.35
r.resolution_x = int(W_PX * args.scale)
r.resolution_y = int(H_PX * args.scale)
r.resolution_percentage = 100
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGBA"
r.image_settings.color_depth = "8"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = float(os.environ.get("EXPO", "-0.45"))
r.use_persistent_data = True

if args.save:
    bpy.ops.wm.save_as_mainfile(filepath=args.save)

if os.environ.get("PROBE"):
    from bpy_extras.object_utils import world_to_camera_view
    dg = bpy.context.evaluated_depsgraph_get()
    for fr in [int(x) for x in os.environ["PROBE"].split(",")]:
        scene.frame_set(fr)
        dg = bpy.context.evaluated_depsgraph_get()
        out = []
        for ob in (doc, card):
            ev = ob.evaluated_get(dg)
            m = ev.to_mesh()
            pts = [world_to_camera_view(scene, cam, ob.matrix_world @ v.co) for v in m.vertices]
            out.append((ob.name, round(min(p.x for p in pts), 2), round(max(p.x for p in pts), 2), round(min(p.y for p in pts), 2), round(max(p.y for p in pts), 2)))
            ev.to_mesh_clear()
        print("PROBE", fr, out)
    sys.exit(0)
os.makedirs(args.out, exist_ok=True)
frames = [int(x) for x in args.frames.split(",")] if "," in args.frames else range(int(args.frames.split("-")[0]), int(args.frames.split("-")[1]) + 1)
for fr in frames:
    path = os.path.join(args.out, f"{fr:04d}.png")
    if os.path.exists(path):
        continue
    scene.frame_set(fr)
    r.filepath = path
    bpy.ops.render.render(write_still=True)
    print("FRAME", fr, flush=True)
