// Builds the unified Chaos Sphere BufferGeometry via CSG union.
// Topology matches the original chaosphere.js: central sphere + 4 arrows
// (cylinder shaft + cone tip) at tetrahedral angles.

import * as THREE from 'three';
import { Brush, Evaluator, ADDITION } from 'three-bvh-csg';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const BASE_X = 45 * DEG;
const BASE_Z = 35.26438968275465 * DEG;

const ARROW_ANGLES = [
  { rx:  BASE_X, rz:  BASE_Z },
  { rx: -BASE_X, rz:  BASE_Z },
  { rx:  BASE_X, rz: -BASE_Z },
  { rx: -BASE_X, rz: -BASE_Z },
];

function makeArrowBrushes(params) {
  const R           = params.sphereRadius;
  const shaftR      = R * params.shaftRadiusRatio;
  const shaftLen    = R * params.shaftLengthRatio;
  const coneR       = R * params.coneRadiusRatio;
  const coneLen     = R * params.coneLengthRatio;

  const shaftGeom = new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 24, 1, false);
  const coneGeom  = new THREE.ConeGeometry(coneR, coneLen, 24, 1, false);

  const brushes = [];
  for (const a of ARROW_ANGLES) {
    // shaft: base flush with sphere centre, extending up along +Y before rotation
    const shaft = new Brush(shaftGeom.clone());
    shaft.position.set(0, shaftLen / 2, 0);
    shaft.updateMatrix();
    bake(shaft);

    const tip = new Brush(coneGeom.clone());
    tip.position.set(0, shaftLen + coneLen / 2, 0);
    tip.updateMatrix();
    bake(tip);

    // rotate the shaft+tip pair into its arrow direction
    rotatePair(shaft, a);
    rotatePair(tip,   a);
    brushes.push(shaft, tip);
  }
  shaftGeom.dispose();
  coneGeom.dispose();
  return brushes;
}

function bake(brush) {
  brush.geometry.applyMatrix4(brush.matrix);
  brush.position.set(0, 0, 0);
  brush.rotation.set(0, 0, 0);
  brush.scale.set(1, 1, 1);
  brush.updateMatrixWorld();
}

function rotatePair(brush, { rx, rz }) {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(rx, 0, rz, 'XYZ'));
  brush.geometry.applyMatrix4(m);
  brush.updateMatrixWorld();
}

export function buildChaosSphereGeometry(params) {
  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  const sphereSegs = params.sphereSegments;
  const sphereGeom = new THREE.SphereGeometry(params.sphereRadius, sphereSegs, Math.max(8, sphereSegs / 2));
  let result = new Brush(sphereGeom);
  result.updateMatrixWorld();

  for (const arrow of makeArrowBrushes(params)) {
    result = evaluator.evaluate(result, arrow, ADDITION);
    result.updateMatrixWorld();
  }

  let geometry = result.geometry;

  // Weld duplicate vertices introduced by CSG so the mesh is watertight
  geometry = mergeVertices(geometry, 1e-4);
  geometry.computeVertexNormals();
  applySphericalUVs(geometry);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

// Spherical UV projection from the centroid. Continuous around the sphere;
// poles pinch slightly (acceptable for procedural shaders; switch to triplanar
// for textures with text/sigils).
function applySphericalUVs(geometry) {
  const pos = geometry.attributes.position;
  const uv  = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x * x + y * y + z * z) || 1;
    const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
    const v = 0.5 - Math.asin(y / r) / Math.PI;
    uv[i * 2]     = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
