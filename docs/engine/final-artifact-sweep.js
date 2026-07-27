import * as THREE from 'three';
import { V8Engine } from './v8-engine.js';
import {
  bolt,
  createWireOverlay,
  cylinder,
  registerPart,
  roundedBox,
} from './primitives.js';

const X_AXIS = new THREE.Vector3(1, 0, 0);

const GROUND_METADATA = {
  system: 'ELECTRICAL',
  name: 'Surface-bonded engine ground straps',
  material: 'Laminated copper braid / plated steel',
  function: 'Bonds the crankcase to each engine-mount bracket without unsupported terminals.',
  description: 'Flat copper straps terminate in compact flush lugs. Each end is seated against a structural surface and retained by a visible fastener; no free-standing ring geometry remains.',
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

function removeNamedSubtrees(engine, names) {
  const matches = [];
  engine.root.traverse((object) => {
    if (names.has(object.name)) matches.push(object);
  });

  const matchSet = new Set(matches);
  const roots = matches.filter((object) => {
    let ancestor = object.parent;
    while (ancestor) {
      if (matchSet.has(ancestor)) return false;
      ancestor = ancestor.parent;
    }
    return true;
  });

  for (const object of roots) removeSubtree(engine, object);
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
    const overlay = createWireOverlay(mesh, 0.065);
    if (overlay) engine.wireOverlays.push(overlay);
  }
}

function addInspectable(engine, parent, object, metadata) {
  registerPart(object, metadata, engine.pickables);
  prepareMeshes(engine, object);
  parent.add(object);
  return object;
}

function addFlatMember(group, name, start, end, width, thickness, material) {
  const direction = end.clone().sub(start);
  const length = direction.length();
  const member = roundedBox(
    name,
    new THREE.Vector3(1, thickness, width),
    Math.min(thickness, width) * 0.42,
    material,
    3,
  );
  member.position.copy(start).add(end).multiplyScalar(0.5);
  member.quaternion.setFromUnitVectors(X_AXIS, direction.normalize());
  member.scale.x = length;
  group.add(member);
  return member;
}

function addFlushGroundTerminal(group, point, side, materials) {
  const lug = roundedBox(
    'flush ground-strap lug',
    new THREE.Vector3(0.28, 0.13, 0.035),
    0.025,
    materials.copper,
    3,
  );
  lug.position.copy(point);
  lug.position.z += side * 0.010;
  group.add(lug);

  const seat = cylinder(
    'ground-terminal machined seat',
    0.095,
    0.095,
    0.026,
    24,
    materials.darkSteel,
    'z',
  );
  seat.position.copy(point);
  seat.position.z += side * 0.020;
  group.add(seat);

  const fastener = bolt('flush ground-terminal fastener', 0.16, 0.050, materials.machinedSteel);
  fastener.position.copy(point);
  fastener.position.z += side * 0.055;
  fastener.rotation.x = side > 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(fastener);
}

function addResolvedGroundStraps(engine) {
  const materials = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'resolved flush engine ground straps';

  for (const side of [-1, 1]) {
    const blockPoint = new THREE.Vector3(1.72, -0.78, side * 1.585);
    const mountPoint = new THREE.Vector3(0.58, -0.68, side * 2.015);
    const bendPoint = blockPoint.clone().lerp(mountPoint, 0.52);
    bendPoint.y -= 0.08;
    bendPoint.z -= side * 0.025;

    addFlatMember(
      detail,
      `${side > 0 ? 'left' : 'right'} copper ground strap inboard leg`,
      blockPoint,
      bendPoint,
      0.105,
      0.024,
      materials.copper,
    );
    addFlatMember(
      detail,
      `${side > 0 ? 'left' : 'right'} copper ground strap outboard leg`,
      bendPoint,
      mountPoint,
      0.105,
      0.024,
      materials.copper,
    );

    addFlushGroundTerminal(detail, blockPoint, side, materials);
    addFlushGroundTerminal(detail, mountPoint, side, materials);
  }

  addInspectable(engine, engine.systems.accessories, detail, GROUND_METADATA);
}

function applyFinalArtifactSweep(engine) {
  if (engine.root.userData.finalArtifactSweepApplied) return;
  engine.root.userData.finalArtifactSweepApplied = true;

  removeNamedSubtrees(engine, new Set([
    'block-to-mount bolted ground straps',
    'bolted ground-strap eye',
    'ground-strap retaining bolt',
    'side-mounted dry sump drain plug',
    'drain plug machined seat',
    'captured drain plug washer',
    'low-profile drain plug hex',
    'piston cooling oil jet',
    'oil jet banjo base',
    'oil jet nozzle',
  ]));

  addResolvedGroundStraps(engine);
}

const originalUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function finalArtifactResolvedUpdate(...args) {
  const result = originalUpdate.apply(this, args);
  applyFinalArtifactSweep(this);
  return result;
};
