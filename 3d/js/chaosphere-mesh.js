// Parametric, transform-only chaos sphere.
// One sphere + 8 cylinder shafts + 8 cone tips, all unit-sized geometries
// built once. Shape changes are pure mesh.scale / mesh.position updates —
// no geometry rebuild, no CSG, no garbage.
//
// CSG-unioned watertight geometry is built lazily at export time only.

import * as THREE from 'three';

const SQRT3_INV = 1 / Math.sqrt(3);

const ARROW_DIRS = (() => {
  const dirs = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    dirs.push(new THREE.Vector3(sx, sy, sz).multiplyScalar(SQRT3_INV));
  }
  return dirs;
})();

const UP = new THREE.Vector3(0, 1, 0);

const SHAFT_SEGMENTS = 24;
const CONE_SEGMENTS  = 24;
const DEFAULT_SPHERE_SEGS = 64;

export class ChaosphereMesh extends THREE.Group {
  constructor() {
    super();
    this._sphereSegs = DEFAULT_SPHERE_SEGS;
    this.sphereGeom = new THREE.SphereGeometry(1, this._sphereSegs, this._sphereSegs / 2);
    this.shaftGeom  = new THREE.CylinderGeometry(1, 1, 1, SHAFT_SEGMENTS, 1, false);
    this.coneGeom   = new THREE.ConeGeometry(1, 1, CONE_SEGMENTS, 1, false);

    this.sphere = new THREE.Mesh(this.sphereGeom);
    this.add(this.sphere);

    this.shafts = [];
    this.tips   = [];
    for (const dir of ARROW_DIRS) {
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);

      const shaft = new THREE.Mesh(this.shaftGeom);
      shaft.quaternion.copy(q);
      shaft.userData.dir = dir.clone();
      this.shafts.push(shaft);

      const tip = new THREE.Mesh(this.coneGeom);
      tip.quaternion.copy(q);
      tip.userData.dir = dir.clone();
      this.tips.push(tip);

      this.add(shaft, tip);
    }
  }

  // Apply current params. Cheap — just transforms.
  update(params) {
    const R  = params.sphereRadius;
    const sR = params.shaftRadius;
    const sL = params.shaftLength;
    const cR = params.coneRadius;
    const cL = params.coneLength;

    this.sphere.scale.setScalar(R);

    for (let i = 0; i < 8; i++) {
      const dir = this.shafts[i].userData.dir;
      const shaft = this.shafts[i];
      shaft.scale.set(sR, sL, sR);
      shaft.position.copy(dir).multiplyScalar(sL / 2);

      const tip = this.tips[i];
      tip.scale.set(cR, cL, cR);
      tip.position.copy(dir).multiplyScalar(sL + cL / 2);
    }

    // Sphere segment count is the only thing that requires a (cheap) geometry
    // swap. Throttled to integer change to avoid thrash during a slider drag.
    const targetSegs = Math.round(params.sphereSegments / 8) * 8;
    if (this._sphereSegs !== targetSegs && targetSegs >= 16) {
      this._sphereSegs = targetSegs;
      this.sphereGeom.dispose();
      this.sphereGeom = new THREE.SphereGeometry(1, targetSegs, Math.max(8, targetSegs / 2));
      this.sphere.geometry = this.sphereGeom;
    }
  }

  setMaterial(mat) {
    this.sphere.material = mat;
    for (const s of this.shafts) s.material = mat;
    for (const t of this.tips)   t.material = mat;
  }

  // Iterate all child meshes for export.
  *meshes() {
    yield this.sphere;
    for (const s of this.shafts) yield s;
    for (const t of this.tips)   yield t;
  }

  dispose() {
    this.sphereGeom.dispose();
    this.shaftGeom.dispose();
    this.coneGeom.dispose();
  }
}
