import * as THREE from 'three';
import {
  bolt,
  createWireOverlay,
  cylinder,
  makeTextDecal,
  orientBetween,
  registerPart,
  rememberBaseTransform,
  roundedBox,
  sphere,
  spring,
  torus,
  tube,
} from './primitives.js';
import { cloneMaterial } from './materials.js';

const DEG = Math.PI / 180;
const BANK_ANGLE = 45 * DEG;
const CRANK_Y = -1.55;
const CYLINDER_X = [-3.3, -1.1, 1.1, 3.3];
const FIRING_ORDER = [1, 8, 4, 3, 6, 5, 7, 2];
const SYSTEMS = ['structure', 'rotating', 'valvetrain', 'intake', 'exhaust', 'accessories'];

const PARTS = {
  block: {
    system: 'STRUCTURE', name: 'Deep-skirt engine block', material: 'Compacted graphite iron',
    function: 'Carries the crankshaft, cylinder banks and main bearing loads.',
    description: 'A 90-degree V8 block assembled from a deep crankcase, two bank shells, cylinder liners, main-cap ribs and machined deck details.',
  },
  crankshaft: {
    system: 'BOTTOM END', name: 'Cross-plane crankshaft', material: 'Nitrided forged steel',
    function: 'Converts reciprocating piston force into output torque.',
    description: 'Four crank throws, five main journals, eight counterweights and a front snout form the rotating backbone of the engine.',
  },
  piston: {
    system: 'BOTTOM END', name: 'Forged piston assembly', material: 'Forged aluminum / steel rings',
    function: 'Transfers cylinder pressure through the wrist pin to the connecting rod.',
    description: 'Each piston includes a dished crown, ring pack, skirt reliefs and a visible wrist pin aligned to its bank.',
  },
  rod: {
    system: 'BOTTOM END', name: 'I-beam connecting rod', material: 'Forged 4340 steel',
    function: 'Links the piston pin to the moving crankpin.',
    description: 'The animated rod is solved every frame from slider-crank kinematics instead of following a pre-authored animation.',
  },
  head: {
    system: 'VALVETRAIN', name: 'Four-valve cylinder head', material: 'Heat-treated aluminum',
    function: 'Seals the cylinders and supports the valves, ports and camshafts.',
    description: 'Each bank carries a machined head, sculpted cam cover, plug wells, valve springs, rockers and twin camshafts.',
  },
  valve: {
    system: 'VALVETRAIN', name: 'Poppet valve and spring', material: 'Inconel / chrome-silicon steel',
    function: 'Controls gas exchange between the chamber and intake or exhaust port.',
    description: 'Intake and exhaust pairs are laid out per cylinder, with helical springs and animated lift tied to the four-stroke cycle.',
  },
  intake: {
    system: 'INTAKE', name: 'Individual-runner intake system', material: 'Cast aluminum / composite',
    function: 'Meters and distributes charge air to all eight intake ports.',
    description: 'A central plenum, tapered throttle body, fuel rails and eight curved runners are generated from parametric paths.',
  },
  exhaust: {
    system: 'EXHAUST', name: 'Equal-length tubular headers', material: 'Thin-wall stainless steel',
    function: 'Routes exhaust pulses from each cylinder into paired collectors.',
    description: 'Eight independently curved primary tubes sweep around the banks and converge into collectors beneath the engine.',
  },
  accessories: {
    system: 'ACCESSORIES', name: 'Front accessory drive', material: 'Aluminum / steel / EPDM',
    function: 'Drives the alternator, coolant pump and ancillary systems.',
    description: 'The front dress includes a harmonic damper, water-pump pulley, idlers, alternator, tensioner and a closed serpentine belt path.',
  },
  ignition: {
    system: 'IGNITION', name: 'Coil-on-plug ignition', material: 'Glass-filled polymer / ceramic',
    function: 'Generates the high-voltage spark that initiates combustion.',
    description: 'Eight coils, porcelain plug bodies and terminal details sit in the cylinder-head valleys.',
  },
  flywheel: {
    system: 'OUTPUT', name: 'Lightweight flywheel', material: 'Forged steel',
    function: 'Stores rotational energy and couples the crankshaft to the driveline.',
    description: 'A drilled flywheel and starter ring gear close the rear of the rotating assembly.',
  },
};

function bankVector(side) {
  return new THREE.Vector3(0, Math.cos(BANK_ANGLE), side * Math.sin(BANK_ANGLE));
}

function bankQuaternion(side) {
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), side * BANK_ANGLE);
}

function setShadow(group) {
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
}

function angleDistance(a, b, period = Math.PI * 4) {
  return Math.abs(((a - b + period * 0.5) % period) - period * 0.5);
}

export class V8Engine {
  constructor(materials) {
    this.materials = materials;
    this.root = new THREE.Group();
    this.root.name = 'Procedural V8 engine';
    this.root.rotation.y = -12 * DEG;
    this.root.position.y = 0.2;

    this.systems = {};
    this.pickables = [];
    this.labels = [];
    this.wireOverlays = [];
    this.explodables = [];
    this.bodyMaterials = [];
    this.cylinders = [];
    this.valves = [];
    this.rotors = [];
    this.camshafts = [];
    this.combustionEnabled = true;
    this.currentFiringCylinder = 1;
    this.crankAngle = 0;
    this.cycleAngle = 0;

    for (const systemName of SYSTEMS) {
      const group = new THREE.Group();
      group.name = systemName;
      this.systems[systemName] = group;
      this.root.add(group);
    }

    this.#buildStructure();
    this.#buildBottomEnd();
    this.#buildHeadsAndValvetrain();
    this.#buildIntake();
    this.#buildExhaust();
    this.#buildAccessories();
    this.#buildSmallDetails();
    this.#buildLabels();
    this.#prepareRenderHelpers();
  }

  #addPart(system, object, metadata) {
    registerPart(object, metadata, this.pickables);
    this.systems[system].add(object);
    return object;
  }

  #markExplodable(object, offset) {
    rememberBaseTransform(object, offset);
    this.explodables.push(object);
    return object;
  }

  #buildStructure() {
    const structure = this.systems.structure;
    const m = this.materials;

    const crankcase = roundedBox('deep-skirt crankcase', new THREE.Vector3(9.65, 2.25, 3.2), 0.34, cloneMaterial(m.castIron));
    crankcase.position.y = -1.28;
    this.bodyMaterials.push(crankcase.material);
    this.#addPart('structure', crankcase, PARTS.block);

    const sumpRail = roundedBox('oil pan rail', new THREE.Vector3(9.25, 0.38, 3.0), 0.12, m.castIronDark);
    sumpRail.position.y = -2.42;
    structure.add(sumpRail);

    const oilPan = roundedBox('ribbed dry sump pan', new THREE.Vector3(8.2, 0.82, 2.55), 0.2, m.satinBlack);
    oilPan.position.y = -2.82;
    this.#markExplodable(oilPan, new THREE.Vector3(0, -1.45, 0));
    this.#addPart('structure', oilPan, {
      system: 'LUBRICATION', name: 'Dry-sump lower pan', material: 'Cast aluminum',
      function: 'Collects scavenged oil while preserving ground clearance.',
      description: 'A shallow ribbed pan closes the deep-skirt crankcase and exposes the main bearing region in exploded view.',
    });

    for (let x = -3.5; x <= 3.5; x += 1.0) {
      const rib = roundedBox('oil pan cooling rib', new THREE.Vector3(0.08, 0.48, 2.68), 0.02, m.blackOxide, 2);
      rib.position.set(x, -2.92, 0);
      structure.add(rib);
    }

    for (const side of [-1, 1]) {
      const q = bankQuaternion(side);
      const n = bankVector(side);
      const bankShell = roundedBox(`${side > 0 ? 'left' : 'right'} cylinder bank`, new THREE.Vector3(9.25, 2.55, 2.05), 0.27, cloneMaterial(m.castIron));
      bankShell.quaternion.copy(q);
      bankShell.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 2.08));
      bankShell.position.y -= 0.12;
      this.bodyMaterials.push(bankShell.material);
      this.#addPart('structure', bankShell, PARTS.block);

      const deck = roundedBox('machined deck surface', new THREE.Vector3(9.05, 0.18, 1.92), 0.06, m.machinedSteel, 2);
      deck.quaternion.copy(q);
      deck.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 3.37));
      structure.add(deck);

      const outerRail = roundedBox('bank reinforcement rail', new THREE.Vector3(8.85, 0.34, 0.25), 0.08, m.castIronDark);
      outerRail.quaternion.copy(q);
      outerRail.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 2.15).add(new THREE.Vector3(0, 0, side * 1.08)));
      structure.add(outerRail);

      CYLINDER_X.forEach((x, index) => {
        const boreCenter = new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 2.63);
        const liner = cylinder(`cylinder liner ${side > 0 ? 'L' : 'R'}${index + 1}`, 0.7, 0.7, 2.28, 40, m.darkSteel);
        liner.quaternion.copy(q);
        liner.position.copy(boreCenter);
        structure.add(liner);

        const boreGhost = cylinder('transparent cylinder bore', 0.62, 0.62, 2.34, 32, cloneMaterial(m.glass, { opacity: 0.1 }));
        boreGhost.quaternion.copy(q);
        boreGhost.position.copy(boreCenter);
        structure.add(boreGhost);

        const deckRing = torus('fire ring', 0.71, 0.055, 10, 40, m.copper, 'y');
        deckRing.quaternion.copy(q);
        deckRing.position.copy(new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 3.46));
        structure.add(deckRing);
      });

      for (const x of [-4.05, -2.2, 0, 2.2, 4.05]) {
        const freezePlug = cylinder('core plug', 0.24, 0.24, 0.08, 24, m.bronze, 'z');
        freezePlug.position.set(x, -0.42, side * 1.72);
        structure.add(freezePlug);
      }
    }

    for (const x of [-4.3, -2.15, 0, 2.15, 4.3]) {
      const mainWeb = roundedBox('main bearing bulkhead', new THREE.Vector3(0.24, 1.48, 2.95), 0.08, m.castIronDark, 3);
      mainWeb.position.set(x, -1.45, 0);
      structure.add(mainWeb);
      const mainCap = roundedBox('cross-bolted main cap', new THREE.Vector3(0.62, 0.55, 1.78), 0.12, m.darkSteel);
      mainCap.position.set(x, -2.12, 0);
      structure.add(mainCap);
      for (const z of [-0.74, 0.74]) {
        const crossBolt = bolt('cross bolt', 0.55, 0.095, m.machinedSteel);
        crossBolt.rotation.x = Math.PI / 2;
        crossBolt.position.set(x, -2.03, z);
        structure.add(crossBolt);
      }
    }

    const bellhousingFlange = cylinder('bellhousing flange', 2.0, 2.0, 0.26, 48, m.castIron, 'x');
    bellhousingFlange.position.set(4.95, -1.35, 0);
    structure.add(bellhousingFlange);
    const timingFlange = cylinder('front timing flange', 1.85, 1.85, 0.22, 48, m.castIron, 'x');
    timingFlange.position.set(-4.95, -1.35, 0);
    structure.add(timingFlange);
  }

  #buildBottomEnd() {
    const m = this.materials;
    const crank = new THREE.Group();
    crank.name = 'cross-plane crankshaft assembly';
    crank.position.set(0, CRANK_Y, 0);
    this.crankshaft = crank;

    const shaft = cylinder('crankshaft main axis', 0.23, 0.23, 10.45, 36, m.machinedSteel, 'x');
    crank.add(shaft);

    const mainJournalX = [-4.35, -2.2, 0, 2.2, 4.35];
    for (const x of mainJournalX) {
      const journal = cylinder('main journal', 0.43, 0.43, 0.48, 40, m.machinedSteel, 'x');
      journal.position.x = x;
      crank.add(journal);
      const cheekA = cylinder('crank cheek', 0.9, 0.9, 0.16, 40, m.darkSteel, 'x');
      const cheekB = cheekA.clone();
      cheekA.position.x = x - 0.34;
      cheekB.position.x = x + 0.34;
      crank.add(cheekA, cheekB);
    }

    const throwPhases = [0, Math.PI / 2, Math.PI * 1.5, Math.PI];
    CYLINDER_X.forEach((x, index) => {
      const phase = throwPhases[index];
      const y = 0.68 * Math.cos(phase);
      const z = 0.68 * Math.sin(phase);
      const pin = cylinder(`crankpin throw ${index + 1}`, 0.34, 0.34, 1.06, 36, m.machinedSteel, 'x');
      pin.position.set(x, y, z);
      crank.add(pin);

      for (const dx of [-0.66, 0.66]) {
        const web = roundedBox('forged crank web', new THREE.Vector3(0.24, 1.55, 1.18), 0.18, m.darkSteel);
        web.position.set(x + dx, y * 0.42, z * 0.42);
        web.rotation.x = phase;
        crank.add(web);

        const weight = sphere('sculpted counterweight', 0.62, m.darkSteel, 28, 18);
        weight.scale.set(0.25, 1.35, 0.85);
        weight.position.set(x + dx, -y * 0.76, -z * 0.76);
        crank.add(weight);
      }
    });

    const snout = cylinder('crankshaft snout', 0.25, 0.31, 1.05, 36, m.machinedSteel, 'x');
    snout.position.x = -5.7;
    crank.add(snout);
    const rearFlange = cylinder('rear crank flange', 0.8, 0.8, 0.28, 40, m.darkSteel, 'x');
    rearFlange.position.x = 5.35;
    crank.add(rearFlange);
    this.#addPart('rotating', crank, PARTS.crankshaft);

    const flywheel = new THREE.Group();
    flywheel.name = 'flywheel assembly';
    flywheel.position.set(5.75, CRANK_Y, 0);
    const disc = cylinder('drilled flywheel', 1.62, 1.62, 0.35, 64, m.darkSteel, 'x');
    flywheel.add(disc);
    const ringGear = torus('starter ring gear', 1.66, 0.12, 10, 96, m.machinedSteel, 'x');
    flywheel.add(ringGear);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const hole = cylinder('flywheel relief', 0.15, 0.15, 0.42, 20, m.blackOxide, 'x');
      hole.position.set(0, Math.cos(angle) * 1.08, Math.sin(angle) * 1.08);
      flywheel.add(hole);
    }
    this.rotors.push(flywheel);
    this.#markExplodable(flywheel, new THREE.Vector3(1.5, 0, 0));
    this.#addPart('rotating', flywheel, PARTS.flywheel);

    const cylinderNumbers = {
      '1:0': 1, '1:1': 3, '1:2': 5, '1:3': 7,
      '-1:0': 2, '-1:1': 4, '-1:2': 6, '-1:3': 8,
    };
    const firingPhase = new Map(FIRING_ORDER.map((number, index) => [number, index * Math.PI / 2]));

    for (const side of [1, -1]) {
      const n = bankVector(side);
      const q = bankQuaternion(side);
      CYLINDER_X.forEach((x, index) => {
        const number = cylinderNumbers[`${side}:${index}`];
        const cyclePhase = firingPhase.get(number);
        const crankPhase = throwPhases[index];

        const piston = new THREE.Group();
        piston.name = `piston ${number}`;
        piston.quaternion.copy(q);
        const crown = cylinder('piston crown', 0.605, 0.61, 0.78, 40, m.polishedAluminum);
        piston.add(crown);
        const dish = cylinder('piston combustion dish', 0.38, 0.46, 0.09, 36, m.blackOxide);
        dish.position.y = 0.435;
        piston.add(dish);
        for (const y of [0.22, 0.31, 0.4]) {
          const ring = torus('piston ring', 0.607, 0.025, 8, 48, m.darkSteel, 'y');
          ring.position.y = y;
          piston.add(ring);
        }
        const pin = cylinder('wrist pin', 0.12, 0.12, 0.93, 24, m.machinedSteel, 'z');
        pin.position.y = -0.08;
        piston.add(pin);
        const skirtA = roundedBox('piston skirt', new THREE.Vector3(0.72, 0.52, 0.32), 0.12, m.aluminum);
        skirtA.position.set(0, -0.42, 0.31);
        const skirtB = skirtA.clone();
        skirtB.position.z = -0.31;
        piston.add(skirtA, skirtB);
        this.#addPart('rotating', piston, PARTS.piston);

        const rod = new THREE.Group();
        rod.name = `connecting rod ${number}`;
        const beam = cylinder('connecting rod beam', 0.115, 0.145, 3.18, 20, m.darkSteel);
        rod.add(beam);
        const smallEnd = torus('small end eye', 0.25, 0.105, 10, 28, m.machinedSteel, 'z');
        smallEnd.position.y = 1.59;
        rod.add(smallEnd);
        const bigEnd = torus('big end eye', 0.42, 0.15, 10, 32, m.machinedSteel, 'z');
        bigEnd.position.y = -1.59;
        rod.add(bigEnd);
        const cap = roundedBox('rod cap', new THREE.Vector3(0.72, 0.24, 0.31), 0.08, m.darkSteel);
        cap.position.y = -1.9;
        rod.add(cap);
        this.#addPart('rotating', rod, PARTS.rod);

        const flame = sphere(`combustion pulse cylinder ${number}`, 0.5, m.combustion, 28, 18);
        flame.material = m.combustion.clone();
        flame.renderOrder = 4;
        this.systems.rotating.add(flame);

        this.cylinders.push({
          side, index, number, n, q, x, piston, rod, flame,
          cyclePhase, crankPhase, crankRadius: 0.68, rodLength: 3.18,
          chamberDistance: 3.44,
        });
      });
    }
  }

  #buildHeadsAndValvetrain() {
    const m = this.materials;

    for (const side of [1, -1]) {
      const n = bankVector(side);
      const q = bankQuaternion(side);
      const sign = side > 0 ? 'left' : 'right';

      const headGroup = new THREE.Group();
      headGroup.name = `${sign} cylinder head assembly`;
      const head = roundedBox(`${sign} cylinder head`, new THREE.Vector3(9.3, 0.86, 2.18), 0.22, cloneMaterial(m.aluminum));
      head.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 3.76));
      head.quaternion.copy(q);
      headGroup.add(head);
      this.bodyMaterials.push(head.material);

      const cover = roundedBox(`${sign} cam cover`, new THREE.Vector3(8.95, 0.82, 1.86), 0.3, m.redPaint);
      cover.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 4.57));
      cover.quaternion.copy(q);
      headGroup.add(cover);

      const coverInset = roundedBox('cam cover inset', new THREE.Vector3(6.8, 0.06, 1.16), 0.18, m.satinBlack);
      coverInset.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 5.01));
      coverInset.quaternion.copy(q);
      headGroup.add(coverInset);

      const decal = makeTextDecal('V8  DOHC  32V', { worldWidth: 3.1, worldHeight: 0.38, fontSize: 64 });
      decal.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 5.055));
      decal.quaternion.copy(q);
      decal.rotateX(-Math.PI / 2);
      headGroup.add(decal);

      for (const x of [-4.05, -2.7, -1.35, 0, 1.35, 2.7, 4.05]) {
        for (const lateral of [-0.72, 0.72]) {
          const fastener = bolt('cam cover fastener', 0.18, 0.085, m.machinedSteel);
          fastener.position.copy(new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 5.05));
          fastener.position.z += side * lateral * 0.66;
          fastener.quaternion.copy(q);
          headGroup.add(fastener);
        }
      }

      this.#markExplodable(headGroup, new THREE.Vector3(0, 1.45, side * 1.45));
      this.#addPart('valvetrain', headGroup, PARTS.head);

      for (const lateral of [-0.48, 0.48]) {
        const cam = new THREE.Group();
        cam.name = `${sign} ${lateral < 0 ? 'intake' : 'exhaust'} camshaft`;
        cam.position.copy(new THREE.Vector3(0, CRANK_Y, 0).addScaledVector(n, 4.55));
        cam.position.z += side * lateral;
        cam.quaternion.copy(q);
        const camCore = cylinder('camshaft core', 0.11, 0.11, 8.55, 24, m.machinedSteel, 'x');
        cam.add(camCore);
        CYLINDER_X.forEach((x, index) => {
          for (const dx of [-0.18, 0.18]) {
            const lobe = sphere('cam lobe', 0.22, m.darkSteel, 20, 12);
            lobe.scale.set(0.34, 1.0, 0.67);
            lobe.position.x = x + dx;
            lobe.rotation.x = (index * 58 + (lateral > 0 ? 34 : 0)) * DEG;
            cam.add(lobe);
          }
        });
        this.camshafts.push(cam);
        this.systems.valvetrain.add(cam);
      }

      CYLINDER_X.forEach((x, index) => {
        for (const valveType of ['intake', 'exhaust']) {
          const lateralBase = valveType === 'intake' ? -0.38 : 0.38;
          for (const pairOffset of [-0.19, 0.19]) {
            const valveGroup = new THREE.Group();
            valveGroup.name = `${valveType} valve ${sign} ${index + 1}`;
            const localSideOffset = side * (lateralBase + pairOffset);
            valveGroup.position.copy(new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 4.02));
            valveGroup.position.z += localSideOffset;
            valveGroup.quaternion.copy(q);

            const stem = cylinder('valve stem', 0.035, 0.035, 0.82, 12, m.machinedSteel);
            stem.position.y = -0.16;
            const headDisc = cylinder('valve head', 0.18, 0.18, 0.055, 24, valveType === 'intake' ? m.machinedSteel : m.exhaustHot);
            headDisc.position.y = -0.58;
            const valveSpring = spring('valve spring', 0.12, 0.021, 0.52, 7.2, m.chrome, 70);
            valveSpring.position.y = 0.15;
            const retainer = cylinder('spring retainer', 0.13, 0.13, 0.055, 20, m.darkSteel);
            retainer.position.y = 0.43;
            const bucket = cylinder('cam follower', 0.16, 0.16, 0.12, 20, m.blackOxide);
            bucket.position.y = 0.55;
            valveGroup.add(stem, headDisc, valveSpring, retainer, bucket);
            this.#addPart('valvetrain', valveGroup, PARTS.valve);
            this.valves.push({
              object: valveGroup,
              number: side > 0 ? index * 2 + 1 : index * 2 + 2,
              type: valveType,
              basePosition: valveGroup.position.clone(),
              n: n.clone(),
            });
          }
        }

        const coil = new THREE.Group();
        coil.name = `coil-on-plug ${sign} ${index + 1}`;
        coil.position.copy(new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 4.87));
        coil.position.z += side * 0.03;
        coil.quaternion.copy(q);
        const boot = cylinder('ignition coil boot', 0.09, 0.075, 0.7, 18, m.rubber);
        boot.position.y = -0.22;
        const body = roundedBox('ignition coil body', new THREE.Vector3(0.44, 0.38, 0.34), 0.09, m.satinBlack);
        body.position.y = 0.33;
        const plug = cylinder('spark plug ceramic', 0.065, 0.07, 0.34, 16, m.ceramic);
        plug.position.y = -0.67;
        const terminal = cylinder('coil terminal', 0.035, 0.035, 0.15, 12, m.copper);
        terminal.position.y = -0.91;
        coil.add(boot, body, plug, terminal);
        this.#addPart('valvetrain', coil, PARTS.ignition);
      });
    }
  }

  #buildIntake() {
    const m = this.materials;
    const intakeGroup = new THREE.Group();
    intakeGroup.name = 'complete intake system';

    const valleyTray = roundedBox('valley cover', new THREE.Vector3(8.7, 0.22, 1.35), 0.14, m.satinBlack);
    valleyTray.position.set(0, 2.0, 0);
    intakeGroup.add(valleyTray);

    const plenum = roundedBox('intake plenum', new THREE.Vector3(6.9, 1.0, 1.7), 0.42, m.intakeDark);
    plenum.position.set(0.2, 3.12, 0);
    intakeGroup.add(plenum);

    const plenumTop = roundedBox('plenum top plate', new THREE.Vector3(6.45, 0.12, 1.35), 0.12, m.carbon);
    plenumTop.position.set(0.2, 3.66, 0);
    intakeGroup.add(plenumTop);

    const intakeDecal = makeTextDecal('CROSS-PLANE  V8', { worldWidth: 2.75, worldHeight: 0.4, fontSize: 64, color: '#d9dde1' });
    intakeDecal.rotation.x = -Math.PI / 2;
    intakeDecal.position.set(0.2, 3.735, 0);
    intakeGroup.add(intakeDecal);

    for (const side of [1, -1]) {
      const n = bankVector(side);
      CYLINDER_X.forEach((x, index) => {
        const runnerStart = new THREE.Vector3(x * 0.82 + 0.2, 2.92, side * 0.58);
        const runnerEnd = new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 4.25);
        runnerEnd.z -= side * 0.56;
        const sweep = side * (0.6 + (index % 2) * 0.14);
        const runner = tube('intake runner', [
          runnerStart,
          new THREE.Vector3(x * 0.9 + 0.1, 2.65, side * 0.95),
          new THREE.Vector3(x, 2.18, side * (1.3 + sweep * 0.25)),
          runnerEnd,
        ], 0.18, m.polishedAluminum, 42, 12);
        intakeGroup.add(runner);

        const injector = new THREE.Group();
        injector.name = `fuel injector ${side > 0 ? 'L' : 'R'}${index + 1}`;
        injector.position.copy(runnerEnd.clone().lerp(new THREE.Vector3(x, 2.45, side * 0.95), 0.25));
        const injectorBody = cylinder('injector body', 0.065, 0.065, 0.46, 16, m.fuel);
        injectorBody.rotation.z = Math.PI / 2;
        const connector = roundedBox('injector connector', new THREE.Vector3(0.2, 0.15, 0.18), 0.04, m.satinBlack);
        connector.position.y = 0.18;
        injector.add(injectorBody, connector);
        intakeGroup.add(injector);
      });

      const rail = cylinder('fuel rail', 0.085, 0.085, 8.0, 20, m.redPaint, 'x');
      rail.position.set(0, 2.68, side * 1.2);
      intakeGroup.add(rail);
      for (const x of [-3.7, 3.7]) {
        const railMount = bolt('fuel rail mount', 0.32, 0.07, m.machinedSteel);
        railMount.position.set(x, 2.55, side * 1.2);
        intakeGroup.add(railMount);
      }
    }

    const throttle = new THREE.Group();
    throttle.name = 'electronic throttle body';
    throttle.position.set(-3.98, 3.15, 0);
    const throttleHousing = cylinder('throttle housing', 0.7, 0.62, 0.9, 40, m.polishedAluminum, 'x');
    throttle.add(throttleHousing);
    const butterfly = cylinder('throttle butterfly', 0.52, 0.52, 0.045, 32, m.bronze, 'x');
    butterfly.position.x = -0.08;
    butterfly.rotation.z = 18 * DEG;
    throttle.add(butterfly);
    const motor = roundedBox('throttle actuator', new THREE.Vector3(0.65, 0.65, 0.72), 0.18, m.satinBlack);
    motor.position.set(0, 0, -0.78);
    throttle.add(motor);
    intakeGroup.add(throttle);

    const inlet = tube('air inlet elbow', [
      new THREE.Vector3(-4.42, 3.15, 0),
      new THREE.Vector3(-5.1, 3.22, 0),
      new THREE.Vector3(-5.48, 3.62, 0.22),
      new THREE.Vector3(-5.6, 4.05, 0.52),
    ], 0.62, m.carbon, 38, 20);
    intakeGroup.add(inlet);
    const clamp = torus('intake hose clamp', 0.64, 0.035, 8, 50, m.chrome, 'x');
    clamp.position.set(-4.77, 3.2, 0.03);
    intakeGroup.add(clamp);

    this.#markExplodable(intakeGroup, new THREE.Vector3(0, 2.0, 0));
    this.#addPart('intake', intakeGroup, PARTS.intake);
  }

  #buildExhaust() {
    const m = this.materials;
    const exhaustGroup = new THREE.Group();
    exhaustGroup.name = 'equal-length exhaust header system';

    for (const side of [1, -1]) {
      const n = bankVector(side);
      const sign = side > 0 ? 'left' : 'right';
      CYLINDER_X.forEach((x, index) => {
        const port = new THREE.Vector3(x, CRANK_Y, 0).addScaledVector(n, 4.0);
        port.z += side * 1.0;
        const lane = (index - 1.5) * 0.18;
        const header = tube(`${sign} primary header ${index + 1}`, [
          port,
          new THREE.Vector3(x, 1.25, side * 2.72),
          new THREE.Vector3(x + lane, 0.2 - index * 0.06, side * (3.15 + index * 0.08)),
          new THREE.Vector3(2.75 + index * 0.18, -1.15 - index * 0.1, side * 3.0),
          new THREE.Vector3(3.55, -1.65, side * 2.65),
        ], 0.105, index < 2 ? m.exhaustHot : m.exhaust, 56, 10);
        exhaustGroup.add(header);
        const flange = roundedBox('exhaust port flange', new THREE.Vector3(0.58, 0.5, 0.09), 0.08, m.darkSteel);
        flange.position.copy(port);
        flange.rotation.x = side * BANK_ANGLE;
        exhaustGroup.add(flange);
      });

      const collector = cylinder(`${sign} header collector`, 0.36, 0.57, 1.55, 32, m.exhaust, 'x');
      collector.rotation.z = -18 * DEG;
      collector.position.set(4.08, -1.82, side * 2.64);
      exhaustGroup.add(collector);
      const collectorBand = torus('collector V-band clamp', 0.38, 0.055, 8, 40, m.chrome, 'x');
      collectorBand.position.set(4.78, -1.6, side * 2.64);
      exhaustGroup.add(collectorBand);
      const oxygenSensor = new THREE.Group();
      oxygenSensor.position.set(3.78, -1.48, side * 2.93);
      const sensorBody = cylinder('oxygen sensor', 0.08, 0.08, 0.35, 16, m.machinedSteel);
      sensorBody.rotation.z = Math.PI / 2;
      const sensorWire = tube('oxygen sensor lead', [
        new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(-0.3, 0.55, side * 0.1), new THREE.Vector3(-0.7, 0.8, side * 0.15),
      ], 0.025, m.hose, 20, 6);
      oxygenSensor.add(sensorBody, sensorWire);
      exhaustGroup.add(oxygenSensor);
    }

    this.#markExplodable(exhaustGroup, new THREE.Vector3(0, 0, 2.0));
    this.#addPart('exhaust', exhaustGroup, PARTS.exhaust);
  }

  #buildAccessories() {
    const m = this.materials;
    const front = new THREE.Group();
    front.name = 'front accessory drive';
    front.position.x = -5.25;

    const timingCover = roundedBox('timing chain cover', new THREE.Vector3(0.45, 3.5, 3.0), 0.35, m.aluminum);
    timingCover.position.y = -0.3;
    front.add(timingCover);

    const pulleySpecs = [
      { name: 'harmonic damper', y: -1.55, z: 0, r: 0.95, material: m.darkSteel },
      { name: 'water pump pulley', y: 0.08, z: 0, r: 0.7, material: m.machinedSteel },
      { name: 'alternator pulley', y: 0.55, z: 1.28, r: 0.42, material: m.darkSteel },
      { name: 'idler pulley', y: 1.18, z: -0.85, r: 0.34, material: m.darkSteel },
      { name: 'tensioner pulley', y: -0.15, z: -1.35, r: 0.38, material: m.darkSteel },
    ];

    for (const spec of pulleySpecs) {
      const pulley = new THREE.Group();
      pulley.name = spec.name;
      pulley.position.set(-0.35, spec.y, spec.z);
      const disc = cylinder(spec.name, spec.r, spec.r, 0.24, 44, spec.material, 'x');
      pulley.add(disc);
      for (let groove = -2; groove <= 2; groove += 1) {
        const ring = torus('pulley groove', spec.r + 0.015, 0.018, 7, 54, m.blackOxide, 'x');
        ring.position.x = groove * 0.035;
        pulley.add(ring);
      }
      const hub = cylinder('pulley hub', spec.r * 0.25, spec.r * 0.25, 0.34, 28, m.machinedSteel, 'x');
      pulley.add(hub);
      front.add(pulley);
      this.rotors.push(pulley);
    }

    const beltPoints = [
      new THREE.Vector3(-0.51, -2.38, 0),
      new THREE.Vector3(-0.51, -1.78, 1.02),
      new THREE.Vector3(-0.51, 0.16, 1.7),
      new THREE.Vector3(-0.51, 0.9, 1.38),
      new THREE.Vector3(-0.51, 1.6, -0.75),
      new THREE.Vector3(-0.51, 1.1, -1.24),
      new THREE.Vector3(-0.51, -0.44, -1.71),
      new THREE.Vector3(-0.51, -2.25, -0.76),
    ];
    front.add(tube('serpentine belt', beltPoints, 0.065, m.belt, 100, 7, true));

    const alternator = new THREE.Group();
    alternator.name = 'alternator';
    alternator.position.set(-0.03, 0.55, 1.58);
    const caseBody = cylinder('vented alternator case', 0.66, 0.66, 0.82, 32, m.aluminum, 'x');
    alternator.add(caseBody);
    const alternatorCore = cylinder('alternator rotor', 0.4, 0.4, 0.88, 28, m.copper, 'x');
    alternator.add(alternatorCore);
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const vent = roundedBox('alternator cooling slot', new THREE.Vector3(0.9, 0.07, 0.22), 0.03, m.blackOxide, 2);
      vent.position.set(0, Math.cos(angle) * 0.51, Math.sin(angle) * 0.51);
      vent.rotation.x = angle;
      alternator.add(vent);
    }
    front.add(alternator);

    const waterPump = new GroupWithImpeller(m);
    waterPump.position.set(-0.04, 0.05, 0);
    front.add(waterPump);
    this.rotors.push(waterPump.userData.rotor);

    const tensionerArm = roundedBox('belt tensioner arm', new THREE.Vector3(0.26, 1.28, 0.22), 0.1, m.darkSteel);
    tensionerArm.position.set(-0.1, -0.65, -1.12);
    tensionerArm.rotation.x = 24 * DEG;
    front.add(tensionerArm);

    this.#markExplodable(front, new THREE.Vector3(-1.65, 0, 0));
    this.#addPart('accessories', front, PARTS.accessories);

    const starter = new THREE.Group();
    starter.name = 'starter motor';
    starter.position.set(4.4, -2.1, -1.38);
    const starterBody = cylinder('starter motor body', 0.42, 0.42, 1.55, 30, m.satinBlack, 'x');
    const starterNose = cylinder('starter nose', 0.28, 0.34, 0.48, 28, m.aluminum, 'x');
    starterNose.position.x = 0.93;
    const solenoid = cylinder('starter solenoid', 0.18, 0.18, 0.9, 22, m.satinBlack, 'x');
    solenoid.position.set(-0.12, 0.55, 0);
    starter.add(starterBody, starterNose, solenoid);
    this.#addPart('accessories', starter, {
      system: 'ACCESSORIES', name: 'Gear-reduction starter', material: 'Steel / permanent magnet',
      function: 'Cranks the engine through the flywheel ring gear.',
      description: 'A compact motor, reduction nose and solenoid are packaged beside the rear crankcase.',
    });
  }

  #buildSmallDetails() {
    const m = this.materials;
    const accessories = this.systems.accessories;

    const oilFilter = new THREE.Group();
    oilFilter.name = 'spin-on oil filter';
    oilFilter.position.set(-2.9, -2.1, -1.85);
    oilFilter.rotation.x = -18 * DEG;
    const can = cylinder('oil filter canister', 0.36, 0.36, 1.05, 30, m.orangePaint);
    const base = cylinder('oil filter base plate', 0.38, 0.38, 0.12, 30, m.darkSteel);
    base.position.y = 0.55;
    oilFilter.add(can, base);
    accessories.add(oilFilter);

    const dipstick = tube('oil dipstick tube', [
      new THREE.Vector3(2.9, -2.2, 1.42),
      new THREE.Vector3(3.2, -1.3, 1.65),
      new THREE.Vector3(3.42, 0.1, 1.82),
      new THREE.Vector3(3.35, 1.05, 1.95),
    ], 0.035, m.machinedSteel, 28, 7);
    const dipHandle = torus('dipstick handle', 0.14, 0.035, 8, 24, m.orangePaint, 'z');
    dipHandle.position.set(3.35, 1.14, 1.95);
    accessories.add(dipstick, dipHandle);

    for (const side of [-1, 1]) {
      const coolantRail = tube('coolant crossover tube', [
        new THREE.Vector3(-3.8, 1.2, side * 1.7),
        new THREE.Vector3(-2.0, 1.0, side * 1.9),
        new THREE.Vector3(0, 0.85, side * 2.0),
        new THREE.Vector3(2.2, 1.0, side * 1.9),
        new THREE.Vector3(3.8, 1.25, side * 1.72),
      ], 0.09, m.blueHose, 50, 10);
      accessories.add(coolantRail);

      const breather = tube('cam cover breather hose', [
        new THREE.Vector3(2.7, 2.42, side * 2.35),
        new THREE.Vector3(2.1, 3.0, side * 1.95),
        new THREE.Vector3(1.4, 3.45, side * 1.1),
      ], 0.075, m.hose, 30, 9);
      accessories.add(breather);
    }

    const wiringSpine = tube('engine wiring spine', [
      new THREE.Vector3(-3.7, 3.72, -0.15),
      new THREE.Vector3(-1.8, 3.92, -0.2),
      new THREE.Vector3(0.3, 3.96, -0.2),
      new THREE.Vector3(2.4, 3.84, -0.25),
      new THREE.Vector3(3.8, 3.55, -0.36),
    ], 0.07, m.hose, 45, 8);
    accessories.add(wiringSpine);

    for (const x of CYLINDER_X) {
      const branch = tube('ignition harness branch', [
        new THREE.Vector3(x, 3.88, -0.18),
        new THREE.Vector3(x, 3.55, -0.65),
        new THREE.Vector3(x, 3.1, -1.2),
      ], 0.025, m.hose, 18, 6);
      accessories.add(branch);
    }

    const liftPlate = roundedBox('engine lift plate', new THREE.Vector3(1.25, 0.16, 0.75), 0.08, m.machinedSteel);
    liftPlate.position.set(0.3, 4.02, 0);
    accessories.add(liftPlate);
    for (const x of [-0.35, 0.95]) {
      const eye = torus('lifting eye', 0.22, 0.065, 10, 28, m.machinedSteel, 'z');
      eye.position.set(x, 4.33, 0);
      accessories.add(eye);
    }
  }

  #buildLabels() {
    const labels = [
      ['Cross-plane crankshaft', new THREE.Vector3(0.2, -1.7, 0.35), 'rotating'],
      ['Forged piston', new THREE.Vector3(-1.1, 0.25, 1.45), 'rotating'],
      ['DOHC valvetrain', new THREE.Vector3(1.1, 3.65, 2.15), 'valvetrain'],
      ['Intake plenum', new THREE.Vector3(0.2, 3.5, 0.2), 'intake'],
      ['Equal-length headers', new THREE.Vector3(1.8, 0.0, 3.05), 'exhaust'],
      ['Accessory drive', new THREE.Vector3(-5.65, -0.2, 0.8), 'accessories'],
      ['Flywheel', new THREE.Vector3(5.75, -1.55, 0.6), 'rotating'],
      ['Deep-skirt block', new THREE.Vector3(-0.6, -0.85, -1.6), 'structure'],
    ];
    this.labels = labels.map(([text, position, system]) => ({ text, position, system, element: null }));
  }

  #prepareRenderHelpers() {
    this.root.traverse((object) => {
      if (!object.isMesh || object.userData.isWireOverlay) return;
      const overlay = createWireOverlay(object, 0.12);
      if (overlay) this.wireOverlays.push(overlay);
    });
    setShadow(this.root);
  }

  update(deltaSeconds, rpm, running = true) {
    if (running) {
      const rotationsPerSecond = rpm / 60;
      const deltaAngle = rotationsPerSecond * Math.PI * 2 * deltaSeconds;
      this.crankAngle = (this.crankAngle + deltaAngle) % (Math.PI * 2);
      this.cycleAngle = (this.cycleAngle + deltaAngle) % (Math.PI * 4);
    }

    this.crankshaft.rotation.x = this.crankAngle;
    this.rotors.forEach((rotor, index) => {
      if (!rotor) return;
      rotor.rotation.x = -this.crankAngle * (1 + index * 0.018);
    });
    this.camshafts.forEach((cam, index) => {
      cam.rotation.x = this.crankAngle * 0.5 + index * Math.PI * 0.5;
    });

    let nearestCylinder = 1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const cylinderData of this.cylinders) {
      const { n, x, crankRadius, rodLength, crankPhase, piston, rod, flame, cyclePhase, number } = cylinderData;
      const theta = this.crankAngle + crankPhase;
      const crankPin = new THREE.Vector3(
        x,
        CRANK_Y + crankRadius * Math.cos(theta),
        crankRadius * Math.sin(theta),
      );
      const axisOrigin = new THREE.Vector3(x, CRANK_Y, 0);
      const crankRelative = crankPin.clone().sub(axisOrigin);
      const projection = crankRelative.dot(n);
      const perpendicularSquared = Math.max(0, crankRelative.lengthSq() - projection * projection);
      const pinDistance = projection + Math.sqrt(Math.max(0.001, rodLength * rodLength - perpendicularSquared));
      const pistonPin = axisOrigin.clone().addScaledVector(n, pinDistance);
      piston.position.copy(pistonPin.clone().addScaledVector(n, 0.12));
      orientBetween(rod, crankPin, pistonPin);

      const fireDistance = angleDistance(this.cycleAngle, cyclePhase);
      const pulse = Math.max(0, 1 - fireDistance / (0.19 * Math.PI));
      const shapedPulse = pulse * pulse * (3 - 2 * pulse);
      const chamber = axisOrigin.clone().addScaledVector(n, cylinderData.chamberDistance);
      flame.position.copy(chamber);
      flame.scale.setScalar(0.35 + shapedPulse * 1.2);
      flame.material.opacity = this.combustionEnabled ? shapedPulse * 0.88 : 0;
      flame.visible = this.combustionEnabled && shapedPulse > 0.015;

      if (fireDistance < nearestDistance) {
        nearestDistance = fireDistance;
        nearestCylinder = number;
      }
    }
    this.currentFiringCylinder = nearestCylinder;

    for (const valve of this.valves) {
      const phase = FIRING_ORDER.indexOf(valve.number) * Math.PI / 2;
      const eventCenter = valve.type === 'intake'
        ? (phase + Math.PI * 1.18) % (Math.PI * 4)
        : (phase + Math.PI * 3.25) % (Math.PI * 4);
      const distance = angleDistance(this.cycleAngle, eventCenter);
      const lift = Math.max(0, 1 - distance / (0.54 * Math.PI));
      valve.object.position.copy(valve.basePosition).addScaledVector(valve.n, -lift * 0.105);
    }
  }

  setCutaway(enabled) {
    this.bodyMaterials.forEach((material) => {
      material.transparent = enabled || material.userData.originalTransparent;
      material.opacity = enabled ? 0.19 : material.userData.originalOpacity;
      material.depthWrite = !enabled;
      material.side = enabled ? THREE.DoubleSide : THREE.FrontSide;
      material.needsUpdate = true;
    });
  }

  setExploded(amount) {
    for (const object of this.explodables) {
      const base = object.userData.basePosition;
      const offset = object.userData.explodedOffset;
      object.position.copy(base).addScaledVector(offset, amount);
    }
  }

  setWireframe(enabled) {
    this.wireOverlays.forEach((overlay) => { overlay.visible = enabled; });
  }

  setCombustion(enabled) {
    this.combustionEnabled = enabled;
    if (!enabled) this.cylinders.forEach(({ flame }) => { flame.visible = false; });
  }

  isolateSystem(system) {
    for (const name of SYSTEMS) {
      this.systems[name].visible = system === 'all' || name === system;
    }
  }

  getLabelWorldPosition(label, target = new THREE.Vector3()) {
    target.copy(label.position);
    return this.root.localToWorld(target);
  }
}

class GroupWithImpeller extends THREE.Group {
  constructor(materials) {
    super();
    this.name = 'centrifugal water pump';
    const housing = cylinder('water pump housing', 0.58, 0.58, 0.48, 36, materials.aluminum, 'x');
    this.add(housing);
    const rotor = new THREE.Group();
    rotor.name = 'water pump rotor';
    const hub = cylinder('water pump hub', 0.16, 0.16, 0.58, 24, materials.machinedSteel, 'x');
    rotor.add(hub);
    for (let i = 0; i < 7; i += 1) {
      const blade = roundedBox('water pump impeller blade', new THREE.Vector3(0.12, 0.42, 0.12), 0.04, materials.darkSteel);
      const angle = (i / 7) * Math.PI * 2;
      blade.position.set(-0.28, Math.cos(angle) * 0.28, Math.sin(angle) * 0.28);
      blade.rotation.x = angle;
      rotor.add(blade);
    }
    this.add(rotor);
    this.userData.rotor = rotor;
  }
}
