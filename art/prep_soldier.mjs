// prep_soldier.mjs — Quaternius "Character Soldier" (CC0) → art/models_raw/soldier/soldier_prep.glb
//   node art/prep_soldier.mjs      (run from the project root; TOOLKIT_DIR = a folder whose node_modules has @gltf-transform/core|extensions|functions, meshoptimizer, three, sharp)
// Drops the 14 built-in rigid weapons + shoulder pads (our guns are procedural pools that follow the hand bone) so the model
// is ONE skinned primitive (1 draw). Prints the attach transform of the original AK (local to bone Index1.R) for scene.js.
import { createRequire } from 'node:module'; import os from 'node:os'; import path from 'node:path';
const req = createRequire(path.join(process.env.TOOLKIT_DIR || process.cwd(), 'package.json'));
const { NodeIO } = req('@gltf-transform/core'), { ALL_EXTENSIONS } = req('@gltf-transform/extensions'), { MeshoptDecoder } = req('meshoptimizer');
const { prune } = req('@gltf-transform/functions'), THREE = req('three');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const IN = 'art/models_raw/soldier/character_soldier.glb', OUT = 'art/models_raw/soldier/soldier_prep.glb';
const doc = await io.read(IN), R = doc.getRoot(), f = (a) => a.map((v) => +v.toFixed(4));
const WEAPONS = ['Sniper', 'SMG', 'RocketLauncher', 'Revolver', 'Revolver_Small', 'Pistol', 'GrenadeLauncher', 'ShortCannon', 'Shotgun', 'Sniper_2', 'Shovel', 'Knife_2', 'Knife_1', 'AK', 'ShoulderPad.L', 'ShoulderPad.R'];
const ak = R.listNodes().find((n) => n.getName() === 'AK');
console.log('AK attach (bone Index1.R):', JSON.stringify({ t: f(ak.getTranslation()), q: f(ak.getRotation()), s: f(ak.getScale()) }));
for (const n of R.listNodes()) if (WEAPONS.includes(n.getName()) && n.getMesh()) { const m = n.getMesh(); n.setMesh(null); m.dispose(); n.dispose(); }
// weld the rigid head mesh into the skinned body: 100 % weight on joint Head, vertices moved into the body's skin space
// (bind pose: world = M_body · v_skin, so v_skin = M_body⁻¹ · M_headNode · v_head); then both nodes share one skin → model.mjs joins them (1 draw)
const body = R.listNodes().find((n) => n.getSkin()), skin = body.getSkin(), hj = skin.listJoints().findIndex((j) => j.getName() === 'Head');
const headNode = R.listNodes().find((n) => n.getMesh() && n.getMesh().getName() === 'Head' && !n.getSkin());
const M = new THREE.Matrix4().fromArray(headNode.getWorldMatrix()), Mb = new THREE.Matrix4().fromArray(body.getWorldMatrix()), T = Mb.clone().invert().multiply(M), N = new THREE.Matrix3().getNormalMatrix(T);
const refJ = body.getMesh().listPrimitives()[0].getAttribute('JOINTS_0').getArray(), v = new THREE.Vector3();
for (const p of headNode.getMesh().listPrimitives()) {
  const pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL'), n = pos.getCount(), pa = pos.getArray(), na = nor ? nor.getArray() : null;
  for (let i = 0; i < n; i++) { v.set(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]).applyMatrix4(T); pa.set([v.x, v.y, v.z], i * 3);
    if (na) { v.set(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]).applyMatrix3(N).normalize(); na.set([v.x, v.y, v.z], i * 3); } }
  pos.setArray(pa); if (nor) nor.setArray(na);
  const J = new refJ.constructor(n * 4), W = new Float32Array(n * 4); for (let i = 0; i < n; i++) { J[i * 4] = hj; W[i * 4] = 1; }
  p.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J)); p.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W));
}
headNode.setSkin(skin); body.getParentNode().addChild(headNode); headNode.setMatrix(body.getMatrix());
console.log('head welded to joint', hj, 'verts moved by', Mb.determinant() ? 'M_body⁻¹·M_head' : '?');
await doc.transform(prune());
await io.write(OUT, doc); console.log('wrote', OUT);
