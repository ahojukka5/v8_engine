import { V8Engine } from './v8-engine.js';

const ALWAYS_REMOVE = new Set([
  'block-to-mount bolted ground straps',
  'resolved flush engine ground straps',
  'bolted ground-strap eye',
  'ground-strap retaining bolt',
  'flush ground-strap lug',
  'ground-terminal machined seat',
  'flush ground-terminal fastener',
  'rerouted supported dry sump oil circuit',
  'tangent-aligned hose ferrule',
  'supported fitting hex',
  'supported fitting neck',
  'captured fitting collar',
  'side-mounted dry sump drain plug',
  'drain plug machined seat',
  'captured drain plug washer',
  'low-profile drain plug hex',
  'piston cooling oil jet',
  'oil jet banjo base',
  'oil jet nozzle',
  'dry sump scavenge port',
  'scavenge port boss',
  'scavenge port bore',
]);

const EXPLODED_HIDE_NAMES = new Set([
  'complete external dry sump lubrication circuit',
  'starter charging grounds and sensor electrical distribution',
  'fuel feed return regulator and manifold vacuum detail',
  'thermostat housing crossover and coolant service detail',
  'left engine mount bracket',
  'right engine mount bracket',
]);

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

function removeResidualServiceFragments(engine) {
  const matches = [];
  engine.root.traverse((object) => {
    const name = object.name.toLowerCase();
    if (
      name.includes('ground strap')
      || name.includes('ground-strap')
      || name.includes('hose ferrule')
      || name.includes('fitting collar')
      || name.includes('drain plug')
      || name.includes('oil jet')
    ) {
      matches.push(object);
    }
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

function reparentOilPanHardware(engine) {
  const oilPan = engine.root.getObjectByName('ribbed dry sump pan');
  if (!oilPan) return;

  const hardware = [];
  engine.root.traverse((object) => {
    if (object.name === 'oil pan rail bolt') hardware.push(object);
  });

  engine.root.updateMatrixWorld(true);
  oilPan.updateMatrixWorld(true);
  for (const object of hardware) {
    if (object.parent !== oilPan) oilPan.attach(object);
  }
}

function collectExplodedHideObjects(engine) {
  const objects = [];
  engine.root.traverse((object) => {
    if (EXPLODED_HIDE_NAMES.has(object.name)) objects.push(object);
  });
  engine.userData.explodedHideObjects = objects;
}

function updateExplodedVisibility(engine, amount) {
  const visible = amount < 0.02;
  for (const object of engine.userData.explodedHideObjects ?? []) {
    if (object.parent) object.visible = visible;
  }
}

function applyFinalArtifactSweep(engine) {
  if (engine.root.userData.finalArtifactSweepApplied) return;
  engine.root.userData.finalArtifactSweepApplied = true;

  removeNamedSubtrees(engine, ALWAYS_REMOVE);
  removeResidualServiceFragments(engine);
  reparentOilPanHardware(engine);
  collectExplodedHideObjects(engine);
}

const originalUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function finalArtifactResolvedUpdate(...args) {
  const result = originalUpdate.apply(this, args);
  applyFinalArtifactSweep(this);
  updateExplodedVisibility(this, this.userData.lastExplodedAmount ?? 0);
  return result;
};

const originalSetExploded = V8Engine.prototype.setExploded;
V8Engine.prototype.setExploded = function attachmentAwareSetExploded(amount) {
  applyFinalArtifactSweep(this);
  this.userData.lastExplodedAmount = Number(amount) || 0;
  const result = originalSetExploded.call(this, amount);
  updateExplodedVisibility(this, this.userData.lastExplodedAmount);
  return result;
};
