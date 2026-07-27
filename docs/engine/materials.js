import * as THREE from 'three';

function physical(color, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: options.metalness ?? 0.75,
    roughness: options.roughness ?? 0.34,
    clearcoat: options.clearcoat ?? 0.12,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.35,
    envMapIntensity: options.envMapIntensity ?? 1.05,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}

export function createMaterials() {
  const materials = {
    castIron: physical(0x34383d, { metalness: 0.72, roughness: 0.58, clearcoat: 0.02 }),
    castIronDark: physical(0x1e2227, { metalness: 0.7, roughness: 0.62, clearcoat: 0.01 }),
    aluminum: physical(0x8f969d, { metalness: 0.86, roughness: 0.31 }),
    polishedAluminum: physical(0xc6ccd1, { metalness: 0.92, roughness: 0.16, clearcoat: 0.25 }),
    machinedSteel: physical(0x92989e, { metalness: 0.98, roughness: 0.2, clearcoat: 0.05 }),
    darkSteel: physical(0x4c5258, { metalness: 0.95, roughness: 0.26 }),
    blackOxide: physical(0x16191d, { metalness: 0.72, roughness: 0.47 }),
    chrome: physical(0xd8dde1, { metalness: 1, roughness: 0.08, clearcoat: 0.35, envMapIntensity: 1.35 }),
    bronze: physical(0x9a6a31, { metalness: 0.8, roughness: 0.32 }),
    copper: physical(0xa8552e, { metalness: 0.88, roughness: 0.3 }),
    redPaint: physical(0x8f1711, { metalness: 0.48, roughness: 0.27, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    orangePaint: physical(0xd9471f, { metalness: 0.42, roughness: 0.28, clearcoat: 0.76, clearcoatRoughness: 0.13 }),
    satinBlack: physical(0x101318, { metalness: 0.44, roughness: 0.44, clearcoat: 0.18 }),
    rubber: physical(0x08090a, { metalness: 0.02, roughness: 0.88, clearcoat: 0.01 }),
    hose: physical(0x12161a, { metalness: 0.04, roughness: 0.72, clearcoat: 0.08 }),
    blueHose: physical(0x173f58, { metalness: 0.08, roughness: 0.52, clearcoat: 0.22 }),
    belt: physical(0x08090a, { metalness: 0.02, roughness: 0.95 }),
    ceramic: physical(0xe7e0d4, { metalness: 0.02, roughness: 0.42, clearcoat: 0.22 }),
    glass: physical(0x7ba3b7, {
      metalness: 0,
      roughness: 0.08,
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      clearcoat: 0.7,
      envMapIntensity: 1.2,
    }),
    fuel: physical(0x822b14, { metalness: 0.05, roughness: 0.4, transparent: true, opacity: 0.72 }),
    intakeDark: physical(0x2a2f35, { metalness: 0.72, roughness: 0.38 }),
    exhaust: physical(0x5a5d5f, { metalness: 0.96, roughness: 0.31 }),
    exhaustHot: new THREE.MeshStandardMaterial({
      color: 0x6c3b24,
      metalness: 0.78,
      roughness: 0.39,
      emissive: 0x321006,
      emissiveIntensity: 0.38,
    }),
    carbon: physical(0x121417, { metalness: 0.24, roughness: 0.48, clearcoat: 0.5, clearcoatRoughness: 0.24 }),
    combustion: new THREE.MeshBasicMaterial({
      color: 0xff7a22,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    highlight: new THREE.MeshBasicMaterial({
      color: 0xff8a46,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.BackSide,
    }),
  };

  Object.values(materials).forEach((material) => {
    material.userData.originalOpacity = material.opacity;
    material.userData.originalTransparent = material.transparent;
  });

  return materials;
}

export function cloneMaterial(material, overrides = {}) {
  const cloned = material.clone();
  Object.assign(cloned, overrides);
  cloned.userData.originalOpacity = cloned.opacity;
  cloned.userData.originalTransparent = cloned.transparent;
  return cloned;
}
