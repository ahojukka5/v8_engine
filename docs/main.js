import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createMaterials } from './engine/materials.js';
import { V8Engine } from './engine/v8-engine.js';
import { applyDetailPass } from './engine/detail-pass.js';

const TWO_PI = Math.PI * 2;
const FOUR_PI = Math.PI * 4;
const CRAWL_SLIDER_END = 240;
const MAX_SLIDER = 1000;

const canvas = document.querySelector('#viewport');
const loadingScreen = document.querySelector('#loadingScreen');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07090d);
scene.fog = new THREE.FogExp2(0x07090d, 0.018);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.08, 90);
camera.position.set(13.8, 8.2, 14.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 7.5;
controls.maxDistance = 34;
controls.maxPolarAngle = Math.PI * 0.92;
controls.target.set(0, 0.2, 0);
controls.update();

const environment = new RoomEnvironment();
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(environment, 0.04).texture;
environment.dispose();
pmremGenerator.dispose();

const hemisphere = new THREE.HemisphereLight(0xb6c9e3, 0x21160f, 1.2);
scene.add(hemisphere);

const keyLight = new THREE.DirectionalLight(0xffefe1, 4.0);
keyLight.position.set(-6, 12, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -12;
keyLight.shadow.camera.right = 12;
keyLight.shadow.camera.top = 12;
keyLight.shadow.camera.bottom = -12;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 40;
keyLight.shadow.bias = -0.00045;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x6da9ff, 2.6);
rimLight.position.set(7, 5, -10);
scene.add(rimLight);

const warmFill = new THREE.PointLight(0xff6b32, 35, 20, 2.0);
warmFill.position.set(-5, 1.5, 6);
scene.add(warmFill);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshPhysicalMaterial({ color: 0x0d1116, metalness: 0.55, roughness: 0.58, clearcoat: 0.18 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.42;
floor.receiveShadow = true;
scene.add(floor);

const floorRing = new THREE.Mesh(
  new THREE.RingGeometry(7.0, 7.035, 128),
  new THREE.MeshBasicMaterial({ color: 0x7c3222, transparent: true, opacity: 0.46, side: THREE.DoubleSide }),
);
floorRing.rotation.x = -Math.PI / 2;
floorRing.position.y = -3.405;
scene.add(floorRing);

const grid = new THREE.GridHelper(32, 64, 0x27303a, 0x171c23);
grid.position.y = -3.4;
grid.material.transparent = true;
grid.material.opacity = 0.38;
scene.add(grid);

const materials = createMaterials();
const engine = new V8Engine(materials);
applyDetailPass(engine);
scene.add(engine.root);
engine.setCutaway(false);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
composer.addPass(new RenderPass(scene, camera));
const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeGlow = 0.48;
outlinePass.edgeThickness = 1.2;
outlinePass.pulsePeriod = 2.2;
outlinePass.visibleEdgeColor.set(0xff8b49);
outlinePass.hiddenEdgeColor.set(0x4b1a0c);
composer.addPass(outlinePass);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.17, 0.38, 0.94);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
const labelPosition = new THREE.Vector3();
const projected = new THREE.Vector3();
const cameraDirection = new THREE.Vector3();

let running = true;
let rpm = 12;
let lastNonZeroRpm = rpm;
let explodedTarget = 0;
let explodedAmount = 0;
let labelsVisible = false;
let lastPointerDown = null;
let labelFrame = 0;
let fpsSamples = [];
let cameraTransition = null;
let cycleScrubbing = false;

const ui = {
  runToggle: document.querySelector('#runToggle'),
  resetView: document.querySelector('#resetView'),
  rpmControl: document.querySelector('#rpmControl'),
  rpmOutput: document.querySelector('#rpmOutput'),
  cycleControl: document.querySelector('#cycleControl'),
  cycleOutput: document.querySelector('#cycleOutput'),
  stepMinusTen: document.querySelector('#stepMinusTen'),
  stepMinusOne: document.querySelector('#stepMinusOne'),
  stepPlusOne: document.querySelector('#stepPlusOne'),
  stepPlusTen: document.querySelector('#stepPlusTen'),
  engineState: document.querySelector('#engineState'),
  firingCylinder: document.querySelector('#firingCylinder'),
  crankAngle: document.querySelector('#crankAngle'),
  fpsValue: document.querySelector('#fpsValue'),
  triangleValue: document.querySelector('#triangleValue'),
  cutawayToggle: document.querySelector('#cutawayToggle'),
  explodeToggle: document.querySelector('#explodeToggle'),
  labelsToggle: document.querySelector('#labelsToggle'),
  combustionToggle: document.querySelector('#combustionToggle'),
  wireToggle: document.querySelector('#wireToggle'),
  systemFilters: document.querySelector('#systemFilters'),
  inspector: document.querySelector('#partInspector'),
  partSystem: document.querySelector('#partSystem'),
  partName: document.querySelector('#partName'),
  partDescription: document.querySelector('#partDescription'),
  partMaterial: document.querySelector('#partMaterial'),
  partFunction: document.querySelector('#partFunction'),
  closeInspector: document.querySelector('#closeInspector'),
  labelsLayer: document.querySelector('#labelsLayer'),
  helpDialog: document.querySelector('#helpDialog'),
  helpButton: document.querySelector('#helpButton'),
  closeHelp: document.querySelector('#closeHelp'),
};

const cameraPresets = {
  hero: { position: new THREE.Vector3(13.8, 8.2, 14.6), target: new THREE.Vector3(0, 0.2, 0) },
  front: { position: new THREE.Vector3(-18, 0.0, 0.1), target: new THREE.Vector3(-0.8, -0.2, 0) },
  side: { position: new THREE.Vector3(0.5, 2.0, 19), target: new THREE.Vector3(0, 0.1, 0) },
  top: { position: new THREE.Vector3(0.2, 20.5, 0.1), target: new THREE.Vector3(0, 0.4, 0) },
  crank: { position: new THREE.Vector3(9.5, -0.7, 9.2), target: new THREE.Vector3(0, -1.45, 0) },
  valves: { position: new THREE.Vector3(7.0, 7.8, 9.5), target: new THREE.Vector3(0.6, 3.25, 1.2) },
};

function setCameraPreset(name, duration = 0.85) {
  const preset = cameraPresets[name];
  if (!preset) return;
  cameraTransition = {
    elapsed: 0,
    duration,
    fromPosition: camera.position.clone(),
    toPosition: preset.position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: preset.target.clone(),
  };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function updateCameraTransition(delta) {
  if (!cameraTransition) return;
  cameraTransition.elapsed += delta;
  const t = Math.min(1, cameraTransition.elapsed / cameraTransition.duration);
  const eased = easeInOutCubic(t);
  camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, eased);
  controls.target.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, eased);
  if (t >= 1) cameraTransition = null;
}

function updateRangeFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const value = Number(input.value);
  const percentage = ((value - min) / (max - min)) * 100;
  input.style.background = `linear-gradient(90deg, var(--accent) 0 ${percentage}%, rgba(255,255,255,.13) ${percentage}% 100%)`;
}

function sliderToRpm(sliderValue) {
  const value = Number(sliderValue);
  if (value <= 0) return 0;
  if (value <= CRAWL_SLIDER_END) return Math.max(1, Math.round((value / CRAWL_SLIDER_END) * 20));
  const normalized = (value - CRAWL_SLIDER_END) / (MAX_SLIDER - CRAWL_SLIDER_END);
  return Math.min(6200, Math.round((20 + normalized * normalized * 6180) / 10) * 10);
}

function rpmToSlider(engineRpm) {
  if (engineRpm <= 0) return 0;
  if (engineRpm <= 20) return Math.round((engineRpm / 20) * CRAWL_SLIDER_END);
  const normalized = Math.sqrt((engineRpm - 20) / 6180);
  return Math.round(CRAWL_SLIDER_END + normalized * (MAX_SLIDER - CRAWL_SLIDER_END));
}

function formatRpm(engineRpm) {
  if (engineRpm === 0) return '0 rpm · stopped';
  if (engineRpm <= 20) return `${engineRpm} rpm · crawl`;
  return `${engineRpm.toLocaleString()} rpm`;
}

function cycleDegrees() {
  return ((engine.cycleAngle / FOUR_PI) * 720 + 720) % 720;
}

function setRunning(nextRunning) {
  running = Boolean(nextRunning) && rpm > 0;
  ui.runToggle.textContent = running ? 'Stop engine' : 'Start engine';
  ui.engineState.textContent = running ? (rpm <= 20 ? 'CRAWL' : 'RUNNING') : 'STOPPED';
  ui.engineState.classList.toggle('paused', !running);
}

function setRpm(nextRpm, { preserveRunning = true } = {}) {
  rpm = THREE.MathUtils.clamp(Math.round(nextRpm), 0, 6200);
  if (rpm > 0) lastNonZeroRpm = rpm;
  ui.rpmControl.value = String(rpmToSlider(rpm));
  ui.rpmOutput.textContent = formatRpm(rpm);
  updateRangeFill(ui.rpmControl);
  if (rpm === 0) setRunning(false);
  else if (!preserveRunning) setRunning(true);
  else setRunning(running);
}

function setCycleDegrees(nextDegrees) {
  const requested = Number(nextDegrees);
  const normalized = ((requested % 720) + 720) % 720;
  const displayed = requested === 720 ? 720 : normalized;
  engine.cycleAngle = (normalized / 720) * FOUR_PI;
  engine.crankAngle = engine.cycleAngle % TWO_PI;
  engine.update(0, rpm, false);
  ui.cycleControl.value = displayed.toFixed(0);
  ui.cycleOutput.textContent = `${displayed.toFixed(0)}° / 720°`;
  updateRangeFill(ui.cycleControl);
}

function stepCycle(degrees) {
  setRunning(false);
  setCycleDegrees(cycleDegrees() + degrees);
}

function makeLabels() {
  for (const label of engine.labels) {
    const element = document.createElement('div');
    element.className = 'part-label';
    element.innerHTML = `<span>${label.text}</span>`;
    ui.labelsLayer.append(element);
    label.element = element;
  }
}
makeLabels();

function updateLabels() {
  ui.labelsLayer.style.opacity = labelsVisible ? '1' : '0';
  if (!labelsVisible) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.getWorldDirection(cameraDirection);

  for (const label of engine.labels) {
    const systemVisible = engine.systems[label.system]?.visible ?? true;
    label.element.style.display = systemVisible ? 'flex' : 'none';
    if (!systemVisible) continue;
    engine.getLabelWorldPosition(label, labelPosition);
    projected.copy(labelPosition).project(camera);
    const behind = projected.z < -1 || projected.z > 1;
    label.element.style.display = behind ? 'none' : 'flex';
    if (behind) continue;
    label.element.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
    label.element.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
    if (labelFrame % 7 === 0) {
      const toLabel = labelPosition.clone().sub(camera.position);
      pointer.set(projected.x, projected.y);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(engine.pickables, false)[0];
      label.element.classList.toggle('occluded', Boolean(hit && hit.distance < toLabel.length() - 0.35));
    }
  }
}

function openInspector(object) {
  const metadata = object?.userData?.part;
  if (!metadata) return;
  ui.partSystem.textContent = metadata.system;
  ui.partName.textContent = metadata.name;
  ui.partDescription.textContent = metadata.description;
  ui.partMaterial.textContent = metadata.material;
  ui.partFunction.textContent = metadata.function;
  ui.inspector.classList.remove('hidden');
}

function clearSelection() {
  outlinePass.selectedObjects = [];
  ui.inspector.classList.add('hidden');
}

function selectAt(clientX, clientY) {
  pointer.x = (clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(engine.pickables, false);
  const hit = hits.find(({ object }) => object.visible && object.parent?.visible !== false);
  if (!hit) {
    clearSelection();
    return;
  }
  const root = hit.object.userData.pickRoot ?? hit.object;
  outlinePass.selectedObjects = [root];
  openInspector(hit.object);
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  lastPointerDown = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!lastPointerDown) return;
  const distance = Math.hypot(event.clientX - lastPointerDown.x, event.clientY - lastPointerDown.y);
  if (distance < 5) selectAt(event.clientX, event.clientY);
  lastPointerDown = null;
});

ui.runToggle.addEventListener('click', () => {
  if (running) {
    setRunning(false);
    return;
  }
  if (rpm === 0) setRpm(lastNonZeroRpm || 12);
  setRunning(true);
});
ui.resetView.addEventListener('click', () => setCameraPreset('hero'));
ui.rpmControl.addEventListener('input', () => setRpm(sliderToRpm(ui.rpmControl.value)));
ui.cycleControl.addEventListener('pointerdown', () => {
  cycleScrubbing = true;
  setRunning(false);
});
ui.cycleControl.addEventListener('input', () => setCycleDegrees(ui.cycleControl.value));
ui.cycleControl.addEventListener('pointerup', () => { cycleScrubbing = false; });
ui.cycleControl.addEventListener('change', () => { cycleScrubbing = false; });
ui.stepMinusTen.addEventListener('click', () => stepCycle(-10));
ui.stepMinusOne.addEventListener('click', () => stepCycle(-1));
ui.stepPlusOne.addEventListener('click', () => stepCycle(1));
ui.stepPlusTen.addEventListener('click', () => stepCycle(10));
ui.cutawayToggle.addEventListener('change', () => engine.setCutaway(ui.cutawayToggle.checked));
ui.explodeToggle.addEventListener('change', () => { explodedTarget = ui.explodeToggle.checked ? 1 : 0; });
ui.labelsToggle.addEventListener('change', () => { labelsVisible = ui.labelsToggle.checked; });
ui.combustionToggle.addEventListener('change', () => engine.setCombustion(ui.combustionToggle.checked));
ui.wireToggle.addEventListener('change', () => engine.setWireframe(ui.wireToggle.checked));
ui.closeInspector.addEventListener('click', clearSelection);
ui.helpButton.addEventListener('click', () => ui.helpDialog.showModal());
ui.closeHelp.addEventListener('click', () => ui.helpDialog.close());
ui.helpDialog.addEventListener('click', (event) => {
  if (event.target === ui.helpDialog) ui.helpDialog.close();
});

document.querySelectorAll('[data-camera]').forEach((button) => {
  button.addEventListener('click', () => setCameraPreset(button.dataset.camera));
});

ui.systemFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-system]');
  if (!button) return;
  engine.isolateSystem(button.dataset.system);
  ui.systemFilters.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
  clearSelection();
});

document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, button')) return;
  const key = event.key.toLowerCase();
  if (event.code === 'Space') {
    event.preventDefault();
    if (!running && rpm === 0) setRpm(lastNonZeroRpm || 12);
    setRunning(!running);
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    stepCycle(event.shiftKey ? -10 : -1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    stepCycle(event.shiftKey ? 10 : 1);
  } else if (key === 'e') {
    ui.explodeToggle.checked = !ui.explodeToggle.checked;
    explodedTarget = ui.explodeToggle.checked ? 1 : 0;
  } else if (key === 'c') {
    ui.cutawayToggle.checked = !ui.cutawayToggle.checked;
    engine.setCutaway(ui.cutawayToggle.checked);
  } else if (key === 'l') {
    ui.labelsToggle.checked = !ui.labelsToggle.checked;
    labelsVisible = ui.labelsToggle.checked;
  }
});

function updateTelemetry(delta) {
  ui.firingCylinder.textContent = `#${engine.currentFiringCylinder}`;
  ui.crankAngle.textContent = `${Math.round((engine.crankAngle / TWO_PI) * 360)}°`;
  ui.triangleValue.textContent = renderer.info.render.triangles > 999
    ? `${(renderer.info.render.triangles / 1000).toFixed(0)}k`
    : String(renderer.info.render.triangles);

  if (!cycleScrubbing) {
    const degrees = cycleDegrees();
    ui.cycleControl.value = degrees.toFixed(0);
    ui.cycleOutput.textContent = `${degrees.toFixed(0)}° / 720°`;
    updateRangeFill(ui.cycleControl);
  }

  fpsSamples.push(1 / Math.max(delta, 0.0001));
  if (fpsSamples.length > 30) fpsSamples.shift();
  if (labelFrame % 12 === 0) {
    const averageFps = fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length;
    ui.fpsValue.textContent = String(Math.round(averageFps));
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(width, height, false);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  composer.setSize(width, height);
  outlinePass.resolution.set(width, height);
}
window.addEventListener('resize', resize);

setRpm(rpm);
setCycleDegrees(0);
setRunning(true);
setTimeout(() => loadingScreen.classList.add('hidden'), 500);

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  engine.update(delta, rpm, running);
  explodedAmount = THREE.MathUtils.damp(explodedAmount, explodedTarget, 5.3, delta);
  engine.setExploded(explodedAmount);
  updateCameraTransition(delta);
  controls.update();
  updateLabels();
  updateTelemetry(delta);
  composer.render();
  labelFrame += 1;
});
