"use client";
import { useEffect, useRef } from "react";

// Dot-matrix field behind the landing hero: a fixed grid of round "LED" dots,
// a slow drifting noise cloud, and an ink trail that follows the pointer,
// spreads, fades and drifts upward. When the pointer is still, a ghost cursor
// wanders so the hero is never static.
//
// - Transparent canvas: it sits on the page background, so it works on the
//   warm paper (light) and near-black (dark), and follows the theme toggle.
// - Decorative only: aria-hidden, no pointer capture (text and buttons above
//   stay clickable), pauses off-screen and in background tabs.
// - Reduced motion: one still frame of the cloud, no trail, no animation.
// - No WebGL: renders nothing.

const THEMES = {
  // base = cloud dots, trail = pointer ink, hot = the brightest core of the trail
  light: { base: [0.08, 0.08, 0.07], baseA: 0.2, trail: [0.09, 0.361, 0.827], hot: [0.082, 0.439, 0.937], trailA: 0.85 },
  dark: { base: [0.95, 0.94, 0.9], baseA: 0.16, trail: [0.353, 0.616, 1.0], hot: [0.65, 0.784, 1.0], trailA: 0.95 },
};

const FRAG = `precision highp float;
uniform vec2 uRes; uniform float uCell, uDotR, uTime, uBaseA, uTrailA;
uniform sampler2D uTrail; uniform vec2 uTS;
uniform vec3 cBase, cTrail, cHot;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p), u = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float b2(vec2 a){ a = floor(a); return fract(a.x/2. + a.y*a.y*.75); }
float b4(vec2 a){ return b2(.5*a)*.25 + b2(a); }
void main(){
  vec2 fr = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y), cell = floor(fr/uCell), ctr = (cell+.5)*uCell;
  float dm = 1. - smoothstep(uDotR-.7, uDotR+.7, length(fr-ctr));
  if (dm <= 0.) { gl_FragColor = vec4(0.); return; }
  float t = uTime, tv = texture2D(uTrail, (cell+.5)/uTS).r * 1.4;
  float n = vn(cell*.045 + vec2(t*.09, -t*.05))*.65 + vn(cell*.1035 + vec2(-t*.13, 7.1))*.35;
  float dens = clamp((n-.42)/.44, 0., 1.); dens *= dens*.55;
  vec3 col = cBase; float a = uBaseA;
  if (tv > .03) {
    float tt = min(tv, 1.);
    dens = max(dens, tt);
    col = mix(col, cTrail, min(1., tt*2.6));
    if (tv > .8) col = mix(col, cHot, min(1., (tv-.8)*1.6));
    a = mix(a, uTrailA, min(1., tt*2.));
  }
  if (dens <= b4(cell)) { gl_FragColor = vec4(0.); return; }
  float al = a*dm;
  gl_FragColor = vec4(col*al, al);
}`;

export function DotField({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl || gl.isContextLost()) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 p;void main(){gl_Position=vec4(p,0,1);}"));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    const U = (n) => gl.getUniformLocation(pr, n);

    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U("uTrail"), 0);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    // theme colours, live
    const applyTheme = () => {
      const t = THEMES[document.documentElement.dataset.theme === "dark" ? "dark" : "light"];
      gl.uniform3fv(U("cBase"), t.base); gl.uniform3fv(U("cTrail"), t.trail); gl.uniform3fv(U("cHot"), t.hot);
      gl.uniform1f(U("uBaseA"), t.baseA); gl.uniform1f(U("uTrailA"), t.trailA);
    };
    applyTheme();
    const themeObs = new MutationObserver(() => { applyTheme(); if (still) draw(0); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // trail simulation on the CPU, one value per dot
    const BRUSH = 6, DECAY = 0.982, DRIFT = 0.3;
    let cols = 0, rows = 0, a, b, bytes, cssCell = 6, hot = false, dirty = true;
    let pts = [], last = null, lastMove = -1e9, ghostLast = null, acc = 0, prev = 0;

    function resize() {
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
      const cell = Math.max(2, Math.round((r.width < 700 ? 5 : 6) * dpr));
      cssCell = cell / dpr;
      cv.width = W; cv.height = H;
      cols = Math.ceil(W / cell); rows = Math.ceil(H / cell);
      a = new Float32Array(cols * rows); b = new Float32Array(cols * rows); bytes = new Uint8Array(cols * rows);
      last = null; ghostLast = null; dirty = true;
      gl.viewport(0, 0, W, H);
      gl.uniform2f(U("uRes"), W, H); gl.uniform1f(U("uCell"), cell);
      gl.uniform1f(U("uDotR"), Math.max(0.9, 1.15 * dpr)); gl.uniform2f(U("uTS"), cols, rows);
      if (still) draw(0);
    }

    function stamp(x, y, s) {
      const R = BRUSH, R2 = R * R, inv = 1 / (R2 * 0.42);
      for (let j = Math.max(1, Math.floor(y - R)); j <= Math.min(rows - 2, Math.ceil(y + R)); j++)
        for (let i = Math.max(1, Math.floor(x - R)); i <= Math.min(cols - 2, Math.ceil(x + R)); i++) {
          const dx = i - x, dy = j - y, d2 = dx * dx + dy * dy;
          if (d2 > R2) continue;
          const k = j * cols + i;
          a[k] = Math.min(1.4, a[k] + s * Math.exp(-d2 * inv) * 0.45);
        }
      hot = true; dirty = true;
    }
    function stroke(from, x, y, s) {
      if (!from) return stamp(x, y, s);
      const dx = x - from[0], dy = y - from[1], d = Math.hypot(dx, dy);
      if (d > cols * 0.5) return stamp(x, y, s);
      const n = Math.min(90, Math.ceil(d / 0.8));
      for (let t = 1; t <= n; t++) stamp(from[0] + (dx * t) / n, from[1] + (dy * t) / n, s);
    }
    function diffuse() {
      if (!hot) return;
      const k = DECAY / 16; let sum = 0;
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        const v = (a[i] * 12 + a[i - 1] + a[i + 1] + a[i - cols] * (1 - DRIFT) + a[i + cols] * (1 + DRIFT)) * k;
        b[i] = v; sum += v;
      }
      [a, b] = [b, a]; hot = sum > 0.5; dirty = true;
      if (!hot) a.fill(0);
    }

    function draw(now) {
      if (!cols) return;
      if (dirty) {
        for (let i = 0; i < a.length; i++) bytes[i] = Math.min(255, a[i] * 182);
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, cols, rows, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
        dirty = false;
      }
      gl.uniform1f(U("uTime"), still ? 12.0 : now / 1000);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    resize();
    if (still) return () => { ro.disconnect(); themeObs.disconnect(); gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(pr); };

    // pointer: listen on the window so text and buttons above stay clickable
    const onMove = (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) { last = null; return; }
      pts.push([x / cssCell, y / cssCell]);
      lastMove = performance.now(); ghostLast = null;
    };
    const onLeave = () => { last = null; };
    addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);

    let raf = 0, visible = true;
    function frame(now) {
      raf = 0;
      if (!visible) return;
      for (const p of pts) { stroke(last, p[0], p[1], 1); last = p; }
      pts.length = 0;
      if (now - lastMove > 2800) { // idle: a ghost cursor wanders across the right half
        const t = now / 1000;
        const gx = cols * (0.62 + 0.26 * Math.sin(t * 0.47)), gy = rows * (0.42 + 0.22 * Math.sin(t * 0.83 + 1.3));
        stroke(ghostLast, gx, gy, 0.6); ghostLast = [gx, gy];
      }
      acc = Math.min(acc + (now - (prev || now)), 100); prev = now;
      while (acc >= 16.67) { diffuse(); acc -= 16.67; } // fixed 60 Hz simulation
      draw(now);
      raf = requestAnimationFrame(frame);
    }
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) { prev = 0; raf = requestAnimationFrame(frame); }
    });
    io.observe(cv);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); themeObs.disconnect();
      removeEventListener("pointermove", onMove); document.removeEventListener("pointerleave", onLeave);
      // free GPU objects but keep the context: React may mount this again on the same canvas
      gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(pr);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none block h-full w-full ${className}`} />;
}
