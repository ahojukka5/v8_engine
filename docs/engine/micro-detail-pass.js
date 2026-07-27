import * as THREE from 'three';
import { V8Engine } from './v8-engine.js';
import {
  bolt,
  createWireOverlay,
  cylinder,
  registerPart,
  roundedBox,
  sphere,
  spring,
  torus,
  tube,
} from './primitives.js';

const DEG = Math.PI / 180;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const BANK_ANGLE = 45 * DEG;
const CRANK_Y = -1.55;
const CYLINDER_X = [-3.3, -1.1, 1.1, 3.3];

const META = {
  casting: {
    system: 'STRUCTURE',
    name: 'Block casting and mounting hardware',
    material: 'Compacted graphite iron / zinc-plated steel',
    function: 'Stiffens the crankcase and provides real mounting, sensing and service interfaces.',
    description: 'External ribs, machined bosses, engine mounts, knock sensors, gallery plugs and identification hardware break up the large symbolic block surfaces.',
  },
  lubrication: {
    system: 'LUBRICATION',
    name: 'Dry-sump oil circuit',
    material: 'Braided PTFE hose / anodized aluminum / stacked-plate cooler',
    function: 'Scavenges, filters and cools oil before returning it to the pressure galleries.',
    description: 'A compact oil cooler, pump manifold, AN fittings, braided pressure and scavenge lines, clamps and service ports form a readable lubrication circuit.',
  },
  cooling: {
    system: 'COOLING',
    name: 'Thermostat and coolant distribution circuit',
    material: 'Cast aluminum / reinforced silicone / stainless clamps',
    function: 'Routes coolant from the pump through both banks and regulates outlet temperature.',
    description: 'Thermostat housing, crossover hard line, temperature sender, formed hoses, beaded necks and clamps connect previously isolated cooling elements.',
  },
  fuel: {
    system: 'FUEL',
    name: 'Fuel feed, return and vacuum controls',
    material: 'Braided PTFE / anodized aluminum / reinforced polymer',
    function: 'Supplies regulated fuel and distributes manifold vacuum to engine controls.',
    description: 'Feed and return hoses, AN fittings, pressure regulator, vacuum manifold, check valves and clipped small-bore lines make the intake read as a complete installed system.',
  },
  electrical: {
    system: 'ELECTRICAL',
    name: 'Engine electrical distribution',
    material: 'Cross-linked copper cable / braided ground strap / sealed polymer connectors',
    function: 'Carries starter, charging, sensor and grounding currents around the assembly.',
    description: 'Starter cable, alternator branch, block grounds, junction box, loom clips and sensor pigtails connect the previously isolated electrical components.',
  },
  cover: {
    system: 'VALVETRAIN',
    name: 'Cam-cover structural and service detail',
    material: 'Powder-coated aluminum / elastomer / stainless hardware',
    function: 'Stiffens and seals the cover while supporting ignition and ventilation hardware.',
    description: 'Longitudinal ribs, perimeter fasteners, service bosses, harness retainers and compact lifting brackets add realistic scale without penetrating the cover skin.',
  },
  exhaust: {
    system: 'EXHAUST',
    name: 'Fabricated header hardware',
    material: 'Stainless steel / Inconel / formed aluminum heat shielding',
    function: 'Supports, seals and thermally manages the tubular exhaust system.',
    description: 'Slip joints, band clamps, EGT probes, wire clips, formed heat shields and collector springs make each bank read as a fabricated installed assembly.',
  },
  clutch: {
    system: 'OUTPUT',
    name: 'Flywheel and clutch pack',
    material: 'Forged steel / sintered friction material / spring steel',
    function: 'Stores energy and transmits crankshaft torque to the driveline.',
    description: 'A pilot bearing, friction face, pressure plate, diaphragm fingers, cover bolts and balance marks add depth to the previously flat flywheel face.',
  },
  accessory: {
    system: 'ACCESSORIES',
    name: 'Front-drive brackets and tensioning hardware',
    material: 'Cast aluminum / steel / EPDM',
    function: 'Locates accessories and maintains belt tension under dynamic load.',
    description: 'Triangulated brackets, tensioner spring housing, pulley retainers, timing marks and guard details make the front drive structurally plausible.',
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
    const overlay = createWireOverlay(mesh, 0.085);
    if (overlay) engine.wireOverlays.push(overlay);
  }
}

function addInspectable(engine, parent, object, metadata) {
  registerPart(object, metadata, engine.pickables);
  prepareMeshes(engine, object);
  parent.add(object);
  return object;
}

function orientPlateBetween(object, a, b, thickness = 0.12) {
  const direction = new THREE.Vector3().subVectors(b, a);
  object.position.copy(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5));
  object.scale.x = direction.length();
  object.scale.y = thickness;
  object.quaternion.setFromUnitVectors(X_AXIS, direction.normalize());
  return object;
}

function addHexFitting(group, position, rotation, materials, scale = 1) {
  const fitting = new THREE.Group();
  fitting.position.copy(position);
  fitting.rotation.set(rotation.x, rotation.y, rotation.z);
  const hex = cylinder('AN fitting hex', 0.12 * scale, 0.12 * scale, 0.16 * scale, 6, materials.orangePaint);
  const neck = cylinder('AN fitting neck', 0.075 * scale, 0.075 * scale, 0.22 * scale, 18, materials.machinedSteel);
  neck.position.y = 0.18 * scale;
  const collar = torus('AN fitting collar', 0.085 * scale, 0.022 * scale, 8, 28, materials.redPaint, 'y');
  collar.position.y = 0.29 * scale;
  fitting.add(hex, neck, collar);
  group.add(fitting);
  return fitting;
}

function addHoseClamp(group, position, radius, axis, materials) {
  const clamp = torus('worm-drive hose clamp', radius, 0.022, 7, 40, materials.chrome, axis);
  clamp.position.copy(position);
  group.add(clamp);
  const screw = roundedBox('hose clamp screw housing', new THREE.Vector3(0.16, 0.08, 0.1), 0.025, materials.machinedSteel, 2);
  screw.position.copy(position).add(new THREE.Vector3(0, radius + 0.03, 0));
  group.add(screw);
}

function hideOverscaleLegacyParts(engine) {
  engine.root.traverse((object) => {
    if (object.name === 'engine lift plate' || object.name === 'lifting eye') {
      object.visible = false;
      object.userData.replacedByMicroDetailPass = true;
    }
  });
}

function addCamCoverMicroDetails(engine) {
  const m = engine.materials;
  for (const side of [1, -1]) {
    const sign = side > 0 ? 'left' : 'right';
    const headAssembly = engine.root.getObjectByName(`${sign} cylinder head assembly`);
    if (!headAssembly) continue;
    const detail = new THREE.Group();
    detail.name = `${sign} cam cover second-stage detail`;
    const q = bankQuaternion(side);
    const n = bankVector(side);

    for (const lateral of [-0.56, 0, 0.56]) {
      const rib = roundedBox('cam cover longitudinal rib', new THREE.Vector3(7.55, 0.075, 0.09), 0.028, m.redPaint, 2);
      rib.position.copy(pointOnBank(0, side, 5.055, lateral));
      rib.quaternion.copy(q);
      detail.add(rib);
    }

    for (const x of [-4.15, -3.3, -2.2, -1.1, 0, 1.1, 2.2, 3.3, 4.15]) {
      for (const lateral of [-0.77, 0.77]) {
        const fastener = bolt('cam cover perimeter screw', 0.14, 0.052, m.machinedSteel);
        fastener.position.copy(pointOnBank(x, side, 5.08, lateral));
        fastener.quaternion.copy(q);
        detail.add(fastener);
      }
    }

    for (const x of CYLINDER_X) {
      const retainer = roundedBox('coil loom saddle', new THREE.Vector3(0.22, 0.13, 0.18), 0.045, m.satinBlack);
      retainer.position.copy(pointOnBank(x + 0.42, side, 5.14, -0.68));
      retainer.quaternion.copy(q);
      detail.add(retainer);
      const clip = torus('loom retaining clip', 0.09, 0.022, 7, 24, m.machinedSteel, 'y');
      clip.position.copy(pointOnBank(x + 0.42, side, 5.21, -0.68));
      clip.quaternion.copy(q);
      detail.add(clip);
    }

    const frontBracket = new THREE.Group();
    frontBracket.name = `${sign} front engine lifting bracket`;
    frontBracket.position.copy(pointOnBank(-4.0, side, 4.95, -0.48));
    frontBracket.quaternion.copy(q);
    const plate = roundedBox('lifting bracket plate', new THREE.Vector3(0.48, 0.5, 0.11), 0.07, m.darkSteel);
    plate.position.y = 0.14;
    const eye = torus('lifting bracket eye', 0.16, 0.055, 10, 30, m.machinedSteel, 'z');
    eye.position.y = 0.52;
    frontBracket.add(plate, eye);
    detail.add(frontBracket);

    const rearBracket = frontBracket.clone(true);
    rearBracket.name = `${sign} rear engine lifting bracket`;
    rearBracket.position.copy(pointOnBank(4.0, side, 4.95, 0.48));
    detail.add(rearBracket);

    const breatherBoss = cylinder('breather separator boss', 0.24, 0.28, 0.23, 28, m.redPaint);
    breatherBoss.position.copy(pointOnBank(2.9, side, 5.12, 0.42));
    breatherBoss.quaternion.copy(q);
    detail.add(breatherBoss);
    const breatherCap = cylinder('breather separator cap', 0.22, 0.22, 0.12, 28, m.satinBlack);
    breatherCap.position.copy(breatherBoss.position).addScaledVector(n, 0.17);
    breatherCap.quaternion.copy(q);
    detail.add(breatherCap);

    addInspectable(engine, headAssembly, detail, META.cover);
  }
}

function addBlockCastingDetails(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'block casting ribs mounts sensors and plugs';

  for (const side of [-1, 1]) {
    for (const x of [-3.75, -2.55, -1.3, 0, 1.3, 2.55, 3.75]) {
      const rib = roundedBox('external crankcase casting rib', new THREE.Vector3(0.12, 1.5, 0.18), 0.055, m.castIronDark, 2);
      rib.position.set(x, -1.25, side * 1.64);
      rib.rotation.x = side * 8 * DEG;
      detail.add(rib);
    }

    for (const x of [-3.2, -1.05, 1.05, 3.2]) {
      const boss = cylinder('machined block boss', 0.19, 0.22, 0.16, 28, m.castIron, 'z');
      boss.position.set(x, -0.65, side * 1.76);
      detail.add(boss);
      const plug = cylinder('threaded oil gallery plug', 0.11, 0.11, 0.08, 6, m.machinedSteel, 'z');
      plug.position.set(x, -0.65, side * 1.86);
      detail.add(plug);
    }

    for (const x of [-2.2, 2.2]) {
      const sensor = new THREE.Group();
      sensor.name = 'piezoelectric knock sensor';
      sensor.position.set(x, 0.35, side * 1.6);
      sensor.rotation.x = side * 18 * DEG;
      const washer = cylinder('knock sensor ring', 0.17, 0.17, 0.08, 28, m.darkSteel, 'z');
      const center = bolt('knock sensor retaining bolt', 0.17, 0.06, m.machinedSteel);
      center.rotation.x = Math.PI / 2;
      sensor.add(washer, center);
      detail.add(sensor);
      detail.add(tube('knock sensor pigtail', [
        new THREE.Vector3(x, 0.35, side * 1.78),
        new THREE.Vector3(x + 0.25, 0.62, side * 1.95),
        new THREE.Vector3(x + 0.55, 1.0, side * 1.85),
      ], 0.022, m.hose, 18, 6));
    }

    const mount = new THREE.Group();
    mount.name = `${side > 0 ? 'left' : 'right'} engine mount bracket`;
    mount.position.set(0.45, -1.35, side * 1.78);
    const mountBase = roundedBox('engine mount block plate', new THREE.Vector3(1.55, 0.62, 0.18), 0.09, m.darkSteel);
    const mountEarA = roundedBox('engine mount triangular ear', new THREE.Vector3(0.22, 1.0, 0.55), 0.09, m.darkSteel);
    mountEarA.position.set(-0.58, 0.4, side * 0.18);
    mountEarA.rotation.z = 18 * DEG;
    const mountEarB = mountEarA.clone();
    mountEarB.position.x = 0.58;
    mountEarB.rotation.z = -18 * DEG;
    const bushing = cylinder('engine mount bushing sleeve', 0.22, 0.22, 0.68, 32, m.rubber, 'z');
    bushing.position.set(0, 0.75, side * 0.25);
    mount.add(mountBase, mountEarA, mountEarB, bushing);
    detail.add(mount);
  }

  const serialPlate = roundedBox('engine serial identification plate', new THREE.Vector3(1.25, 0.04, 0.42), 0.045, m.machinedSteel, 2);
  serialPlate.position.set(1.7, -1.25, -1.77);
  serialPlate.rotation.x = Math.PI / 2;
  detail.add(serialPlate);
  for (const x of [1.15, 2.25]) {
    const rivet = cylinder('serial plate rivet', 0.035, 0.035, 0.06, 16, m.chrome, 'z');
    rivet.position.set(x, -1.25, -1.82);
    detail.add(rivet);
  }

  addInspectable(engine, engine.systems.structure, detail, META.casting);
}

function addLubricationCircuit(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'complete external dry sump lubrication circuit';

  const cooler = new THREE.Group();
  cooler.name = 'stacked plate oil cooler';
  cooler.position.set(-4.35, -0.85, -2.15);
  for (let i = 0; i < 11; i += 1) {
    const plate = roundedBox('oil cooler plate', new THREE.Vector3(1.45, 0.055, 0.58), 0.025, i % 2 ? m.darkSteel : m.aluminum, 2);
    plate.position.y = (i - 5) * 0.07;
    cooler.add(plate);
  }
  for (const x of [-0.56, 0.56]) {
    const endTank = roundedBox('oil cooler end tank', new THREE.Vector3(0.19, 0.84, 0.62), 0.08, m.aluminum);
    endTank.position.x = x;
    cooler.add(endTank);
  }
  detail.add(cooler);

  const pump = new THREE.Group();
  pump.name = 'three-stage dry sump pump';
  pump.position.set(-3.7, -2.05, 1.95);
  for (let stage = 0; stage < 3; stage += 1) {
    const housing = cylinder('dry sump pump stage', 0.3, 0.3, 0.28, 32, m.aluminum, 'x');
    housing.position.x = stage * 0.32;
    pump.add(housing);
    const cover = cylinder('dry sump stage cover', 0.24, 0.24, 0.04, 32, m.darkSteel, 'x');
    cover.position.x = stage * 0.32 - 0.16;
    pump.add(cover);
  }
  const drivePulley = cylinder('dry sump pump drive pulley', 0.38, 0.38, 0.16, 40, m.darkSteel, 'x');
  drivePulley.position.x = -0.38;
  pump.add(drivePulley);
  detail.add(pump);

  const lines = [
    [new THREE.Vector3(-3.35, -2.05, 1.95), new THREE.Vector3(-2.5, -2.55, 2.12), new THREE.Vector3(-1.0, -2.72, 2.0), new THREE.Vector3(1.65, -2.55, 1.7)],
    [new THREE.Vector3(-4.1, -1.0, -2.15), new THREE.Vector3(-3.3, -1.45, -2.22), new THREE.Vector3(-2.9, -2.1, -1.95)],
    [new THREE.Vector3(-4.6, -1.0, -2.15), new THREE.Vector3(-4.95, -1.45, -1.7), new THREE.Vector3(-4.4, -2.0, -0.9), new THREE.Vector3(-3.75, -2.05, 1.72)],
  ];
  for (const [index, points] of lines.entries()) {
    detail.add(tube(`braided oil ${index === 0 ? 'scavenge' : 'pressure'} line`, points, index === 0 ? 0.075 : 0.065, m.hose, 58, 9));
    addHexFitting(detail, points[0], new THREE.Euler(0, 0, 0), m, 0.85);
    addHexFitting(detail, points.at(-1), new THREE.Euler(0, 0, Math.PI), m, 0.85);
  }

  for (const x of [-2.6, -0.8, 1.0]) {
    const clamp = roundedBox('oil line P clamp', new THREE.Vector3(0.16, 0.2, 0.08), 0.035, m.machinedSteel);
    clamp.position.set(x, -2.58, 1.92);
    detail.add(clamp);
  }

  addInspectable(engine, engine.systems.accessories, detail, META.lubrication);
}

function addCoolingCircuit(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'thermostat housing crossover and coolant service detail';

  const thermostat = new THREE.Group();
  thermostat.name = 'thermostat housing';
  thermostat.position.set(3.7, 1.85, -0.15);
  const body = sphere('thermostat housing casting', 0.42, m.aluminum, 28, 18);
  body.scale.set(1.15, 0.75, 0.9);
  const neck = cylinder('thermostat outlet neck', 0.22, 0.24, 0.62, 28, m.aluminum, 'z');
  neck.position.set(0.15, 0.1, -0.42);
  neck.rotation.x = 18 * DEG;
  thermostat.add(body, neck);
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2;
    const housingBolt = bolt('thermostat housing bolt', 0.18, 0.055, m.machinedSteel);
    housingBolt.position.set(Math.cos(angle) * 0.33, Math.sin(angle) * 0.22, 0.24);
    housingBolt.rotation.x = Math.PI / 2;
    thermostat.add(housingBolt);
  }
  detail.add(thermostat);

  detail.add(tube('rear coolant crossover hard line', [new THREE.Vector3(3.55, 1.92, -0.5), new THREE.Vector3(3.15, 2.18, -1.3), new THREE.Vector3(1.4, 2.35, -1.85), new THREE.Vector3(-0.8, 2.38, -1.85), new THREE.Vector3(-3.0, 2.14, -1.35)], 0.095, m.machinedSteel, 64, 10));

  const upperHosePoints = [new THREE.Vector3(3.85, 1.95, -0.58), new THREE.Vector3(4.4, 2.2, -1.05), new THREE.Vector3(4.8, 2.65, -1.15), new THREE.Vector3(5.15, 3.1, -0.85)];
  detail.add(tube('formed radiator upper hose', upperHosePoints, 0.18, m.blueHose, 48, 12));
  addHoseClamp(detail, upperHosePoints[0], 0.195, 'z', m);

  const sender = new THREE.Group();
  sender.name = 'engine coolant temperature sender';
  sender.position.set(3.35, 2.15, 0.28);
  const senderHex = cylinder('temperature sender hex', 0.11, 0.11, 0.12, 6, m.machinedSteel);
  const senderTop = roundedBox('temperature sender connector', new THREE.Vector3(0.18, 0.22, 0.16), 0.04, m.satinBlack);
  senderTop.position.y = 0.16;
  sender.add(senderHex, senderTop);
  detail.add(sender);

  for (const x of [-2.8, 0, 2.8]) {
    const support = roundedBox('coolant crossover support', new THREE.Vector3(0.13, 0.5, 0.18), 0.04, m.darkSteel);
    support.position.set(x, 1.95, -1.65);
    support.rotation.z = 18 * DEG;
    detail.add(support);
  }

  addInspectable(engine, engine.systems.accessories, detail, META.cooling);
}

function addFuelVacuumDetails(engine) {
  const m = engine.materials;
  const intake = engine.root.getObjectByName('complete intake system');
  if (!intake) return;
  const detail = new THREE.Group();
  detail.name = 'fuel feed return regulator and manifold vacuum detail';

  const regulator = new THREE.Group();
  regulator.name = 'return style fuel pressure regulator';
  regulator.position.set(3.55, 2.95, -1.35);
  const regBody = cylinder('fuel regulator body', 0.23, 0.23, 0.4, 28, m.redPaint);
  const regCap = cylinder('fuel regulator diaphragm cap', 0.28, 0.28, 0.14, 30, m.satinBlack);
  regCap.position.y = 0.26;
  const adjuster = bolt('fuel pressure adjuster', 0.24, 0.065, m.machinedSteel);
  adjuster.position.y = 0.45;
  regulator.add(regBody, regCap, adjuster);
  detail.add(regulator);

  const feedPoints = [new THREE.Vector3(4.7, -1.45, -1.95), new THREE.Vector3(4.5, 0.2, -2.05), new THREE.Vector3(4.15, 1.8, -1.85), new THREE.Vector3(3.55, 2.95, -1.55)];
  const returnPoints = [new THREE.Vector3(3.55, 2.72, -1.35), new THREE.Vector3(3.9, 1.65, -1.75), new THREE.Vector3(4.15, 0.2, -1.95), new THREE.Vector3(4.35, -1.65, -1.9)];
  detail.add(tube('braided fuel feed line', feedPoints, 0.055, m.hose, 54, 8));
  detail.add(tube('braided fuel return line', returnPoints, 0.047, m.hose, 54, 8));
  addHexFitting(detail, feedPoints[0], new THREE.Euler(0, 0, 0), m, 0.7);
  addHexFitting(detail, feedPoints.at(-1), new THREE.Euler(0, 0, Math.PI), m, 0.7);
  addHexFitting(detail, returnPoints[0], new THREE.Euler(0, 0, 0), m, 0.65);

  const vacuumBlock = roundedBox('vacuum distribution manifold', new THREE.Vector3(0.78, 0.2, 0.34), 0.075, m.satinBlack);
  vacuumBlock.position.set(1.85, 3.76, -0.72);
  detail.add(vacuumBlock);
  for (let port = 0; port < 5; port += 1) {
    const nipple = cylinder('vacuum manifold nipple', 0.035, 0.045, 0.22, 14, m.machinedSteel, 'z');
    nipple.position.set(1.55 + port * 0.15, 3.76, -0.95);
    detail.add(nipple);
    const endpoint = new THREE.Vector3(0.4 + port * 0.55, 2.85 + (port % 2) * 0.18, -1.15);
    detail.add(tube('small bore vacuum line', [nipple.position.clone().add(new THREE.Vector3(0, 0, -0.1)), new THREE.Vector3(1.4 + port * 0.08, 3.35, -1.15), endpoint], 0.018, m.hose, 22, 5));
  }

  const throttleShaft = cylinder('throttle shaft', 0.045, 0.045, 1.65, 16, m.machinedSteel, 'z');
  throttleShaft.position.set(-3.98, 3.15, 0);
  detail.add(throttleShaft);
  const throttleLever = roundedBox('throttle position lever', new THREE.Vector3(0.12, 0.52, 0.08), 0.035, m.darkSteel);
  throttleLever.position.set(-3.98, 3.45, -0.83);
  throttleLever.rotation.z = -28 * DEG;
  detail.add(throttleLever);
  const returnSpring = spring('throttle return spring', 0.09, 0.016, 0.4, 6, m.machinedSteel, 64);
  returnSpring.position.set(-3.98, 3.17, -0.86);
  returnSpring.rotation.x = Math.PI / 2;
  detail.add(returnSpring);

  for (const x of [-2.8, -1.4, 0, 1.4, 2.8]) {
    const rib = roundedBox('intake plenum casting rib', new THREE.Vector3(0.1, 0.66, 1.74), 0.035, m.intakeDark, 2);
    rib.position.set(x + 0.2, 3.13, 0);
    detail.add(rib);
  }

  addInspectable(engine, intake, detail, META.fuel);
}

function addElectricalDetails(engine) {
  const m = engine.materials;
  const detail = new THREE.Group();
  detail.name = 'starter charging grounds and sensor electrical distribution';

  const junction = new THREE.Group();
  junction.name = 'engine power junction box';
  junction.position.set(3.7, 0.45, -2.05);
  const box = roundedBox('power junction enclosure', new THREE.Vector3(0.72, 0.42, 0.32), 0.09, m.satinBlack);
  const lid = roundedBox('power junction lid', new THREE.Vector3(0.66, 0.05, 0.28), 0.04, m.darkSteel);
  lid.position.y = 0.23;
  junction.add(box, lid);
  for (const x of [-0.2, 0, 0.2]) {
    const stud = bolt('power distribution stud', 0.18, 0.055, m.copper);
    stud.position.set(x, 0.3, 0);
    junction.add(stud);
  }
  detail.add(junction);

  detail.add(tube('starter battery cable', [new THREE.Vector3(3.9, 0.35, -2.15), new THREE.Vector3(4.35, -0.65, -2.0), new THREE.Vector3(4.55, -1.45, -1.65), new THREE.Vector3(4.35, -2.0, -1.42)], 0.065, m.hose, 50, 9));
  detail.add(tube('alternator charge cable loom', [new THREE.Vector3(3.65, 0.48, -1.9), new THREE.Vector3(2.0, 1.25, -1.8), new THREE.Vector3(0.2, 1.55, -1.65), new THREE.Vector3(-3.8, 1.35, -1.55), new THREE.Vector3(-5.1, 0.75, -1.35)], 0.055, m.hose, 64, 8));

  for (const side of [-1, 1]) {
    const endpoints = [new THREE.Vector3(1.8, -0.75, side * 1.75), new THREE.Vector3(2.75, -1.05, side * 2.15)];
    detail.add(tube(`${side > 0 ? 'left' : 'right'} braided ground strap`, [endpoints[0], new THREE.Vector3(2.25, -0.95, side * 2.0), endpoints[1]], 0.045, m.machinedSteel, 30, 8));
    for (const end of endpoints) {
      const lug = torus('ground strap eye terminal', 0.1, 0.03, 8, 24, m.copper, 'z');
      lug.position.copy(end);
      detail.add(lug);
    }
  }

  for (const x of [-3.4, -1.7, 0, 1.7, 3.4]) {
    const loomClip = roundedBox('lower harness fir-tree clip', new THREE.Vector3(0.16, 0.12, 0.14), 0.035, m.satinBlack);
    loomClip.position.set(x, -0.45, -1.82);
    detail.add(loomClip);
  }

  addInspectable(engine, engine.systems.accessories, detail, META.electrical);
}

function addExhaustMicroDetails(engine) {
  const m = engine.materials;
  const headers = engine.root.getObjectByName('equal-length exhaust header system');
  if (!headers) return;
  const detail = new THREE.Group();
  detail.name = 'header slip joints thermal shields probes and supports';

  for (const side of [-1, 1]) {
    for (const x of CYLINDER_X) {
      const port = pointOnBank(x, side, 4.0, 1.0);
      const joint = torus('primary tube slip joint band', 0.12, 0.022, 8, 30, m.chrome, 'z');
      joint.position.copy(port).add(new THREE.Vector3(0, -0.26, side * 0.28));
      joint.rotation.x = side * BANK_ANGLE;
      detail.add(joint);
    }

    const shield = new THREE.Group();
    shield.name = `${side > 0 ? 'left' : 'right'} formed header heat shield`;
    const panel = roundedBox('formed aluminum heat shield panel', new THREE.Vector3(3.0, 0.07, 0.92), 0.12, m.aluminum, 3);
    panel.position.set(-0.2, 0.25, side * 3.3);
    panel.rotation.x = side * 12 * DEG;
    shield.add(panel);
    for (let slot = -5; slot <= 5; slot += 1) {
      const louver = roundedBox('heat shield cooling louver', new THREE.Vector3(0.16, 0.05, 0.46), 0.035, m.darkSteel, 2);
      louver.position.set(slot * 0.24, 0.09, side * 0.12);
      louver.rotation.z = 18 * DEG;
      shield.add(louver);
    }
    for (const x of [-1.2, 1.2]) {
      const shieldBolt = bolt('heat shield standoff bolt', 0.26, 0.055, m.machinedSteel);
      shieldBolt.position.set(x, -0.05, side * -0.35);
      shield.add(shieldBolt);
    }
    detail.add(shield);

    for (const x of [-2.4, 0.8]) {
      const probe = new THREE.Group();
      probe.name = 'exhaust gas temperature probe';
      probe.position.set(x, 0.5, side * 2.95);
      probe.rotation.x = side * 50 * DEG;
      const probeBody = cylinder('EGT probe compression fitting', 0.055, 0.055, 0.3, 14, m.machinedSteel);
      const probeHex = cylinder('EGT probe hex', 0.085, 0.085, 0.1, 6, m.machinedSteel);
      probe.add(probeBody, probeHex);
      detail.add(probe);
      detail.add(tube('EGT probe lead', [new THREE.Vector3(x, 0.7, side * 3.08), new THREE.Vector3(x + 0.3, 1.0, side * 3.15), new THREE.Vector3(x + 0.8, 1.35, side * 2.85)], 0.018, m.hose, 20, 5));
    }

    const springAnchorA = new THREE.Vector3(4.15, -1.35, side * 2.82);
    const springAnchorB = new THREE.Vector3(4.72, -1.48, side * 2.72);
    const collectorSpring = spring('collector retaining spring', 0.045, 0.012, springAnchorA.distanceTo(springAnchorB), 8, m.machinedSteel, 72);
    collectorSpring.position.copy(new THREE.Vector3().addVectors(springAnchorA, springAnchorB).multiplyScalar(0.5));
    collectorSpring.rotation.z = 78 * DEG;
    detail.add(collectorSpring);
  }

  addInspectable(engine, headers, detail, META.exhaust);
}

function addClutchPack(engine) {
  const m = engine.materials;
  const flywheel = engine.root.getObjectByName('flywheel assembly');
  if (!flywheel) return;
  const detail = new THREE.Group();
  detail.name = 'multi component clutch pressure assembly';

  const frictionFace = cylinder('machined clutch friction face', 1.34, 1.34, 0.055, 72, m.machinedSteel, 'x');
  frictionFace.position.x = 0.24;
  detail.add(frictionFace);
  const pilotBearingOuter = cylinder('pilot bearing outer race', 0.25, 0.25, 0.14, 36, m.machinedSteel, 'x');
  pilotBearingOuter.position.x = 0.33;
  const pilotBearingInner = cylinder('pilot bearing inner race', 0.13, 0.13, 0.17, 32, m.darkSteel, 'x');
  pilotBearingInner.position.x = 0.35;
  detail.add(pilotBearingOuter, pilotBearingInner);
  const cover = cylinder('clutch pressure plate cover', 1.18, 1.25, 0.22, 64, m.darkSteel, 'x');
  cover.position.x = 0.43;
  detail.add(cover);
  const pressureRing = torus('pressure plate contact ring', 0.92, 0.13, 12, 72, m.machinedSteel, 'x');
  pressureRing.position.x = 0.58;
  detail.add(pressureRing);

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const finger = roundedBox('diaphragm spring finger', new THREE.Vector3(0.05, 0.48, 0.12), 0.025, m.machinedSteel, 2);
    finger.position.set(0.68, Math.cos(angle) * 0.52, Math.sin(angle) * 0.52);
    finger.rotation.x = -angle;
    finger.rotation.z = Math.PI / 2;
    detail.add(finger);
  }

  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const coverBolt = bolt('clutch cover bolt', 0.2, 0.06, m.machinedSteel);
    coverBolt.rotation.z = Math.PI / 2;
    coverBolt.position.set(0.58, Math.cos(angle) * 1.08, Math.sin(angle) * 1.08);
    detail.add(coverBolt);
  }

  addInspectable(engine, flywheel, detail, META.clutch);
}

function addAccessoryMicroDetails(engine) {
  const m = engine.materials;
  const front = engine.root.getObjectByName('front accessory drive');
  if (!front) return;
  const detail = new THREE.Group();
  detail.name = 'front drive structural brackets tensioner and timing references';

  const bracketPairs = [
    [new THREE.Vector3(-0.25, 0.45, 1.1), new THREE.Vector3(-0.25, 1.35, 1.65)],
    [new THREE.Vector3(-0.25, -0.2, -0.85), new THREE.Vector3(-0.25, 0.85, -1.55)],
    [new THREE.Vector3(-0.25, -1.25, 0.55), new THREE.Vector3(-0.25, -0.25, 0.05)],
  ];
  for (const [a, b] of bracketPairs) {
    const stay = roundedBox('triangulated accessory support stay', new THREE.Vector3(1, 1, 0.12), 0.04, m.darkSteel, 2);
    orientPlateBetween(stay, a, b, 0.11);
    detail.add(stay);
    for (const endpoint of [a, b]) {
      const stayBolt = bolt('accessory bracket pivot bolt', 0.2, 0.065, m.machinedSteel);
      stayBolt.rotation.z = Math.PI / 2;
      stayBolt.position.copy(endpoint);
      detail.add(stayBolt);
    }
  }

  const tensioner = new THREE.Group();
  tensioner.name = 'automatic belt tensioner spring housing';
  tensioner.position.set(-0.48, -0.15, -1.35);
  const tensionerBody = cylinder('tensioner spring housing', 0.28, 0.28, 0.18, 36, m.aluminum, 'x');
  const tensionerCap = cylinder('tensioner inspection cap', 0.19, 0.19, 0.04, 32, m.darkSteel, 'x');
  tensionerCap.position.x = -0.11;
  tensioner.add(tensionerBody, tensionerCap);
  detail.add(tensioner);

  const pointer = roundedBox('crank timing pointer', new THREE.Vector3(0.18, 0.08, 0.38), 0.025, m.machinedSteel, 2);
  pointer.position.set(-0.58, -0.72, 0.88);
  pointer.rotation.x = 38 * DEG;
  detail.add(pointer);
  for (let i = 0; i <= 10; i += 1) {
    const mark = roundedBox('harmonic damper timing mark', new THREE.Vector3(0.035, 0.12, 0.03), 0.01, i === 5 ? m.orangePaint : m.machinedSteel, 1);
    const angle = (-20 + i * 4) * DEG;
    mark.position.set(-0.59, -1.55 + Math.cos(angle) * 0.96, Math.sin(angle) * 0.96);
    mark.rotation.x = -angle;
    detail.add(mark);
  }

  const guard = roundedBox('lower belt debris guard', new THREE.Vector3(0.12, 1.65, 2.3), 0.12, m.satinBlack);
  guard.position.set(-0.12, -1.15, 0);
  guard.material = guard.material.clone();
  guard.material.transparent = true;
  guard.material.opacity = 0.34;
  guard.material.depthWrite = false;
  detail.add(guard);

  addInspectable(engine, front, detail, META.accessory);
}

export function applyMicroDetailPass(engine) {
  if (engine.root.userData.microDetailPassApplied) return;
  engine.root.userData.microDetailPassApplied = true;
  hideOverscaleLegacyParts(engine);
  addCamCoverMicroDetails(engine);
  addBlockCastingDetails(engine);
  addLubricationCircuit(engine);
  addCoolingCircuit(engine);
  addFuelVacuumDetails(engine);
  addElectricalDetails(engine);
  addExhaustMicroDetails(engine);
  addClutchPack(engine);
  addAccessoryMicroDetails(engine);
}

const originalUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function patchedUpdate(...args) {
  applyMicroDetailPass(this);
  return originalUpdate.apply(this, args);
};
