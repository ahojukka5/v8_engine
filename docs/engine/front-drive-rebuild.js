import * as THREE from 'three';
import { V8Engine } from './v8-engine.js';
import {
  bolt,
  createWireOverlay,
  cylinder,
  registerPart,
  roundedBox,
  sphere,
  torus,
} from './primitives.js';

const TWO_PI = Math.PI * 2;
const X_AXIS = new THREE.Vector3(1, 0, 0);

const META = {
  accessoryDrive: {
    system: 'ACCESSORIES',
    name: 'Coplanar serpentine accessory drive',
    material: 'EPDM belt / forged steel / cast aluminum',
    function: 'Drives the water pump, alternator and compressor from the crankshaft.',
    description: 'Every pulley is located on one datum plane. The belt follows calculated common tangents and wrap arcs instead of crossing itself or cutting through adjacent hardware.',
  },
  timingDrive: {
    system: 'VALVETRAIN',
    name: 'Dual-bank DOHC timing drive',
    material: 'Hardened steel chain and sprockets / polymer guides',
    function: 'Drives all four camshafts at one half of crankshaft speed.',
    description: 'Two compact chain loops share the crankshaft drive, remain behind the accessory plane and use smaller cam sprockets, guide rails and hydraulic tensioners.',
  },
  frontCover: {
    system: 'STRUCTURE',
    name: 'Stepped front timing cover',
    material: 'Cast aluminum / steel fasteners / elastomer seals',
    function: 'Seals and supports the crank, water-pump and timing-drive interfaces.',
    description: 'Raised bearing bosses, blended ribs, perimeter fasteners and separate seal lands replace the previous flat symbolic plate.',
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

function removeNamedSubtrees(engine, names) {
  const matches = [];
  engine.root.traverse((object) => {
    if (names.has(object.name)) matches.push(object);
  });
  const matchSet = new Set(matches);
  const roots = matches.filter((object) => {
    let parent = object.parent;
    while (parent) {
      if (matchSet.has(parent)) return false;
      parent = parent.parent;
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

function polygonArea(circles) {
  let twiceArea = 0;
  for (let i = 0; i < circles.length; i += 1) {
    const a = circles[i].center;
    const b = circles[(i + 1) % circles.length].center;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea * 0.5;
}

function externalTangent(a, b, outwardSide) {
  const delta = b.center.clone().sub(a.center);
  const distance = delta.length();
  const direction = delta.clone().multiplyScalar(1 / distance);
  const radiusDelta = a.radius - b.radius;
  const h = THREE.MathUtils.clamp(radiusDelta / distance, -0.999, 0.999);
  const k = Math.sqrt(Math.max(0, 1 - h * h));
  const left = new THREE.Vector2(-direction.y, direction.x);
  const normal = direction.clone().multiplyScalar(h).addScaledVector(left, k * outwardSide);
  return {
    from: a.center.clone().addScaledVector(normal, a.radius),
    to: b.center.clone().addScaledVector(normal, b.radius),
  };
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function sampleTangentLoop(circles, arcSegments = 12, lineSegments = 5) {
  const area = polygonArea(circles);
  const outwardSide = area >= 0 ? -1 : 1;
  const tangents = circles.map((circle, index) => externalTangent(
    circle,
    circles[(index + 1) % circles.length],
    outwardSide,
  ));
  const points = [];

  for (let i = 0; i < circles.length; i += 1) {
    const circle = circles[i];
    const incoming = tangents[(i - 1 + circles.length) % circles.length].to;
    const outgoing = tangents[i].from;
    const startAngle = Math.atan2(incoming.y - circle.center.y, incoming.x - circle.center.x);
    const endAngle = Math.atan2(outgoing.y - circle.center.y, outgoing.x - circle.center.x);
    const delta = shortestAngleDelta(startAngle, endAngle);

    for (let step = 0; step <= arcSegments; step += 1) {
      const t = step / arcSegments;
      const angle = startAngle + delta * t;
      points.push(new THREE.Vector2(
        circle.center.x + Math.cos(angle) * circle.radius,
        circle.center.y + Math.sin(angle) * circle.radius,
      ));
    }

    const lineEnd = tangents[i].to;
    for (let step = 1; step <= lineSegments; step += 1) {
      points.push(outgoing.clone().lerp(lineEnd, step / lineSegments));
    }
  }
  return points;
}

function curveFromLoop(points, x) {
  return new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(x, point.y, point.x)),
    true,
    'centripetal',
    0.12,
  );
}

function makeRibbedBelt(name, points, x, materials) {
  const group = new THREE.Group();
  group.name = name;
  const offsets = [-0.066, -0.022, 0.022, 0.066];
  for (const offset of offsets) {
    const curve = curveFromLoop(points, x + offset);
    const geometry = new THREE.TubeGeometry(curve, Math.max(160, points.length * 2), 0.026, 7, true);
    const rib = new THREE.Mesh(geometry, materials.belt);
    rib.name = `${name} longitudinal rib`;
    rib.castShadow = true;
    rib.receiveShadow = true;
    group.add(rib);
  }
  return group;
}

function makePulley(name, radius, x, y, z, materials, options = {}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  group.userData.driveRadius = radius;
  group.userData.driveRatio = options.driveRatio ?? 1;
  group.userData.driveDirection = options.driveDirection ?? -1;

  const disc = cylinder(`${name} pulley body`, radius, radius, options.width ?? 0.22, 56, options.material ?? materials.darkSteel, 'x');
  group.add(disc);

  const flangeA = torus(`${name} front flange`, radius * 0.96, 0.025, 8, 64, materials.machinedSteel, 'x');
  flangeA.position.x = -(options.width ?? 0.22) * 0.52;
  const flangeB = flangeA.clone();
  flangeB.name = `${name} rear flange`;
  flangeB.position.x *= -1;
  group.add(flangeA, flangeB);

  for (let groove = -3; groove <= 3; groove += 1) {
    const ring = torus(`${name} belt groove`, radius + 0.008, 0.010, 6, 64, materials.blackOxide, 'x');
    ring.position.x = groove * 0.028;
    group.add(ring);
  }

  const hub = cylinder(`${name} hub`, radius * 0.24, radius * 0.24, (options.width ?? 0.22) + 0.16, 32, materials.machinedSteel, 'x');
  group.add(hub);
  const fastener = cylinder(`${name} retaining bolt`, radius * 0.10, radius * 0.10, (options.width ?? 0.22) + 0.22, 6, materials.machinedSteel, 'x');
  group.add(fastener);
  return group;
}

function addFrontCover(engine, front) {
  const m = engine.materials;
  const cover = new THREE.Group();
  cover.name = 'resolved stepped timing cover';

  const shell = roundedBox('sculpted front cover shell', new THREE.Vector3(0.38, 3.75, 3.30), 0.28, m.aluminum, 5);
  shell.position.set(0.04, -0.15, 0);
  cover.add(shell);

  const crankBoss = cylinder('front crank seal boss', 1.00, 1.05, 0.24, 64, m.aluminum, 'x');
  crankBoss.position.set(-0.23, -1.55, 0);
  cover.add(crankBoss);
  const crankSeal = torus('front crank radial seal', 0.83, 0.055, 10, 72, m.rubber, 'x');
  crankSeal.position.set(-0.37, -1.55, 0);
  cover.add(crankSeal);

  const pumpBoss = cylinder('water pump bearing boss', 0.67, 0.72, 0.22, 56, m.aluminum, 'x');
  pumpBoss.position.set(-0.22, 0.55, -0.75);
  cover.add(pumpBoss);
  const pumpSeal = torus('water pump seal land', 0.55, 0.035, 8, 56, m.darkSteel, 'x');
  pumpSeal.position.set(-0.35, 0.55, -0.75);
  cover.add(pumpSeal);

  const ribs = [
    [new THREE.Vector3(-0.18, -1.05, -0.72), new THREE.Vector3(-0.18, 0.10, -0.75)],
    [new THREE.Vector3(-0.18, -1.10, 0.65), new THREE.Vector3(-0.18, 0.52, 1.08)],
    [new THREE.Vector3(-0.18, 0.70, -0.25), new THREE.Vector3(-0.18, 1.35, 0.15)],
  ];
  for (const [start, end] of ribs) {
    const direction = end.clone().sub(start);
    const rib = roundedBox('front cover blended rib', new THREE.Vector3(0.12, 1, 0.12), 0.045, m.aluminum, 3);
    rib.position.copy(start).add(end).multiplyScalar(0.5);
    rib.scale.y = direction.length();
    rib.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    cover.add(rib);
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * TWO_PI;
    const y = -0.15 + Math.cos(angle) * 1.72;
    const z = Math.sin(angle) * 1.47;
    const fastener = bolt('front cover perimeter bolt', 0.18, 0.048, m.machinedSteel);
    fastener.position.set(-0.25, y, z);
    fastener.rotation.z = Math.PI / 2;
    cover.add(fastener);
  }

  addInspectable(engine, front, cover, META.frontCover);
}

function addAlternatorBody(front, center, materials) {
  const group = new THREE.Group();
  group.name = 'resolved alternator assembly';
  group.position.set(0.03, center.y, center.x);
  const caseBody = cylinder('alternator stator housing', 0.58, 0.58, 0.72, 40, materials.aluminum, 'x');
  group.add(caseBody);
  const rotor = cylinder('alternator copper rotor', 0.34, 0.34, 0.77, 32, materials.copper, 'x');
  group.add(rotor);
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * TWO_PI;
    const vent = roundedBox('alternator ventilation slot', new THREE.Vector3(0.78, 0.055, 0.16), 0.022, materials.blackOxide, 2);
    vent.position.set(0, center.y * 0 + Math.cos(angle) * 0.46, Math.sin(angle) * 0.46);
    vent.rotation.x = angle;
    group.add(vent);
  }
  front.add(group);
}

function addCompressorBody(front, center, materials) {
  const group = new THREE.Group();
  group.name = 'air conditioning compressor assembly';
  group.position.set(0.04, center.y, center.x);
  const body = cylinder('compressor ribbed body', 0.52, 0.52, 0.72, 38, materials.aluminum, 'x');
  group.add(body);
  for (let i = -3; i <= 3; i += 1) {
    const rib = torus('compressor housing rib', 0.50, 0.018, 7, 48, materials.darkSteel, 'x');
    rib.position.x = i * 0.08;
    group.add(rib);
  }
  const manifold = roundedBox('compressor refrigerant manifold', new THREE.Vector3(0.42, 0.28, 0.46), 0.08, materials.darkSteel, 3);
  manifold.position.set(0.18, 0.42, 0.05);
  group.add(manifold);
  front.add(group);
}

function addWaterPumpBody(front, center, materials) {
  const group = new THREE.Group();
  group.name = 'resolved centrifugal water pump';
  group.position.set(-0.02, center.y, center.x);
  const housing = sphere('water pump volute', 0.58, materials.aluminum, 40, 24);
  housing.scale.set(0.62, 1.0, 1.0);
  group.add(housing);
  const neck = cylinder('water pump outlet neck', 0.18, 0.22, 0.65, 28, materials.aluminum, 'z');
  neck.position.set(0.05, 0.40, -0.36);
  neck.rotation.x = -28 * Math.PI / 180;
  group.add(neck);
  front.add(group);
}

function addSupportBracket(front, name, anchor, target, materials) {
  const direction = target.clone().sub(anchor);
  const stay = roundedBox(name, new THREE.Vector3(0.14, 1, 0.22), 0.055, materials.darkSteel, 3);
  stay.position.copy(anchor).add(target).multiplyScalar(0.5);
  stay.scale.y = direction.length();
  stay.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  front.add(stay);
  for (const point of [anchor, target]) {
    const pivot = bolt(`${name} pivot`, 0.20, 0.055, materials.machinedSteel);
    pivot.position.copy(point);
    pivot.rotation.z = Math.PI / 2;
    front.add(pivot);
  }
}

function addAccessoryDrive(engine, front) {
  const m = engine.materials;
  const group = new THREE.Group();
  group.name = 'resolved coplanar serpentine system';
  const beltX = -0.54;
  const pulleyData = [
    { name: 'resolved harmonic damper', center: new THREE.Vector2(0.00, -1.55), radius: 0.82, ratio: 1.00 },
    { name: 'resolved compressor pulley', center: new THREE.Vector2(1.35, -0.55), radius: 0.43, ratio: 0.82 / 0.43 },
    { name: 'resolved alternator pulley', center: new THREE.Vector2(1.25, 0.72), radius: 0.36, ratio: 0.82 / 0.36 },
    { name: 'resolved upper idler', center: new THREE.Vector2(0.20, 1.35), radius: 0.28, ratio: 0.82 / 0.28 },
    { name: 'resolved water pump pulley', center: new THREE.Vector2(-0.75, 0.55), radius: 0.55, ratio: 0.82 / 0.55 },
    { name: 'resolved automatic tensioner pulley', center: new THREE.Vector2(-1.35, -0.45), radius: 0.32, ratio: 0.82 / 0.32 },
  ];

  const circles = pulleyData.map(({ center, radius }) => ({ center, radius: radius + 0.055 }));
  const beltPoints = sampleTangentLoop(circles, 15, 6);
  group.add(makeRibbedBelt('calculated multi-rib serpentine belt', beltPoints, beltX, m));

  engine.userData.resolvedAccessoryRotors = [];
  for (const spec of pulleyData) {
    const pulley = makePulley(
      spec.name,
      spec.radius,
      beltX,
      spec.center.y,
      spec.center.x,
      m,
      { driveRatio: spec.ratio },
    );
    group.add(pulley);
    engine.userData.resolvedAccessoryRotors.push(pulley);
  }

  addAlternatorBody(group, pulleyData[2].center, m);
  addCompressorBody(group, pulleyData[1].center, m);
  addWaterPumpBody(group, pulleyData[4].center, m);

  const tensionPivot = new THREE.Vector3(-0.16, -0.15, -0.62);
  const tensionPulley = new THREE.Vector3(beltX + 0.12, pulleyData[5].center.y, pulleyData[5].center.x);
  addSupportBracket(group, 'automatic tensioner arm', tensionPivot, tensionPulley, m);
  const tensionHousing = cylinder('automatic tensioner spring housing', 0.27, 0.27, 0.18, 36, m.aluminum, 'x');
  tensionHousing.position.copy(tensionPivot);
  group.add(tensionHousing);

  addSupportBracket(group, 'alternator lower support', new THREE.Vector3(-0.12, 0.12, 0.52), new THREE.Vector3(-0.08, 0.52, 1.02), m);
  addSupportBracket(group, 'compressor lower support', new THREE.Vector3(-0.12, -0.95, 0.52), new THREE.Vector3(-0.08, -0.62, 1.04), m);

  addInspectable(engine, front, group, META.accessoryDrive);
}

function makeSprocket(name, radius, x, y, z, materials, toothCount = 28) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(x, y, z);
  const web = cylinder(`${name} web`, radius * 0.78, radius * 0.78, 0.11, 48, materials.darkSteel, 'x');
  group.add(web);
  const hub = cylinder(`${name} hub`, radius * 0.25, radius * 0.25, 0.18, 28, materials.machinedSteel, 'x');
  group.add(hub);
  const rim = torus(`${name} chain rim`, radius, 0.040, 8, 56, materials.machinedSteel, 'x');
  group.add(rim);

  const toothGeometry = new THREE.BoxGeometry(0.10, 0.075, 0.055);
  const teeth = new THREE.InstancedMesh(toothGeometry, materials.machinedSteel, toothCount);
  teeth.name = `${name} teeth`;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < toothCount; i += 1) {
    const angle = (i / toothCount) * TWO_PI;
    position.set(0, Math.sin(angle) * (radius + 0.045), Math.cos(angle) * (radius + 0.045));
    quaternion.setFromAxisAngle(X_AXIS, angle);
    matrix.compose(position, quaternion, scale);
    teeth.setMatrixAt(i, matrix);
  }
  teeth.castShadow = true;
  teeth.receiveShadow = true;
  group.add(teeth);
  return group;
}

function makeRollerChain(name, points, x, materials) {
  const group = new THREE.Group();
  group.name = name;
  const curve = curveFromLoop(points, x);
  const underlay = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(140, points.length * 2), 0.032, 7, true),
    materials.darkSteel,
  );
  underlay.name = `${name} side plates`;
  underlay.castShadow = true;
  underlay.receiveShadow = true;
  group.add(underlay);

  const rollerCount = 64;
  const rollerGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.09, 12);
  rollerGeometry.rotateZ(Math.PI / 2);
  const rollers = new THREE.InstancedMesh(rollerGeometry, materials.machinedSteel, rollerCount);
  rollers.name = `${name} rollers`;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < rollerCount; i += 1) {
    curve.getPointAt(i / rollerCount, position);
    matrix.compose(position, quaternion, scale);
    rollers.setMatrixAt(i, matrix);
  }
  rollers.castShadow = true;
  rollers.receiveShadow = true;
  group.add(rollers);
  return group;
}

function addTimingDrive(engine) {
  const m = engine.materials;
  const group = new THREE.Group();
  group.name = 'resolved compact dual timing drive';
  engine.userData.resolvedTimingRotors = [];

  const planes = [-5.69, -5.79];
  const bankSpecs = [
    {
      side: 1,
      plane: planes[0],
      circles: [
        { center: new THREE.Vector2(0.00, -1.55), radius: 0.39 },
        { center: new THREE.Vector2(1.48, 1.42), radius: 0.31 },
        { center: new THREE.Vector2(0.82, 1.67), radius: 0.31 },
      ],
    },
    {
      side: -1,
      plane: planes[1],
      circles: [
        { center: new THREE.Vector2(0.00, -1.55), radius: 0.39 },
        { center: new THREE.Vector2(-0.82, 1.67), radius: 0.31 },
        { center: new THREE.Vector2(-1.48, 1.42), radius: 0.31 },
      ],
    },
  ];

  for (const bank of bankSpecs) {
    const label = bank.side > 0 ? 'left' : 'right';
    const points = sampleTangentLoop(bank.circles, 12, 5);
    group.add(makeRollerChain(`${label} bank roller timing chain`, points, bank.plane, m));

    const crank = makeSprocket(`${label} bank crank timing sprocket`, 0.34, bank.plane, -1.55, 0, m, 24);
    group.add(crank);
    engine.userData.resolvedTimingRotors.push({ object: crank, ratio: 1, phase: 0 });

    for (let i = 1; i < bank.circles.length; i += 1) {
      const circle = bank.circles[i];
      const sprocket = makeSprocket(
        `${label} ${i === 1 ? 'exhaust' : 'intake'} cam timing sprocket`,
        0.28,
        bank.plane,
        circle.center.y,
        circle.center.x,
        m,
        30,
      );
      group.add(sprocket);
      engine.userData.resolvedTimingRotors.push({ object: sprocket, ratio: 0.5, phase: i * 0.08 });
    }

    const guideA = roundedBox(`${label} fixed timing guide`, new THREE.Vector3(0.12, 2.05, 0.14), 0.045, m.satinBlack, 3);
    guideA.position.set(bank.plane + 0.02, -0.02, bank.side * 0.92);
    guideA.rotation.x = bank.side * 15 * Math.PI / 180;
    group.add(guideA);

    const guideB = roundedBox(`${label} hydraulic timing guide`, new THREE.Vector3(0.12, 1.45, 0.15), 0.045, m.satinBlack, 3);
    guideB.position.set(bank.plane + 0.02, -0.30, bank.side * 1.30);
    guideB.rotation.x = bank.side * -18 * Math.PI / 180;
    group.add(guideB);

    const tensioner = cylinder(`${label} chain tensioner plunger`, 0.10, 0.13, 0.42, 24, m.aluminum, 'z');
    tensioner.position.set(bank.plane, -0.75, bank.side * 1.20);
    group.add(tensioner);
  }

  addInspectable(engine, engine.systems.valvetrain, group, META.timingDrive);
}

function updateResolvedDrive(engine) {
  const accessoryRotors = engine.userData?.resolvedAccessoryRotors ?? [];
  for (const rotor of accessoryRotors) {
    rotor.rotation.x = rotor.userData.driveDirection * engine.crankAngle * rotor.userData.driveRatio;
  }
  const timingRotors = engine.userData?.resolvedTimingRotors ?? [];
  for (const rotor of timingRotors) {
    rotor.object.rotation.x = -engine.crankAngle * rotor.ratio + rotor.phase;
  }
}

export function applyFrontDriveRebuild(engine) {
  if (engine.root.userData.frontDriveRebuildApplied) return;
  engine.root.userData.frontDriveRebuildApplied = true;

  removeNamedSubtrees(engine, new Set([
    'timing chain cover',
    'harmonic damper',
    'water pump pulley',
    'alternator pulley',
    'idler pulley',
    'tensioner pulley',
    'serpentine belt',
    'alternator',
    'centrifugal water pump',
    'belt tensioner arm',
    'front drive structural brackets tensioner and timing references',
    'front drive fasteners brackets and connections',
    'cam bearing caps timing sprockets chains and guides',
    'lower belt debris guard',
  ]));

  const front = engine.root.getObjectByName('front accessory drive');
  if (!front) return;
  addFrontCover(engine, front);
  addAccessoryDrive(engine, front);
  addTimingDrive(engine);
}

const previousUpdate = V8Engine.prototype.update;
V8Engine.prototype.update = function rebuiltFrontDriveUpdate(...args) {
  const result = previousUpdate.apply(this, args);
  applyFrontDriveRebuild(this);
  updateResolvedDrive(this);
  return result;
};
