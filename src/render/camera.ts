/** 2D camera for the microscope view (world units → CSS pixels). */
export class Camera {
  x = 600;
  y = 600;
  zoom = 0.6;
  /** Smoothed targets for animated zoom/pan. */
  tx = 600;
  ty = 600;
  tzoom = 0.6;
  width = 800;
  height = 600;
  minZoom = 0.25;
  maxZoom = 14;

  setViewport(w: number, h: number) {
    this.width = w;
    this.height = h;
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom + this.width / 2, (wy - this.y) * this.zoom + this.height / 2];
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.width / 2) / this.zoom + this.x, (sy - this.height / 2) / this.zoom + this.y];
  }

  /** Zoom about a screen point. */
  zoomAt(sx: number, sy: number, factor: number, animate = false) {
    const [wx, wy] = this.toWorld(sx, sy);
    const nz = Math.max(this.minZoom, Math.min(this.maxZoom, (animate ? this.tzoom : this.zoom) * factor));
    // keep (wx, wy) under the cursor
    const nx = wx - (sx - this.width / 2) / nz;
    const ny = wy - (sy - this.height / 2) / nz;
    if (animate) {
      this.tzoom = nz;
      this.tx = nx;
      this.ty = ny;
    } else {
      this.zoom = this.tzoom = nz;
      this.x = this.tx = nx;
      this.y = this.ty = ny;
    }
  }

  flyTo(x: number, y: number, zoom?: number) {
    this.tx = x;
    this.ty = y;
    if (zoom !== undefined) this.tzoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.tx = this.x;
    this.ty = this.y;
  }

  fit(cx: number, cy: number, r: number) {
    const z = Math.min(this.width, this.height) / (r * 2.15);
    this.x = this.tx = cx;
    this.y = this.ty = cy;
    this.zoom = this.tzoom = z;
    this.minZoom = z * 0.6;
  }

  /** Ease toward targets; returns true while moving. */
  update(dt: number): boolean {
    const k = 1 - Math.exp(-dt * 9);
    const dz = this.tzoom - this.zoom;
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    if (Math.abs(dz) < 1e-4 && Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return false;
    // zoom in log space for a natural feel
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tzoom) - Math.log(this.zoom)) * k);
    this.x += dx * k;
    this.y += dy * k;
    return true;
  }

  /** Optical magnification label (microscope metaphor). */
  get magnification(): number {
    return this.zoom * 10;
  }
}
