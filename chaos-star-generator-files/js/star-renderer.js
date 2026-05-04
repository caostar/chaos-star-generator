export class StarRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.textureImage = null;
  }

  setTexture(image) {
    this.textureImage = image;
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  render(params) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = params.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    this.drawStar(ctx, w, h, params);
  }

  drawStar(ctx, w, h, params) {
    const cx = w / 2;
    const cy = h / 2;
    const scale = this.dpr;
    const p = params;

    const gs = p.globalScale ?? 1;
    const cr = p.centerRadius * scale * gs;
    const bw = p.barWidth * scale * gs;
    const bl = p.barLength * scale * gs;
    const tw = p.tipWidth * scale * gs;
    const tl = p.tipLength * scale * gs;
    const bsa = p.barSidesAngle * Math.PI / 180;
    const tba = p.tipBottomAngle * Math.PI / 180;
    const gr = (p.gradientRotation || 0) * Math.PI / 180;

    const maxRadius = bl + tl + cr + 4;
    ctx.fillStyle = this.buildGradient(ctx, cx, cy, gr, maxRadius, p);

    const barBottomHW = bw / 2;
    const taper = bl * Math.tan(bsa);
    const barTopHW = Math.max(0.5, barBottomHW - taper);
    const tipHW = tw / 2;
    const wingBacksetRaw = (tipHW - barTopHW) * Math.tan(tba);
    const wingBackset = Math.max(0, Math.min(wingBacksetRaw, bl));

    ctx.beginPath();

    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const dirX = Math.sin(angle);
      const dirY = -Math.cos(angle);
      const perpX = Math.cos(angle);
      const perpY = Math.sin(angle);

      const points = [
        [-barBottomHW, 0],
        [+barBottomHW, 0],
        [+barTopHW, bl],
        [+tipHW, bl - wingBackset],
        [0, bl + tl],
        [-tipHW, bl - wingBackset],
        [-barTopHW, bl],
      ];

      const screen = points.map(([lx, ly]) => [
        cx + lx * perpX + ly * dirX,
        cy + lx * perpY + ly * dirY,
      ]);

      ctx.moveTo(screen[0][0], screen[0][1]);
      for (let j = 1; j < screen.length; j++) {
        ctx.lineTo(screen[j][0], screen[j][1]);
      }
      ctx.closePath();
    }

    if (cr > 0) {
      ctx.moveTo(cx + cr, cy);
      ctx.arc(cx, cy, cr, 0, Math.PI * 2, true);
    }

    // If a texture is active, clip to the star path and draw the image
    // instead of filling with the gradient.
    if (this.textureImage && p.textureMode && p.textureMode !== 'none') {
      ctx.save();
      ctx.clip('nonzero');
      const img = this.textureImage;
      const span = (cr + bl + tl) * 2;
      const fitScale = Math.max(span / img.width, span / img.height);
      const ts = fitScale * (p.textureScale ?? 1);
      const w = img.width * ts;
      const h = img.height * ts;
      const ox = (p.textureOffsetX ?? 0) * scale;
      const oy = (p.textureOffsetY ?? 0) * scale;
      ctx.drawImage(img, cx - w / 2 + ox, cy - h / 2 + oy, w, h);
      ctx.restore();
    } else {
      ctx.fill('nonzero');
    }
  }

  buildGradient(ctx, cx, cy, gr, maxRadius, p) {
    const type = p.gradientType || 'angular';
    const sorted = [...p.gradientStops].sort((a, b) => a.position - b.position);
    const clampPos = (v) => Math.max(0, Math.min(1, v));

    if (type === 'solid') {
      return sorted[0]?.color || '#ffffff';
    }

    if (type === 'linear') {
      const len = maxRadius;
      const dx = Math.cos(gr - Math.PI / 2) * len;
      const dy = Math.sin(gr - Math.PI / 2) * len;
      const grad = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      for (const stop of sorted) {
        grad.addColorStop(clampPos(stop.position), stop.color);
      }
      return grad;
    }

    if (type === 'radial') {
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
      for (const stop of sorted) {
        grad.addColorStop(clampPos(stop.position), stop.color);
      }
      return grad;
    }

    // angular (conic) — auto-wrap for smooth seam
    const grad = ctx.createConicGradient(-Math.PI / 2 + gr, cx, cy);
    for (const stop of sorted) {
      grad.addColorStop(clampPos(stop.position), stop.color);
    }
    const last = sorted[sorted.length - 1];
    if (last.position < 1 || last.color !== sorted[0].color) {
      grad.addColorStop(1, sorted[0].color);
    }
    return grad;
  }

  renderExport(params, withBackground) {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');

    if (withBackground) {
      ctx.fillStyle = params.backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }

    this.drawStar(ctx, w, h, params);
    return offscreen;
  }
}
