import * as THREE from 'three';
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
const BANK_ANGLE = 45 * DEG;
const CRANK_Y = -1.55;
const CYLINDER_X = [-3.3, -1.1, 1.1, 3.3];

const DETAILS = {
  ignition: {
    system: 'IGNITION',
    name: 'Sealed coil-on-plug module',
    material: 'Glass-filled polymer / silicone / copper',
    function: 'Delivers high voltage through a sealed plug well without intersecting the cam cover.',
    description: 'Compact coils now sit above molded plug-well collars. Boots and spark plugs remain below the cover skin instead of protruding through it.',
  },
  cover: {
    system: 'VALVETRAIN',
    name: 'Cam-cover service details',
    material: 'Powder-coated aluminum / molded elastomer',
    function: 'Seals the valvetrain and provides service, ventilation and sensor interfaces.',
    description: 'Perimeter gasket seams, plug-well collars, oil filler, PCV fittings and cam-position sensors add scale and credible packaging.',
  },
  intake: {
    system: 'INTAKE',
    name: 'Intake instrumentation and fastening',
    material: 'Aluminum / polymer / stainless steel',
    function: 'Measures manifold conditions and secures the plenum, rails and throttle hardware.',
    description: 'Plenum fasteners, pressure and air-temperature sensors, injector looms, rail feed hardware and throttle details complete the intake assembly.',
  },
  exhaust: {
    system: 'EXHAUST',
    name: 'Header flange and weld details',
    material: 'Stainless steel / Inconel hardware',
    function: 'Clamps and seals the primary tubes while supporting instrumentation and thermal movement.',
    description: 'Port studs, nuts, weld beads, collector bands and support brackets make the tubular headers read as an assembled fabricated system.',
  },
  lubrication: {
    system: 'LUBRICATION',
    name: 'Lubrication service hardware',
    material: 'Steel / aluminum / copper sealing washer',
    function: 'Seals the lower crankcase and provides drain, pressure and identification interfaces.',
    description: 'Oil-pan perimeter bolts, drain plug, pressure sender and cast identification plate increase service-level detail.',
  },
  flywheel: {
    system: 'OUTPUT',
    name: 'Flywheel ring gear and fasteners',
    material: 'Hardened steel',
    function: 'Provides a positive starter engagement and clamps the flywheel to the crank flange.',
    description: 'Individual ring-gear teeth, crank bolts and timing witness marks replace the smooth symbolic outer ring.',
  },
  accessories: {
    system: 'ACCESSORIES',
    name: 'Accessory brackets and service connections',
    material: 'Aluminum / steel / reinforced hose',
    function: 'Supports the front drive and connects charging and coolant circuits.',
    description: 'Timing-cover bolts, pulley retainers, alternator terminals, water outlet, clamps and structural brackets add mechanical density.',
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
    const overlay = createWireOverlay(mesh, 0.1);
    if (overlay) engine.wireOverlays.push(overlay);
  }
}

function addInspectable(engine, parent, object, metadata) {
  registerPart(object, metadata, engine.pickables);
  prepareMeshes(engine, object);
  parent.add(object);
  return object;
}

function hideLegacyWiring(engine) {
  engine.root.traverse((object) => {
    if (object.name === 'engine wiring spine' || object.name === 'ignition harness branch') {
      object.visible = false;
      object.userData.replacedByDetailPass = true;
    }
  });
}

function addCamCoverDetails(engine) {
  const m = engine.materials;

  for (const side of [1, -1]) {
    const sign = side > 0 ? 'left' : 'right';
    const headAssembly = engine.root.getObjectByName(`${sign} cylinder head assembly`);
    if (!headAssembly) continue;

    const q = bankQuaternion(side);
    const detailGroup = new THREE.Group();
    detailGroup.name = `${sign} cam cover detail pack`;

    for (const lateral of [-0.78, 0.78]) {
      const seam = roundedBox('cam cover perimeter gasket seam', new THREE.Vector3(8.45, 0.035, 0.035), 0.014, m.rubber, 2);
      seam.position.copy(pointOnBank(0, side, 5.015, lateral));
      seam.quaternion.copy(q);
      detailGroup.add(seam);
    }
    for (const x of [-4.22, 4.22]) {
      const seam = roundedBox('cam cover end gasket seam', new THREE.Vector3(0.035, 0.035, 1.55), 0.014, m.rubber, 2);
      seam.position.copy(pointOnBank(x, side, 5.015, 0));
      seam.quaternion.copy(q);
      detailGroup.add(seam);
    }

    CYLINDER_X.forEach((x, index) => {
      const legacyCoil = engine.root.getObjectByName(`coil-on-plug ${sign} ${index + 1}`);
      if (legacyCoil) {
        const removedMeshes = new Set();
        legacyCoil.traverse((child) => { if (child.isMesh) removedMeshes.add(child); });
        engine.pickables = engine.pickables.filter((mesh) => !removedMeshes.has(mesh));
        for (const child of [...legacyCoil.children]) legacyCoil.remove(child);

        const wellSeal = cylinder('plug-well sealing grommet', 0.145, 0.145, 0.075, 28, m.rubber);
        wellSeal.position.y = 0.15;
        const collar = torus('plug-well collar', 0.15, 0.027, 8, 32, m.machinedSteel, 'y');
        collar.position.y = 0.19;
        const boot = cylinder('contained ignition boot', 0.073, 0.082, 0.36, 18, m.rubber);
        boot.position.y = -0.075;
        const body = roundedBox('compact ignition coil body', new THREE.Vector3(0.38, 0.27, 0.31), 0.075, m.satinBlack);
        body.position.y = 0.38;
        const cap = roundedBox('coil top cap', new THREE.Vector3(0.31, 0.065, 0.25), 0.025, m.blackOxide, 3);
        cap.position.y = 0.545;
        const connector = roundedBox('coil electrical connector', new THREE.Vector3(0.18, 0.13, 0.17), 0.035, m.satinBlack, 3);
        connector.position.set(0, 0.42, side * 0.22);
        const lock = roundedBox('coil connector lock', new THREE.Vector3(0.09, 0.035, 0.08), 0.012, m.orangePaint, 2);
        lock.position.set(0, 0.46, side * 0.31);
        legacyCoil.add(wellSeal, collar, boot, body, cap, connector, lock);
        registerPart(legacyCoil, DETAILS.ignition, engine.pickables);
        prepareMeshes(engine, legacyCoil);
      }

      const collarBase = cylinder('molded plug-well boss', 0.205, 0.19, 0.09, 30, m.redPaint);
      collarBase.position.copy(pointOnBank(x, side, 5.075, 0.03));
      collarBase.quaternion.copy(q);
      detailGroup.add(collarBase);
    });

    const loomPoints = [-3.85, -2.3, -0.8, 0.8, 2.3, 3.85].map((x) => pointOnBank(x, side, 5.2, 0.83));
    detailGroup.add(tube(`${sign} bank braided wiring loom`, loomPoints, 0.055, m.hose, 58, 8));

    CYLINDER_X.forEach((x) => {
      detailGroup.add(tube('short coil harness branch', [
        pointOnBank(x, side, 5.2, 0.83),
        pointOnBank(x, side, 5.29, 0.52),
        pointOnBank(x, side, 5.31, 0.26),
      ], 0.022, m.hose, 16, 6));
      const clip = torus('wiring loom retaining clip', 0.075, 0.017, 7, 24, m.machinedSteel, 'x');
      clip.position.copy(pointOnBank(x, side, 5.2, 0.83));
      detailGroup.add(clip);
    });

    if (side > 0) {
      const filler = new THREE.Group();
      filler.name = 'oil filler cap assembly';
      filler.position.copy(pointOnBank(3.25, side, 5.19, -0.45));
      filler.quaternion.copy(q);
      const neck = cylinder('oil filler neck', 0.22, 0.22, 0.16, 32, m.blackOxide);
      const cap = cylinder('knurled oil filler cap', 0.29, 0.29, 0.13, 32, m.satinBlack);
      cap.position.y = 0.14;
      filler.add(neck, cap);
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        const rib = roundedBox('oil cap grip rib', new THREE.Vector3(0.055, 0.15, 0.055), 0.015, m.blackOxide, 2);
        rib.position.set(Math.cos(angle) * 0.29, 0.14, Math.sin(angle) * 0.29);
        filler.add(rib);
      }
      detailGroup.add(filler);
    }

    const pcv = new THREE.Group();
    pcv.name = `${sign} PCV fitting`;
    pcv.position.copy(pointOnBank(2.35, side, 5.17, 0.59));
    pcv.quaternion.copy(q);
    const pcvBase = cylinder('PCV grommet', 0.13, 0.13, 0.09, 24, m.rubber);
    const pcvElbow = tube('PCV elbow', [
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, 0.22, side * 0.03),
      new THREE.Vector3(-0.16, 0.31, side * 0.12),
    ], 0.055, m.satinBlack, 18, 8);
    pcv.add(pcvBase, pcvElbow);
    detailGroup.add(pcv);

    const camSensor = new THREE.Group();
    camSensor.name = `${sign} cam position sensor`;
    camSensor.position.copy(pointOnBank(4.22, side, 4.94, 0.55));
    camSensor.quaternion.copy(q);
    const sensorBody = cylinder('cam sensor body', 0.11, 0.11, 0.28, 24, m.satinBlack);
    sensorBody.rotation.z = Math.PI / 2;
    const sensorConnector = roundedBox('cam sensor connector', new THREE.Vector3(0.2, 0.14, 0.16), 0.035, m.satinBlack, 3);
    sensorConnector.position.x = 0.2;
    camSensor.add(sensorBody, sensorConnector);
    detailGroup.add(camSensor);

    addInspectable(engine, headAssembly, detailGroup, DETAILS.cover);
  }
}

function addIntakeDetails(engine) {
  const m = engine.materials;
  const intake = engine.root.getObjectByName('complete intake system');
  if (!intake) return;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'intake service and instrumentation details';

  for (const z of [-0.59, 0.59]) {
    for (const x of [-2.65, -1.35, 0, 1.35, 2.65]) {
      const fastener = bolt('plenum top fastener', 0.12, 0.06, m.machinedSteel);
      fastener.position.set(x + 0.2, 3.74, z);
      detailGroup.add(fastener);
    }
  }

  const mapSensor = new THREE.Group();
  mapSensor.name = 'manifold absolute pressure sensor';
  mapSensor.position.set(2.65, 3.76, 0.38);
  const mapBody = roundedBox('MAP sensor body', new THREE.Vector3(0.44, 0.18, 0.3), 0.055, m.satinBlack);
  const mapPort = cylinder('MAP pressure port', 0.045, 0.045, 0.2, 16, m.blackOxide);
  mapPort.position.y = -0.16;
  const mapConnector = roundedBox('MAP connector', new THREE.Vector3(0.2, 0.14, 0.22), 0.035, m.satinBlack);
  mapConnector.position.x = 0.29;
  mapSensor.add(mapBody, mapPort, mapConnector);
  detailGroup.add(mapSensor);

  const iatSensor = new THREE.Group();
  iatSensor.name = 'intake air temperature sensor';
  iatSensor.position.set(-2.3, 3.74, -0.34);
  const iatBody = cylinder('IAT sensor body', 0.08, 0.08, 0.26, 20, m.satinBlack);
  const iatHex = cylinder('IAT sensor hex', 0.12, 0.12, 0.08, 6, m.machinedSteel);
  iatHex.position.y = -0.12;
  iatSensor.add(iatBody, iatHex);
  detailGroup.add(iatSensor);

  for (const side of [1, -1]) {
    detailGroup.add(tube('injector harness rail', [
      new THREE.Vector3(-3.6, 2.88, side * 1.34),
      new THREE.Vector3(-1.8, 2.95, side * 1.38),
      new THREE.Vector3(0, 2.96, side * 1.4),
      new THREE.Vector3(1.8, 2.95, side * 1.38),
      new THREE.Vector3(3.6, 2.88, side * 1.34),
    ], 0.035, m.hose, 46, 7));

    CYLINDER_X.forEach((x) => {
      detailGroup.add(tube('injector connector lead', [
        new THREE.Vector3(x, 2.94, side * 1.38),
        new THREE.Vector3(x, 2.78, side * 1.28),
        new THREE.Vector3(x, 2.63, side * 1.18),
      ], 0.017, m.hose, 12, 6));
    });

    const feed = new THREE.Group();
    feed.name = `${side > 0 ? 'left' : 'right'} fuel rail feed`;
    feed.position.set(-4.1, 2.68, side * 1.2);
    const fitting = cylinder('AN fuel fitting', 0.13, 0.13, 0.24, 6, m.machinedSteel, 'x');
    const collar = torus('fuel fitting collar', 0.14, 0.025, 7, 24, m.redPaint, 'x');
    collar.position.x = -0.12;
    feed.add(fitting, collar);
    detailGroup.add(feed);
  }

  const throttleShaft = cylinder('throttle shaft end', 0.11, 0.11, 1.48, 24, m.machinedSteel, 'z');
  throttleShaft.position.set(-3.98, 3.15, 0);
  const throttleConnector = roundedBox('throttle motor connector', new THREE.Vector3(0.28, 0.22, 0.24), 0.055, m.satinBlack);
  throttleConnector.position.set(-4.0, 3.42, -0.81);
  detailGroup.add(throttleShaft, throttleConnector);

  addInspectable(engine, intake, detailGroup, DETAILS.intake);
}

function addExhaustDetails(engine) {
  const m = engine.materials;
  const exhaust = engine.root.getObjectByName('equal-length exhaust header system');
  if (!exhaust) return;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'header studs welds and supports';

  for (const side of [1, -1]) {
    const q = bankQuaternion(side);
    CYLINDER_X.forEach((x) => {
      const port = pointOnBank(x, side, 4.0, 1.0);
      for (const dx of [-0.2, 0.2]) {
        const stud = bolt('exhaust flange stud and nut', 0.2, 0.055, m.machinedSteel);
        stud.position.copy(port).add(new THREE.Vector3(dx, 0, side * 0.08));
        stud.quaternion.copy(q);
        detailGroup.add(stud);
      }
      const weld = torus('primary tube TIG weld bead', 0.115, 0.018, 7, 28, m.exhaustHot, 'y');
      weld.position.copy(port).addScaledVector(bankVector(side), -0.08);
      weld.quaternion.premultiply(q);
      detailGroup.add(weld);
    });

    for (const x of [3.62, 3.92, 4.22]) {
      const weldBand = torus('collector weld bead', 0.39 + (x - 3.92) * 0.12, 0.018, 7, 32, m.exhaustHot, 'x');
      weldBand.position.set(x, -1.72, side * 2.64);
      detailGroup.add(weldBand);
    }

    const support = roundedBox('header support bracket', new THREE.Vector3(0.18, 1.05, 0.16), 0.05, m.darkSteel, 3);
    support.position.set(3.35, -0.95, side * 2.45);
    support.rotation.x = side * 12 * DEG;
    detailGroup.add(support);
  }

  addInspectable(engine, exhaust, detailGroup, DETAILS.exhaust);
}

function addStructureDetails(engine) {
  const m = engine.materials;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'block lubrication and service details';

  for (const z of [-1.43, 1.43]) {
    for (const x of [-4, -3, -2, -1, 0, 1, 2, 3, 4]) {
      const panBolt = bolt('oil pan rail bolt', 0.17, 0.055, m.machinedSteel);
      panBolt.position.set(x, -2.52, z);
      panBolt.rotation.x = Math.PI;
      detailGroup.add(panBolt);
    }
  }

  const drain = new THREE.Group();
  drain.name = 'magnetic oil drain plug';
  drain.position.set(3.15, -3.22, 0.92);
  drain.rotation.x = Math.PI / 2;
  const drainHex = cylinder('drain plug hex', 0.14, 0.14, 0.12, 6, m.machinedSteel);
  const washer = torus('drain plug copper washer', 0.15, 0.022, 8, 28, m.copper, 'y');
  washer.position.y = -0.08;
  drain.add(drainHex, washer);
  detailGroup.add(drain);

  const sender = new THREE.Group();
  sender.name = 'oil pressure sender';
  sender.position.set(-1.7, -1.35, -1.76);
  sender.rotation.x = Math.PI / 2;
  const senderHex = cylinder('oil sender hex', 0.13, 0.13, 0.12, 6, m.machinedSteel);
  const senderBody = cylinder('oil sender body', 0.11, 0.11, 0.34, 22, m.satinBlack);
  senderBody.position.y = 0.22;
  sender.add(senderHex, senderBody);
  detailGroup.add(sender);

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const bellBolt = bolt('bellhousing flange bolt', 0.26, 0.065, m.machinedSteel);
    bellBolt.rotation.z = Math.PI / 2;
    bellBolt.position.set(5.08, CRANK_Y + Math.cos(angle) * 1.67, Math.sin(angle) * 1.67);
    detailGroup.add(bellBolt);
  }

  addInspectable(engine, engine.systems.structure, detailGroup, DETAILS.lubrication);
}

function addFlywheelDetails(engine) {
  const m = engine.materials;
  const flywheel = engine.root.getObjectByName('flywheel assembly');
  if (!flywheel) return;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'flywheel tooth and bolt detail';

  const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.16, 0.07), m.machinedSteel, 72);
  teeth.name = 'individual starter ring gear teeth';
  teeth.castShadow = true;
  teeth.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 72; i += 1) {
    const angle = (i / 72) * Math.PI * 2;
    position.set(0, Math.cos(angle) * 1.79, Math.sin(angle) * 1.79);
    quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
    matrix.compose(position, quaternion, scale);
    teeth.setMatrixAt(i, matrix);
  }
  detailGroup.add(teeth);

  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const crankBolt = bolt('flywheel crank bolt', 0.22, 0.075, m.machinedSteel);
    crankBolt.rotation.z = Math.PI / 2;
    crankBolt.position.set(-0.22, Math.cos(angle) * 0.5, Math.sin(angle) * 0.5);
    detailGroup.add(crankBolt);
  }

  addInspectable(engine, flywheel, detailGroup, DETAILS.flywheel);
}

function addAccessoryDetails(engine) {
  const m = engine.materials;
  const front = engine.root.getObjectByName('front accessory drive');
  if (!front) return;
  const detailGroup = new THREE.Group();
  detailGroup.name = 'front drive fasteners brackets and connections';

  for (const y of [-1.65, -0.95, -0.25, 0.45, 1.15]) {
    for (const z of [-1.25, 1.25]) {
      const coverBolt = bolt('timing cover perimeter bolt', 0.19, 0.055, m.machinedSteel);
      coverBolt.rotation.z = Math.PI / 2;
      coverBolt.position.set(-0.31, y, z);
      detailGroup.add(coverBolt);
    }
  }

  for (const [y, z] of [[-1.55, 0], [0.08, 0], [0.55, 1.28], [1.18, -0.85], [-0.15, -1.35]]) {
    const centerBolt = bolt('pulley center retainer', 0.28, 0.09, m.machinedSteel);
    centerBolt.rotation.z = Math.PI / 2;
    centerBolt.position.set(-0.54, y, z);
    detailGroup.add(centerBolt);
  }

  const terminal = new THREE.Group();
  terminal.name = 'alternator B+ terminal';
  terminal.position.set(-0.05, 0.92, 1.93);
  const post = cylinder('alternator output post', 0.065, 0.065, 0.22, 18, m.copper);
  const nut = cylinder('alternator terminal nut', 0.105, 0.105, 0.08, 6, m.machinedSteel);
  nut.position.y = 0.13;
  terminal.add(post, nut);
  detailGroup.add(terminal);

  detailGroup.add(tube('alternator charge cable', [
    new THREE.Vector3(-0.05, 1.04, 1.93),
    new THREE.Vector3(0.25, 1.35, 2.0),
    new THREE.Vector3(1.3, 1.5, 1.75),
    new THREE.Vector3(2.2, 1.25, 1.55),
  ], 0.04, m.hose, 34, 8));

  const outlet = cylinder('water pump outlet neck', 0.2, 0.2, 0.5, 28, m.aluminum, 'z');
  outlet.position.set(-0.05, 0.48, -0.6);
  detailGroup.add(outlet);
  const clamp = torus('coolant hose clamp', 0.22, 0.028, 8, 36, m.chrome, 'z');
  clamp.position.set(-0.05, 0.48, -0.87);
  detailGroup.add(clamp);
  detailGroup.add(tube('formed upper coolant hose', [
    new THREE.Vector3(-0.05, 0.48, -0.88),
    new THREE.Vector3(0.35, 0.78, -1.35),
    new THREE.Vector3(1.1, 1.12, -1.58),
    new THREE.Vector3(2.25, 1.15, -1.72),
  ], 0.17, m.blueHose, 42, 12));

  addInspectable(engine, front, detailGroup, DETAILS.accessories);
}

export function applyDetailPass(engine) {
  hideLegacyWiring(engine);
  addCamCoverDetails(engine);
  addIntakeDetails(engine);
  addExhaustDetails(engine);
  addStructureDetails(engine);
  addFlywheelDetails(engine);
  addAccessoryDetails(engine);
}
