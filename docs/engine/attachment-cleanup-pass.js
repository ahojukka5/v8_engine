import * as THREE from 'three';
import { V8Engine } from './v8-engine.js';
import {
  bolt,
  createWireOverlay,
  cylinder,
  registerPart,
  roundedBox,
  torus,
  tube,
} from './primitives.js';

const DEG = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const META = {
  casting: {
    system: 'STRUCTURE',
    name: 'Surface-mounted crankcase hardware',
    material: 'Compacted graphite iron / phosphate-coated steel',
    function: 'Stiffens and closes the crankcase without unsupported or floating geometry.',
    description: 'Shallow casting ribs, recessed core plugs and gallery closures are embedded into the crankcase skin with controlled proud height.',
  },
  lubrication: {
    system: 'LUBRICATION',
    name: 'Supported external oil plumbing',
    material: 'Braided PTFE / anodized aluminum / steel brackets',
    function: 'Connects the dry-sump pump, cooler, filter and sump through mechanically supported ports.',
    description: 'Oil lines terminate in tangent-aligned ferrules at real component ports. Rail-mounted clamps replace fittings and rings that previously appeared suspended in space.',
  },
  electrical: {
    system: 'ELECTRICAL',
    name: 'Bolted engine ground straps',
    material: 'Braided copper / plated steel',
    function: 'Bonds the crankcase to both engine-mount sleeves.',
    description: 'Each strap now runs between a block boss and a mount bushing, with both eye terminals clamped by visible fasteners.',
  },
  service: {
    system: 'LUBRICATION',
    name: 'Side-mounted dry-sump service plug',
    material: 'Steel / copper sealing washer',
    function: 'Provides a drain and inspection point without hanging below the oil pan.',
    description: 'The incorrectly rotated hanging drain fitting is replaced by a low-profile plug seated directly in the dry-sump side wall.',
  },
};

function collectSubtree(root) {
  const objects = new Set();
  root.traverse((object) => objects.add(object));
  return objects;
}

function removeSubtree(engine, object) {
  if (!object?.parent) return;
  const objects = collectSubtree(object);
  object.parent.remove(object);
  engine.pickables = engine.pickables.filter((item) => !objects.has(item));
  engine.wireOverlays = engine.wireOverlays.filter((item) => !objects.has(item));
}

function removeObjectsNamed(engine, names) {
  const matches = [];
  engine.root.traverse((object) => {
    if (names.has(object.name)) matches.push(object);
  });
  for (const object of matches) removeSubtree(engine, object);
}

function removeLegacyFittings(engine) {
  const parents = new Set();
  engine.root.traverse((object) => {
    if (object.name === 'AN fitting hex' || object.name === 'AN fitting neck' || object.name === 'AN fitting collar') {
      if (object.parent) parents.add(object.parent);
    }
  });
  for (const parent of parents) removeSubtree(engine, parent);
}

function prepareMeshes(engine, object) {
  const meshes = [];
  object.traverse((child) => {
    if (!child.isMesh || child.isInstancedMesh || child.userData.isWireOverlay) return;
    child.castShadow = true;
    child.receiveShadow = true;
    meshes.push(child);
  });
  for (const mesh of meshes) {
    const overlay = createWireOverlay(mesh, 0.07);
    if (overlay) engine.wireOverlays.push(overlay);
  }
}

function addInspectable(engine, parent, object, metadata) {
  registerPart(object, metadata, engine.pickables);
  prepareMeshes(engine, object);
  parent.add(object);
  return object;
}

function addAttachedCastingHardware(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'integrated crankcase ribs and flush closures';

  for (const side of [-1, 1]) {
    for (const x of [-3.75, -2.55, -1.3, 0, 1.3, 2.55, 3.75]) {
      const rib = roundedBox(
        'integrated crankcase casting rib',
        new THREE.Vector3(0.14, 1.08, 0.11),
        0.04,
        m.castIronDark,
        2,
      );
      rib.position.set(x, -1.18, side * 1.555);
      rib.rotation.x = side * 5 * DEG;
      detail.add(rib);

      for (const y of [-1.70, -0.66]) {
        const foot = roundedBox(
          'casting rib blended foot',
          new THREE.Vector3(0.28, 0.16, 0.12),
          0.045,
          m.castIronDark,
          2,
        );
        foot.position.set(x, y, side * 1.55);
        detail.add(foot);
      }
    }

    for (const x of [-4.05, -2.2, 0, 2.2, 4.05]) {
      const recess = cylinder('integrated core-plug recess', 0.17, 0.17, 0.055, 30, m.castIronDark, 'z');
      recess.position.set(x, -0.48, side * 1.555);
      detail.add(recess);

      const plug = cylinder('flush seated core plug', 0.125, 0.125, 0.032, 28, m.darkSteel, 'z');
      plug.position.set(x, -0.48, side * 1.584);
      detail.add(plug);
    }

    for (const x of [-3.2, -1.05, 1.05, 3.2]) {
      const boss = cylinder('integrated gallery boss', 0.16, 0.18, 0.055, 28, m.castIron, 'z');
      boss.position.set(x, -0.66, side * 1.555);
      detail.add(boss);

      const closure = cylinder('flush gallery closure', 0.085, 0.085, 0.035, 6, m.machinedSteel, 'z');
      closure.position.set(x, -0.66, side * 1.588);
      detail.add(closure);
    }
  }

  addInspectable(engine, engine.systems.structure, detail, META.casting);
}

function addFerrule(group, point, inwardDirection, radius, materials) {
  const direction = inwardDirection.clone().normalize();
  const fitting = new THREE.Group();
  fitting.name = 'tangent-aligned hose ferrule';
  fitting.position.copy(point);
  fitting.quaternion.setFromUnitVectors(Y_AXIS, direction);

  const hex = cylinder('supported fitting hex', radius * 1.45, radius * 1.45, radius * 1.35, 6, materials.orangePaint);
  hex.position.y = radius * 0.35;
  fitting.add(hex);

  const neck = cylinder('supported fitting neck', radius * 0.82, radius * 0.82, radius * 1.9, 20, materials.machinedSteel);
  neck.position.y = radius * 1.45;
  fitting.add(neck);

  const collar = torus('captured fitting collar', radius * 0.92, radius * 0.20, 8, 30, materials.redPaint, 'y');
  collar.position.y = radius * 2.15;
  fitting.add(collar);

  group.add(fitting);
}

function addSupportedOilCircuit(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'rerouted supported dry sump oil circuit';

  const sumpPort = new THREE.Group();
  sumpPort.name = 'dry sump scavenge port';
  sumpPort.position.set(1.65, -2.55, 1.30);
  const portBoss = cylinder('scavenge port boss', 0.14, 0.17, 0.12, 28, m.aluminum, 'z');
  const portBore = cylinder('scavenge port bore', 0.075, 0.075, 0.15, 20, m.darkSteel, 'z');
  portBore.position.z = 0.08;
  sumpPort.add(portBoss, portBore);
  detail.add(sumpPort);

  const lines = [
    [
      new THREE.Vector3(-3.35, -2.05, 1.95),
      new THREE.Vector3(-2.55, -2.45, 1.92),
      new THREE.Vector3(-0.9, -2.66, 1.64),
      new THREE.Vector3(1.65, -2.55, 1.30),
    ],
    [
      new THREE.Vector3(-4.10, -1.0, -2.15),
      new THREE.Vector3(-3.55, -1.35, -2.10),
      new THREE.Vector3(-3.15, -1.82, -1.97),
      new THREE.Vector3(-2.90, -2.10, -1.85),
    ],
    [
      new THREE.Vector3(-4.60, -1.0, -2.15),
      new THREE.Vector3(-4.82, -1.42, -1.78),
      new THREE.Vector3(-4.38, -1.92, -0.85),
      new THREE.Vector3(-3.75, -2.05, 1.72),
    ],
  ];

  for (const [index, points] of lines.entries()) {
    const radius = index === 0 ? 0.075 : 0.063;
    detail.add(tube(
      `supported braided oil ${index === 0 ? 'scavenge' : 'pressure'} line`,
      points,
      radius,
      m.hose,
      60,
      9,
    ));
    addFerrule(detail, points[0], points[1].clone().sub(points[0]), radius, m);
    addFerrule(detail, points.at(-1), points.at(-2).clone().sub(points.at(-1)), radius, m);
  }

  for (const [x, z] of [[-2.55, 1.72], [-0.85, 1.55], [0.85, 1.38]]) {
    const bracket = roundedBox('oil-line rail bracket', new THREE.Vector3(0.18, 0.28, 0.16), 0.045, m.darkSteel, 2);
    bracket.position.set(x, -2.48, z);
    detail.add(bracket);
    const clamp = torus('oil-line captured P-clamp', 0.10, 0.022, 8, 28, m.machinedSteel, 'z');
    clamp.position.set(x, -2.36, z);
    clamp.rotation.x = 18 * DEG;
    detail.add(clamp);
  }

  addInspectable(engine, engine.systems.accessories, detail, META.lubrication);
}

function addMountedGroundStraps(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'block-to-mount bolted ground straps';

  for (const side of [-1, 1]) {
    const blockPoint = new THREE.Vector3(1.8, -0.76, side * 1.59);
    const mountPoint = new THREE.Vector3(0.45, -0.60, side * 2.02);
    const midpoint = blockPoint.clone().lerp(mountPoint, 0.5).add(new THREE.Vector3(0, -0.10, 0));

    detail.add(tube(
      `${side > 0 ? 'left' : 'right'} mounted braided ground strap`,
      [blockPoint, midpoint, mountPoint],
      0.045,
      m.machinedSteel,
      32,
      8,
    ));

    for (const point of [blockPoint, mountPoint]) {
      const lug = torus('bolted ground-strap eye', 0.085, 0.025, 8, 28, m.copper, 'z');
      lug.position.copy(point);
      detail.add(lug);

      const fastener = bolt('ground-strap retaining bolt', 0.18, 0.055, m.machinedSteel);
      fastener.position.copy(point);
      fastener.rotation.x = Math.PI / 2;
      detail.add(fastener);
    }
  }

  addInspectable(engine, engine.systems.accessories, detail, META.electrical);
}

function addAttachedDrainPlug(engine) {
  const oilPan = engine.root.getObjectByName('ribbed dry sump pan');
  if (!oilPan) return;
  const m = engine.materials;
  const plug = new THREE.Group();
  plug.name = 'side-mounted dry sump drain plug';
  plug.position.set(3.05, -0.12, 1.26);

  const seat = cylinder('drain plug machined seat', 0.16, 0.16, 0.055, 28, m.darkSteel, 'z');
  seat.position.z = 0.02;
  plug.add(seat);

  const washer = torus('captured drain plug washer', 0.13, 0.020, 8, 28, m.copper, 'z');
  washer.position.z = 0.065;
  plug.add(washer);

  const hex = cylinder('low-profile drain plug hex', 0.105, 0.105, 0.10, 6, m.machinedSteel, 'z');
  hex.position.z = 0.10;
  plug.add(hex);

  addInspectable(engine, oilPan, plug, META.service);
}

function snapAncillaryDetailsToSurfaces(engine) {
  engine.root.traverse((object) => {
    if (object.name === 'engine serial identification plate') object.position.z = -1.60;
    if (object.name === 'serial plate rivet') object.position.z = -1.625;
    if (object.name === 'oil pressure sender') object.position.z = -1.61;
    if (object.name === 'lower harness fir-tree clip') object.position.z = -1.61;
  });
}

export function applyAttachmentCleanupPass(engine) {
  if (engine.root.userData.attachmentCleanupApplied) return;
  engine.root.userData.attachmentCleanupApplied = true;

  removeObjectsNamed(engine, new Set([
    'flush crankcase core and gallery plugs',
    'external crankcase casting rib',
    'machined block boss',
    'threaded oil gallery plug',
    'magnetic oil drain plug',
    'left braided ground strap',
    'right braided ground strap',
    'ground strap eye terminal',
    'braided oil scavenge line',
    'braided oil pressure line',
    'oil line P clamp',
  ]));
  removeLegacyFittings(engine);

  addAttachedCastingHardware(engine);
  addSupportedOilCircuit(engine);
  addMountedGroundStraps(engine);
  addAttachedDrainPlug(engine);
  snapAncillaryDetailsToSurfaces(engine);
}

const originalUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function attachmentResolvedUpdate(...args) {
  const result = originalUpdate.apply(this, args);
  applyAttachmentCleanupPass(this);
  return result;
};
