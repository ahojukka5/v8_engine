import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function roundedBox(name, size, radius, material, segments = 4) {
  const geometry = new RoundedBoxGeometry(size.x, size.y, size.z, segments, radius);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function cylinder(name, radiusTop, radiusBottom, length, radialSegments, material, axis = 'y') {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 1, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function torus(name, radius, tubeRadius, radialSegments, tubularSegments, material, axis = 'z') {
  const geometry = new THREE.TorusGeometry(radius, tubeRadius, radialSegments, tubularSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  if (axis === 'x') mesh.rotation.y = Math.PI / 2;
  if (axis === 'y') mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function sphere(name, radius, material, widthSegments = 24, heightSegments = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, heightSegments), material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function tube(name, points, radius, material, tubularSegments = 48, radialSegments = 10, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.45);
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, closed);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function orientBetween(object, start, end, lengthAxis = 'y') {
  const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  const direction = new THREE.Vector3().subVectors(end, start);
  object.position.copy(midpoint);
  if (lengthAxis === 'y') object.quaternion.setFromUnitVectors(Y_AXIS, direction.clone().normalize());
  return direction.length();
}

export function bolt(name, length, radius, material) {
  const group = new THREE.Group();
  group.name = name;
  const stem = cylinder(`${name} stem`, radius * 0.55, radius * 0.55, length, 12, material);
  const head = cylinder(`${name} hex head`, radius, radius, radius * 0.65, 6, material);
  head.position.y = length * 0.5 + radius * 0.32;
  group.add(stem, head);
  return group;
}

export function spring(name, radius, wireRadius, height, turns, material, segments = 100) {
  class HelixCurve extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const angle = turns * Math.PI * 2 * t;
      return target.set(Math.cos(angle) * radius, (t - 0.5) * height, Math.sin(angle) * radius);
    }
  }
  const geometry = new THREE.TubeGeometry(new HelixCurve(), segments, wireRadius, 7, false);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function makeTextDecal(text, options = {}) {
  const canvas = document.createElement('canvas');
  const width = options.width ?? 512;
  const height = options.height ?? 128;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.background ?? 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${options.weight ?? 800} ${options.fontSize ?? 72}px ${options.font ?? 'Arial'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = options.color ?? '#f2f2f2';
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const geometry = new THREE.PlaneGeometry(options.worldWidth ?? 2.4, options.worldHeight ?? 0.55);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${text} decal`;
  return mesh;
}

export function registerPart(object, metadata, pickables) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.userData.part = metadata;
    child.userData.pickRoot = object;
    pickables.push(child);
  });
  object.userData.part = metadata;
  return object;
}

export function createWireOverlay(mesh, opacity = 0.15) {
  if (!mesh.geometry) return null;
  const material = new THREE.MeshBasicMaterial({
    color: 0xe8edf2,
    wireframe: true,
    transparent: true,
    opacity,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const overlay = new THREE.Mesh(mesh.geometry, material);
  overlay.name = `${mesh.name} wire overlay`;
  overlay.visible = false;
  overlay.userData.isWireOverlay = true;
  mesh.add(overlay);
  return overlay;
}

export function rememberBaseTransform(object, explodedOffset = new THREE.Vector3()) {
  object.userData.basePosition = object.position.clone();
  object.userData.baseQuaternion = object.quaternion.clone();
  object.userData.explodedOffset = explodedOffset.clone();
  return object;
}
