import * as THREE from 'three';
import { V8Engine } from './v8-engine.js';
import { applyMicroDetailPass } from './micro-detail-pass.js';
import {
  bolt,
  createWireOverlay,
  cylinder,
  registerPart,
  roundedBox,
  spring,
  torus,
  tube,
} from './primitives.js';

const DEG = Math.PI / 180;
const BANK_ANGLE = 45 * DEG;
const CRANK_Y = -1.55;
const CYLINDER_X = [-3.3, -1.1, 1.1, 3.3];
const MAX_VALVE_LIFT = 0.105;

const META = {
  valveTrain: {
    system: 'VALVETRAIN',
    name: 'Kinematically resolved valve spring assembly',
    material: 'Chrome-silicon spring steel / nitrided steel / titanium retainer',
    function: 'Keeps the valve train in contact while the retainer compresses the spring against a fixed seat.',
    description: 'The valve, bucket, retainer and keepers now move independently inside a fixed guide. Inner and outer springs shorten about a stationary lower seat instead of the complete assembly translating through the cylinder head.',
  },
  camDrive: {
    system: 'VALVETRAIN',
    name: 'DOHC timing drive and cam bearing hardware',
    material: 'Hardened steel / aluminum / polymer guide material',
    function: 'Drives the four camshafts at half crankshaft speed and retains them in line-bored journals.',
    description: 'Four toothed cam sprockets, two chain paths, tensioning guides and bolted cam caps complete the front timing and upper bearing architecture.',
  },
  bottomEnd: {
    system: 'BOTTOM END',
    name: 'Windage control and piston cooling hardware',
    material: 'Stamped steel / aluminum / copper alloy',
    function: 'Separates the rotating crankshaft from drain-back oil and cools piston crowns.',
    description: 'A louvered windage tray, screened pickup, crank scraper, main-cap fasteners and eight directed oil jets add credible detail below the cylinder banks.',
  },
  servicePlugs: {
    system: 'STRUCTURE',
    name: 'Flush crankcase service plugs',
    material: 'Phosphate-coated steel',
    function: 'Closes casting-core and gallery access bores without protruding from the crankcase wall.',
    description: 'The floating bronze discs are replaced by shallow recessed bosses and flush hex plugs located directly against the crankcase side surfaces.',
  },
};

function bankVector(side) {
  return new THREE.Vector3(0, Math.cos(BANK_ANGLE), side * Math.sin(BANK_ANGLE));
}

function bankQuaternion(side) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), side * BANK_ANGLE);
}

function pointOnBank(x, side, distance, lateral = 0) {
  const point = new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(bankVector(side), distance);
  point.z += side * lateral;
  return point;
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
    const overlay = createWireOverlay(mesh, 0.075);
    if (overlay) engine.wireOverlays.push(overlay);
  }
}

function addInspectable(engine, parent, object, metadata) {
  registerPart(object, metadata, engine.pickables);
  prepareMeshes(engine, object);
  parent.add(object);
  return object;
}

function hideFloatingLegacyGeometry(engine) {
  const hiddenNames = new Set(['core plug']);
  engine.root.traverse((object) => {
    if (!hiddenNames.has(object.name)) return;
    object.visible = false;
    object.userData.replacedByKinematicCleanup = true;
  });
}

function addFlushServicePlugs(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'flush crankcase core and gallery plugs';

  for (const side of [-1, 1]) {
    for (const x of [-4.05, -2.2, 0, 2.2, 4.05]) {
      const boss = cylinder('recessed core-plug boss', 0.22, 0.22, 0.055, 28, m.castIronDark, 'z');
      boss.position.set(x, -0.48, side * 1.605);
      detail.add(boss);

      const plug = cylinder('flush core plug', 0.16, 0.16, 0.045, 24, m.darkSteel, 'z');
      plug.position.set(x, -0.48, side * 1.64);
      detail.add(plug);

      const witness = roundedBox('core-plug witness mark', new THREE.Vector3(0.1, 0.018, 0.025), 0.008, m.machinedSteel, 1);
      witness.position.set(x, -0.48, side * 1.67);
      witness.rotation.z = side * 18 * DEG;
      detail.add(witness);
    }
  }

  addInspectable(engine, engine.systems.structure, detail, META.servicePlugs);
}

function findChild(group, name) {
  return group.children.find((child) => child.name === name) ?? group.getObjectByName(name);
}

function addResolvedValveKinematics(engine) {
  const m = engine.materials;
  engine.userData ??= {};
  engine.userData.resolvedValves = [];

  for (const valve of engine.valves) {
    const group = valve.object;
    const stem = findChild(group, 'valve stem');
    const head = findChild(group, 'valve head');
    const outerSpring = findChild(group, 'valve spring');
    const retainer = findChild(group, 'spring retainer');
    const bucket = findChild(group, 'cam follower');
    if (!stem || !head || !outerSpring || !retainer || !bucket) continue;

    const fixed = new THREE.Group();
    fixed.name = 'fixed valve guide and spring seat';

    const guide = cylinder('valve guide', 0.072, 0.072, 0.38, 20, m.bronze);
    guide.position.y = -0.30;
    fixed.add(guide);

    const lowerSeat = torus('lower spring seat', 0.135, 0.022, 8, 32, m.darkSteel, 'y');
    lowerSeat.position.y = -0.115;
    fixed.add(lowerSeat);

    const stemSeal = cylinder('valve stem seal', 0.075, 0.09, 0.12, 20, m.rubber);
    stemSeal.position.y = -0.055;
    fixed.add(stemSeal);
    group.add(fixed);

    const innerSpring = spring('inner valve spring', 0.078, 0.014, 0.44, 8.0, m.darkSteel, 82);
    innerSpring.position.y = 0.13;
    group.add(innerSpring);

    const shim = torus('bucket lash shim', 0.13, 0.018, 8, 28, m.machinedSteel, 'y');
    shim.position.y = 0.615;
    group.add(shim);

    const keepers = new THREE.Group();
    keepers.name = 'split valve keepers';
    for (const x of [-0.032, 0.032]) {
      const keeper = roundedBox('valve keeper half', new THREE.Vector3(0.045, 0.09, 0.055), 0.012, m.machinedSteel, 2);
      keeper.position.set(x, 0.455, 0);
      keeper.rotation.z = x < 0 ? -8 * DEG : 8 * DEG;
      keepers.add(keeper);
    }
    group.add(keepers);

    prepareMeshes(engine, fixed);
    prepareMeshes(engine, innerSpring);
    prepareMeshes(engine, shim);
    prepareMeshes(engine, keepers);

    engine.userData.resolvedValves.push({
      valve,
      group,
      stem,
      head,
      outerSpring,
      innerSpring,
      retainer,
      bucket,
      shim,
      keepers,
      basePosition: valve.basePosition.clone(),
      stemY: stem.position.y,
      headY: head.position.y,
      retainerY: retainer.position.y,
      bucketY: bucket.position.y,
      shimY: shim.position.y,
      keepersY: keepers.position.y,
      outerSpringY: outerSpring.position.y,
      innerSpringY: innerSpring.position.y,
      outerHeight: 0.52,
      innerHeight: 0.44,
    });
  }
}

function updateResolvedValves(engine) {
  const resolvedValves = engine.userData?.resolvedValves;
  if (!resolvedValves) return;

  for (const resolved of resolvedValves) {
    const {
      valve, group, stem, head, outerSpring, innerSpring, retainer, bucket, shim, keepers,
      basePosition, stemY, headY, retainerY, bucketY, shimY, keepersY,
      outerSpringY, innerSpringY, outerHeight, innerHeight,
    } = resolved;

    const lift = THREE.MathUtils.clamp(
      basePosition.clone().sub(group.position).dot(valve.n),
      0,
      MAX_VALVE_LIFT,
    );

    group.position.copy(basePosition);
    stem.position.y = stemY - lift;
    head.position.y = headY - lift;
    retainer.position.y = retainerY - lift;
    bucket.position.y = bucketY - lift;
    shim.position.y = shimY - lift;
    keepers.position.y = keepersY - lift;

    const outerHeightNow = Math.max(outerHeight * 0.66, outerHeight - lift);
    outerSpring.position.y = outerSpringY - lift * 0.5;
    outerSpring.scale.y = outerHeightNow / outerHeight;

    const innerHeightNow = Math.max(innerHeight * 0.62, innerHeight - lift);
    innerSpring.position.y = innerSpringY - lift * 0.5;
    innerSpring.scale.y = innerHeightNow / innerHeight;
  }
}

function createSprocket(engine, name, center, radius, toothCount) {
  const m = engine.materials;
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(center);

  const web = cylinder(`${name} web`, radius * 0.82, radius * 0.82, 0.13, 44, m.darkSteel, 'x');
  group.add(web);
  const rim = torus(`${name} rim`, radius, 0.055, 8, 54, m.machinedSteel, 'x');
  group.add(rim);
  const hub = cylinder(`${name} hub`, radius * 0.24, radius * 0.24, 0.22, 28, m.machinedSteel, 'x');
  group.add(hub);

  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.11, 0.075), m.machinedSteel, toothCount);
  teeth.name = `${name} teeth`;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < toothCount; i += 1) {
    const angle = (i / toothCount) * Math.PI * 2;
    position.set(0, Math.cos(angle) * (radius + 0.07), Math.sin(angle) * (radius + 0.07));
    quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    matrix.compose(position, quaternion, scale);
    teeth.setMatrixAt(i, matrix);
  }
  teeth.castShadow = true;
  teeth.receiveShadow = true;
  group.add(teeth);
  engine.userData.timingRotors.push(group);
  return group;
}

function addCamCapsAndTimingDrive(engine) {
  const m = engine.materials;
  engine.userData.timingRotors = [];
  const detail = new THREE.Group();
  detail.name = 'cam bearing caps timing sprockets chains and guides';

  for (const side of [-1, 1]) {
    const sign = side > 0 ? 'left' : 'right';
    const q = bankQuaternion(side);
    const headAssembly = engine.root.getObjectByName(`${sign} cylinder head assembly`);
    if (headAssembly) {
      const caps = new THREE.Group();
      caps.name = `${sign} cam bearing cap set`;
      for (const x of [-3.75, -2.45, -1.2, 0, 1.2, 2.45, 3.75]) {
        for (const lateral of [-0.48, 0.48]) {
          const cap = new THREE.Group();
          cap.position.copy(pointOnBank(x, side, 4.68, lateral));
          cap.quaternion.copy(q);
          const bridge = roundedBox('line-bored cam bearing cap', new THREE.Vector3(0.48, 0.13, 0.34), 0.045, m.aluminum, 3);
          cap.add(bridge);
          for (const dx of [-0.16, 0.16]) {
            const capBolt = bolt('cam cap bolt', 0.16, 0.045, m.machinedSteel);
            capBolt.position.set(dx, 0.10, 0);
            cap.add(capBolt);
          }
          caps.add(cap);
        }
      }
      addInspectable(engine, headAssembly, caps, META.camDrive);
    }

    const camCenters = [-0.48, 0.48].map((lateral) => pointOnBank(-4.58, side, 4.55, lateral));
    for (const [index, center] of camCenters.entries()) {
      detail.add(createSprocket(engine, `${sign} ${index === 0 ? 'intake' : 'exhaust'} cam sprocket`, center, 0.43, 28));
    }

    const crankCenter = new THREE.Vector3(-4.78, CRANK_Y, side * 0.12);
    const upperA = camCenters[0].clone();
    const upperB = camCenters[1].clone();
    detail.add(tube(`${sign} timing chain`, [
      crankCenter,
      new THREE.Vector3(-4.72, 0.25, side * 1.12),
      upperA,
      upperB,
      new THREE.Vector3(-4.72, 0.10, side * 1.4),
      crankCenter,
    ], 0.048, m.darkSteel, 72, 7, true));

    const fixedGuide = roundedBox(`${sign} fixed timing-chain guide`, new THREE.Vector3(0.13, 2.0, 0.16), 0.055, m.satinBlack);
    fixedGuide.position.set(-4.7, 0.55, side * 1.28);
    fixedGuide.rotation.x = side * 12 * DEG;
    detail.add(fixedGuide);

    const tensionGuide = roundedBox(`${sign} hydraulic tension guide`, new THREE.Vector3(0.13, 1.4, 0.17), 0.055, m.satinBlack);
    tensionGuide.position.set(-4.69, -0.15, side * 0.92);
    tensionGuide.rotation.x = side * -16 * DEG;
    detail.add(tensionGuide);

    const tensioner = cylinder(`${sign} timing-chain tensioner`, 0.12, 0.15, 0.48, 24, m.aluminum, 'z');
    tensioner.position.set(-4.68, -0.55, side * 1.18);
    detail.add(tensioner);
  }

  addInspectable(engine, engine.systems.valvetrain, detail, META.camDrive);
}

function updateTimingDrive(engine) {
  const rotors = engine.userData?.timingRotors;
  if (!rotors) return;
  rotors.forEach((rotor, index) => {
    rotor.rotation.x = engine.crankAngle * 0.5 + (index % 2) * Math.PI * 0.08;
  });
}

function addBottomEndDetail(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'windage tray oil pickup main fasteners and piston jets';

  const tray = roundedBox('louvered windage tray', new THREE.Vector3(7.9, 0.075, 2.0), 0.09, m.darkSteel, 3);
  tray.position.set(0, -2.30, 0);
  detail.add(tray);

  for (const [index, x] of [-3.25, -2.15, -1.05, 0.05, 1.15, 2.25, 3.35].entries()) {
    const louver = roundedBox('windage tray drain louver', new THREE.Vector3(0.58, 0.045, 0.34), 0.035, m.blackOxide, 2);
    louver.position.set(x, -2.245, index % 2 ? 0.48 : -0.48);
    louver.rotation.z = 12 * DEG;
    detail.add(louver);
  }

  const scraper = roundedBox('crankshaft windage scraper', new THREE.Vector3(8.1, 0.14, 0.10), 0.035, m.machinedSteel, 2);
  scraper.position.set(0, -1.88, 1.32);
  detail.add(scraper);

  const pickupPoints = [new THREE.Vector3(-2.8, -2.72, -0.9), new THREE.Vector3(-2.2, -2.48, -0.65), new THREE.Vector3(-1.55, -2.36, -0.35)];
  detail.add(tube('dry sump pickup neck', pickupPoints, 0.10, m.machinedSteel, 34, 10));
  const pickup = cylinder('screened oil pickup bell', 0.34, 0.25, 0.20, 32, m.darkSteel);
  pickup.position.copy(pickupPoints[0]).add(new THREE.Vector3(0, -0.10, 0));
  detail.add(pickup);
  const screen = torus('oil pickup screen rim', 0.30, 0.025, 8, 36, m.machinedSteel, 'y');
  screen.position.copy(pickup.position).add(new THREE.Vector3(0, -0.11, 0));
  detail.add(screen);

  for (const x of [-4.3, -2.15, 0, 2.15, 4.3]) {
    for (const z of [-0.56, 0.56]) {
      const nut = cylinder('main-cap stud nut', 0.10, 0.10, 0.10, 6, m.machinedSteel);
      nut.position.set(x, -2.43, z);
      detail.add(nut);
    }
  }

  for (const side of [-1, 1]) {
    for (const x of CYLINDER_X) {
      const jet = new THREE.Group();
      jet.name = 'piston cooling oil jet';
      jet.position.set(x, -1.55, side * 0.66);
      jet.add(cylinder('oil jet banjo base', 0.07, 0.07, 0.10, 18, m.bronze));
      jet.add(tube('oil jet nozzle', [new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0, 0.20, side * 0.04), new THREE.Vector3(0.05, 0.35, side * 0.10)], 0.018, m.copper, 16, 6));
      detail.add(jet);
    }
  }

  addInspectable(engine, engine.systems.structure, detail, META.bottomEnd);
}

export function applyKinematicCleanupPass(engine) {
  if (engine.root.userData.kinematicCleanupApplied) return;
  engine.root.userData.kinematicCleanupApplied = true;
  applyMicroDetailPass(engine);
  hideFloatingLegacyGeometry(engine);
  addFlushServicePlugs(engine);
  addResolvedValveKinematics(engine);
  addCamCapsAndTimingDrive(engine);
  addBottomEndDetail(engine);
}

const originalUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function kinematicallyResolvedUpdate(...args) {
  applyKinematicCleanupPass(this);
  const result = originalUpdate.apply(this, args);
  updateResolvedValves(this);
  updateTimingDrive(this);
  return result;
};
