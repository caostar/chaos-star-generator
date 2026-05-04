import { hexToHsl, hslToHex } from './parameters.js';

const PARAM_KEYS = [
  'centerRadius', 'barWidth', 'barLength', 'barSidesAngle',
  'tipWidth', 'tipLength', 'tipBottomAngle', 'gradientRotation',
];

export class Tweener {
  constructor() {
    this.activeTweens = [];
  }

  transitionTo(currentParams, targetParams, durationMs) {
    this.cancelAll();

    const duration = durationMs / 1000;
    const ease = 'power2.inOut';

    const numericTargets = {};
    let hasNumeric = false;
    for (const key of PARAM_KEYS) {
      if (typeof targetParams[key] === 'number') {
        numericTargets[key] = targetParams[key];
        hasNumeric = true;
      }
    }
    if (hasNumeric) {
      this.activeTweens.push(
        gsap.to(currentParams, { ...numericTargets, duration, ease })
      );
    }

    if (targetParams.gradientType) {
      currentParams.gradientType = targetParams.gradientType;
    }

    if (targetParams.gradientStops) {
      const targetCount = targetParams.gradientStops.length;
      currentParams.gradientStops = normalizeStops(
        currentParams.gradientStops,
        targetCount
      );

      for (let i = 0; i < targetCount; i++) {
        const stop = currentParams.gradientStops[i];
        const target = targetParams.gradientStops[i];

        this.activeTweens.push(
          gsap.to(stop, { position: target.position, duration, ease })
        );

        const fromHsl = hexToHsl(stop.color);
        const toHsl = hexToHsl(target.color);
        let dh = toHsl[0] - fromHsl[0];
        if (dh > 180) dh -= 360;
        if (dh < -180) dh += 360;

        const proxy = { h: fromHsl[0], s: fromHsl[1], l: fromHsl[2] };
        this.activeTweens.push(
          gsap.to(proxy, {
            h: fromHsl[0] + dh,
            s: toHsl[1],
            l: toHsl[2],
            duration,
            ease,
            onUpdate: () => {
              stop.color = hslToHex(((proxy.h % 360) + 360) % 360, proxy.s, proxy.l);
            },
          })
        );
      }
    }

    if (targetParams.backgroundColor) {
      const fromHsl = hexToHsl(currentParams.backgroundColor);
      const toHsl = hexToHsl(targetParams.backgroundColor);
      let dh = toHsl[0] - fromHsl[0];
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      const proxy = { h: fromHsl[0], s: fromHsl[1], l: fromHsl[2] };
      this.activeTweens.push(
        gsap.to(proxy, {
          h: fromHsl[0] + dh,
          s: toHsl[1],
          l: toHsl[2],
          duration,
          ease,
          onUpdate: () => {
            currentParams.backgroundColor = hslToHex(
              ((proxy.h % 360) + 360) % 360,
              proxy.s,
              proxy.l
            );
          },
        })
      );
    }
  }

  cancelAll() {
    for (const t of this.activeTweens) t.kill();
    this.activeTweens = [];
  }

  isAnimating() {
    return this.activeTweens.some((t) => t.isActive && t.isActive());
  }
}

function normalizeStops(stops, targetCount) {
  if (stops.length === targetCount) return stops.map((s) => ({ ...s }));
  const result = [];
  for (let i = 0; i < targetCount; i++) {
    const t = i / Math.max(1, targetCount - 1);
    result.push({
      color: sampleGradientColor(stops, t),
      position: t,
    });
  }
  return result;
}

function sampleGradientColor(stops, position) {
  if (stops.length === 0) return '#ffffff';
  if (stops.length === 1) return stops[0].color;
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  if (position <= sorted[0].position) return sorted[0].color;
  if (position >= sorted[sorted.length - 1].position)
    return sorted[sorted.length - 1].color;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].position && position <= sorted[i + 1].position) {
      const range = sorted[i + 1].position - sorted[i].position;
      const t = range === 0 ? 0 : (position - sorted[i].position) / range;
      const hsl1 = hexToHsl(sorted[i].color);
      const hsl2 = hexToHsl(sorted[i + 1].color);
      let dh = hsl2[0] - hsl1[0];
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      const h = ((hsl1[0] + dh * t) % 360 + 360) % 360;
      const s = hsl1[1] + (hsl2[1] - hsl1[1]) * t;
      const l = hsl1[2] + (hsl2[2] - hsl1[2]) * t;
      return hslToHex(h, s, l);
    }
  }
  return sorted[sorted.length - 1].color;
}
