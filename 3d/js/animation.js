// GSAP-backed parameter tweener for smooth transitions between designs.

import { NUMERIC_KEYS } from './parameters.js';

const SHAPE_KEYS = new Set([
  'sphereRadius', 'sphereSegments',
  'shaftRadiusRatio', 'shaftLengthRatio',
  'coneRadiusRatio', 'coneLengthRatio',
]);

export class Tweener {
  constructor({ params, onUpdate, onShapeUpdate, onComplete }) {
    this.params = params;
    this.onUpdate = onUpdate;
    this.onShapeUpdate = onShapeUpdate;
    this.onComplete = onComplete;
    this.active = null;
  }

  cancel() {
    if (this.active) {
      this.active.kill();
      this.active = null;
    }
  }

  // Animate numeric params toward target. Non-numeric / discrete fields are
  // applied immediately at start.
  to(target, durationMs = 1700) {
    this.cancel();
    const tweenable = {};
    let shapeChanged = false;

    for (const k of NUMERIC_KEYS) {
      if (target[k] !== undefined && target[k] !== this.params[k]) {
        tweenable[k] = target[k];
      }
    }
    // Discrete switches → apply immediately
    for (const k of [
      'backgroundColor', 'materialMode', 'shaderId', 'shaderSource',
      'solidColor', 'textureMode', 'textureIndex', 'triplanar', 'lighting',
      'metalness', 'roughness',
    ]) {
      if (target[k] !== undefined && target[k] !== this.params[k]) {
        this.params[k] = target[k];
        if (k === 'shaderId' || k === 'shaderSource' || k === 'materialMode'
            || k === 'textureMode' || k === 'textureIndex' || k === 'triplanar'
            || k === 'lighting') {
          // request a material rebuild via onUpdate special flag
          this.params.__rebuild = true;
        }
      }
    }

    if (Object.keys(tweenable).length === 0) {
      this.params.__rebuild = !!this.params.__rebuild;
      this.onUpdate?.();
      this.onComplete?.();
      return;
    }

    this.active = window.gsap.to(this.params, {
      duration: durationMs / 1000,
      ease: 'power2.inOut',
      ...tweenable,
      onUpdate: () => {
        // detect shape changes within frame
        for (const k of Object.keys(tweenable)) {
          if (SHAPE_KEYS.has(k)) { shapeChanged = true; break; }
        }
        this.onUpdate?.();
      },
      onComplete: () => {
        this.active = null;
        if (shapeChanged) this.onShapeUpdate?.();
        this.onComplete?.();
      },
    });
  }
}
