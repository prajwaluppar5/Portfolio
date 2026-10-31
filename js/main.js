import { createScene } from './scene.js';

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none)').matches;
const isMobile = () => innerWidth <= 900;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------- Smooth scroll (Lenis → ScrollTrigger) ---------------- */
let lenis = null;
if (!reduceMotion) {
  lenis = new Lenis({ lerp: 0.085, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop();
}
$$('a[href^="#"]').forEach((a) =>
  a.addEventListener('click', (e) => {
    const target = $(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    lenis ? lenis.scrollTo(target, { duration: 1.6 }) : target.scrollIntoView({ behavior: 'smooth' });
  })
);

/* ---------------- WebGL ---------------- */
let gl = null;
try {
  gl = createScene($('#gl'), { lowPower: isMobile() || isTouch });
} catch (err) {
  console.warn('WebGL unavailable, continuing without 3D', err);
  $('#gl').remove();
}


/* ---------------- Text splitting ---------------- */
const heroSplits = $$('.hero .split').map((el) => new SplitText(el, { type: 'words,chars' }));
const contactSplits = $$('.contact .split').map((el) => new SplitText(el, { type: 'words,chars' }));
heroSplits.forEach((s) => gsap.set(s.chars, { yPercent: 110 }));
const about = $('.reveal-words');
const aboutSplit = new SplitText(about, { type: 'words', wordsClass: 'w' });

/* ---------------- Loader ---------------- */
const log = $('#loaderLog');
const steps = ['Meshing 32,000 nodes…', 'Applying boundary conditions…', 'Solving K·u = F…', 'Post-processing σ_v…', 'Converged. Rendering.'];
const loader = { p: 0 };
const count = $('#loaderCount');
const bar = $('#loaderBar');
let stepShown = 0;
gsap.to(loader, {
  p: 100,
  duration: reduceMotion ? 0.4 : 2.6,
  ease: 'power2.inOut',
  onUpdate() {
    const v = Math.round(loader.p);
    count.textContent = String(v).padStart(3, '0');
    bar.style.width = v + '%';
    const want = Math.min(steps.length, Math.floor(v / 20) + 1);
    while (stepShown < want) {
      const p = document.createElement('p');
      p.textContent = '> ' + steps[stepShown++];
      log.appendChild(p);
    }
  },
  onComplete: intro,
});

function intro() {
  const tl = gsap.timeline({
    onComplete() {
      document.body.classList.remove('is-loading');
      lenis && lenis.start();
      ScrollTrigger.refresh();
    },
  });
  tl.to('#loader', { yPercent: -100, duration: 1.1, ease: 'expo.inOut' })
    .set('#loader', { display: 'none' })
    .to(heroSplits.flatMap((s) => s.chars), { yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: 0.035 }, '-=0.55')
    .from('.hero__meta, .hero__bottom, .header', { opacity: 0, y: 20, duration: 1, stagger: 0.1, ease: 'power3.out' }, '-=1');
  if (gl) tl.fromTo([gl.A.uniforms.uExplode, gl.B.uniforms.uExplode], { value: 2.5 }, { value: 0, duration: 2.4, ease: 'expo.out' }, 0.5);
}

/* ---------------- Clock (Karlsruhe) ---------------- */
const clock = $('#clock');
const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Berlin' });
const tick = () => (clock.textContent = fmt.format(new Date()));
tick();
setInterval(tick, 1000);

/* ---------------- Cursor ---------------- */
if (!isTouch) {
  const cur = $('.cursor');
  const dot = $('.cursor__dot');
  const ring = $('.cursor__ring');
  const label = $('.cursor__label');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
  addEventListener('pointermove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('[data-cursor]');
    cur.classList.toggle('is-hover', !!t);
    label.textContent = t ? t.dataset.cursor : '';
  });
}

/* ---------------- Magnetic buttons ---------------- */
$$('.magnetic').forEach((btn) => {
  const inner = btn.querySelector('span');
  btn.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    gsap.to(btn, { x: x * 0.3, y: y * 0.4, duration: 0.6, ease: 'power3.out' });
    gsap.to(inner, { x: x * 0.15, y: y * 0.15, duration: 0.6, ease: 'power3.out' });
  });
  btn.addEventListener('pointerleave', () => gsap.to([btn, inner], { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' }));
});

/* ---------------- Marquee (reacts to scroll velocity) ---------------- */
{
  const track = $('.marquee__track');
  const loop = gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
  let dir = 1;
  ScrollTrigger.create({
    onUpdate(self) {
      const v = self.getVelocity();
      if (v) dir = v > 0 ? 1 : -1;
      gsap.to(loop, { timeScale: dir * (1 + Math.min(Math.abs(v) / 250, 6)), duration: 0.2, overwrite: true });
      gsap.to(loop, { timeScale: dir, duration: 1.2, delay: 0.25, overwrite: false });
    },
  });
}

/* ---------------- About: word-by-word reveal + counters ---------------- */
gsap.to(aboutSplit.words, {
  opacity: 1, stagger: 0.1, ease: 'none',
  scrollTrigger: { trigger: about, start: 'top 80%', end: 'bottom 45%', scrub: true },
});
$$('[data-count]').forEach((el) => {
  const o = { v: 0 };
  const pre = el.dataset.prefix || '', suf = el.dataset.suffix || '';
  ScrollTrigger.create({
    trigger: el, start: 'top 88%', once: true,
    onEnter: () => gsap.to(o, { v: +el.dataset.count, duration: 1.8, ease: 'power3.out', onUpdate: () => (el.textContent = pre + Math.round(o.v) + suf) }),
  });
});
gsap.from('.stat', { y: 60, opacity: 0, stagger: 0.08, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.stats', start: 'top 85%' } });

/* ---------------- 3D choreography (scroll-scrubbed) ----------------
   Two particle bodies, A and B, each own half the particles. When they share a
   position and shape they read as one model; in pairs they split apart. Every
   section is a keyframe with a "hold" scroll range; between holds both bodies fly
   to the next layout while morphing, so every change uses the same motion. */
const hudCase = $('#hudCase');
const hudProg = $('#hudProg');
const SHAPE = { gyroid: 0, amca: 1, tejas: 2, car: 3, mono: 4, gear: 5, molar: 6 };

function layouts() {
  const m = isMobile();
  const W = innerWidth;
  const halfH = Math.tan((17.5 * Math.PI) / 180) * 7.2;
  const halfW = halfH * (W / innerHeight);
  // desktop: the screen is three slots (left gutter | card | right gutter);
  // each model sits in the centre of its gutter and is sized to fill it
  const cardW = ($('.chapter__inner') || {}).offsetWidth || 520;
  const slotPx = (W - cardW) / 2;
  const gx = (1 - slotPx / W) * halfW; // world x of the right slot's centre
  const slotW = (slotPx / W) * 2 * halfW;
  const sc = Math.min((slotW * 0.82) / 2.6, halfH * 0.62);
  return {
    hero: m ? { x: 0, y: 1.35, scale: 0.75 } : { x: Math.min(2.2, halfW * 0.55), y: 0.05, scale: 1.05 },
    pairA: m ? { x: 0.72, y: 1.9, scale: 0.36 } : { x: gx, y: 0, scale: sc },
    pairB: m ? { x: -0.72, y: 1.9, scale: 0.36 } : { x: -gx, y: 0, scale: sc },
    right: m ? { x: 0, y: 1.6, scale: 0.6 } : { x: gx, y: 0, scale: sc },
    left: m ? { x: 0, y: 1.6, scale: 0.6 } : { x: -gx, y: 0, scale: sc },
    contact: m ? { x: 0, y: -1.6, scale: 0.85 } : { x: Math.min(2.4, halfW * 0.6), y: -0.3, scale: 0.95 },
  };
}

// keyframes: el = section, a/b = [shape, layout key, scale factor]
const KEYS = [
  { el: '.hero', a: ['gyroid', 'hero'], b: ['gyroid', 'hero'], hud: 'LC0 · Gyroid lattice', rings: 0.22, holdTop: 0, holdEnd: 0.12 },
  { el: '.chapter[data-key="ch1"]', a: ['amca', 'pairA', 0.7], b: ['tejas', 'pairB', 0.7], hud: 'LC1 · Aerospace' },
  { el: '.chapter[data-key="ch2"]', a: ['car', 'pairA', 0.72], b: ['mono', 'pairB', 0.72], hud: 'LC2 · Motorsport' },
  { el: '.chapter[data-key="ch3"]', a: ['gear', 'right'], b: ['gear', 'right'], hud: 'LC3 · Research', rings: 0.12 },
  { el: '.chapter[data-key="ch4"]', a: ['molar', 'left', 0.82], b: ['molar', 'left', 0.82], hud: 'LC4 · Biomechanics', rings: 0.12 },
  { el: '.contact', a: ['gyroid', 'contact'], b: ['gyroid', 'contact'], hud: 'LC5 · Your problem', rings: 0.22, holdEnd: 99 },
];
let ranges = [];
function measure() {
  const vh = innerHeight;
  ranges = KEYS.map((k) => {
    const el = $(k.el);
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY, bottom = r.bottom + scrollY;
    const card = el.querySelector('.chapter__inner');
    if (card) {
      const ch = el.offsetHeight, cardH = card.offsetHeight;
      if (!isMobile()) {
        // the card is centred in its chapter and pins at 15vh: the model is fully
        // formed the moment the card pins, and bursts when the card starts to leave
        const stick = 0.15 * vh;
        const s = top + (ch - cardH) / 2 - stick;
        const e = bottom - cardH - stick;
        return { s, e: Math.max(e, s + 1) };
      }
      // phones (no pinning): formed once the card's top reaches mid-screen,
      // until the card has scrolled up past the models
      const cardTop = card.getBoundingClientRect().top + scrollY;
      const s = cardTop - 0.62 * vh;
      return { s, e: Math.max(cardTop - 0.1 * vh, s + 1) };
    }
    const s = k.holdTop !== undefined ? k.holdTop : top - vh * 0.25;
    const e = k.holdEnd !== undefined ? (k.holdEnd > 50 ? Infinity : top + vh * k.holdEnd) : bottom - vh * 0.95;
    return { s, e: Math.max(e, s + 1) };
  });
}
const ease = (t) => t * t * (3 - 2 * t);

function pose(k, which, L) {
  const [shape, lay, f = 1] = k[which];
  const p = L[lay];
  return { shape: SHAPE[shape], x: p.x, y: p.y, scale: p.scale * f };
}
// global scroll progress P: an integer inside a section's hold, fractional between.
// The 3D follows a damped copy of P, so it glides like a camera on rails.
let P = 0, Ps = 0;
function targetP() {
  const y = scrollY;
  let i = 0;
  while (i < ranges.length - 1 && y > ranges[i].e) i++;
  if (i > 0 && y < ranges[i].s) {
    // the burst takes the first stretch of the gap and the re-forming the last;
    // anything in between keeps the dust field open (t = 0.5), however long the gap
    const gapS = ranges[i - 1].e, gap = Math.max(1, ranges[i].s - gapS);
    const u = y - gapS, vh = innerHeight;
    const L1 = Math.min(0.5 * vh, gap / 2), L2 = Math.min(0.5 * vh, gap / 2);
    let t = 0.5;
    if (u < L1) t = 0.5 * (u / L1);
    else if (u > gap - L2) t = 0.5 + 0.5 * ((u - (gap - L2)) / L2);
    return i - 1 + Math.min(1, Math.max(0, t));
  }
  return i;
}
function update3D(dt = 1 / 60) {
  if (!ranges.length) return;
  P = targetP();
  Ps += (P - Ps) * (1 - Math.exp(-dt * 7));
  if (Math.abs(P - Ps) < 1e-4) Ps = P;
  const L = layouts();
  const from = Math.min(KEYS.length - 1, Math.floor(Ps));
  const to = Math.min(KEYS.length - 1, from + 1);
  const t = ease(Ps - from);
  const kf = KEYS[from], kt = KEYS[to];
  for (const which of ['a', 'b']) {
    const st = (which === 'a' ? gl.A : gl.B).state;
    const p0 = pose(kf, which, L), p1 = pose(kt, which, L);
    st.from = p0.shape; st.to = p1.shape; st.t = t;
    // models dissolve where they stand and re-form at their new spot; the jump
    // happens at t = 0.5, when every node is out in the dust field
    const p = t < 0.5 ? p0 : p1;
    st.x = p.x; st.y = p.y; st.scale = p.scale;
  }
  gl.view.ringOpacity = (kf.rings || 0) * (1 - t) + (kt.rings || 0) * t;
  const k = t < 0.5 ? kf : kt;
  hudCase.textContent = k.hud;
}

if (gl) {
  ScrollTrigger.addEventListener('refresh', measure);
  addEventListener('resize', measure);
  measure();
  gl.onFrame = update3D;

  $$('.chapter').forEach((ch) => {
    const inner = ch.querySelector('.chapter__inner');
    const title = new SplitText(ch.querySelector('.chapter__title'), { type: 'words,chars' });
    gsap.timeline({ scrollTrigger: { trigger: ch, start: 'top 65%' } })
      .from(inner, { opacity: 0, y: 80, duration: 1.1, ease: 'power3.out' })
      .from(title.chars, { yPercent: 100, opacity: 0, stagger: 0.025, duration: 0.8, ease: 'expo.out' }, 0.2)
      .from(inner.querySelectorAll('li, .chips span'), { opacity: 0, x: -16, stagger: 0.05, duration: 0.6 }, 0.4);
  });

  gsap.to('.hud', { opacity: 1, scrollTrigger: { trigger: '.about', start: 'top 80%', end: 'top 40%', scrub: true } });
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => (hudProg.textContent = String(Math.round(s.progress * 100)).padStart(3, '0') + '%') });
}

/* ---------------- Projects: pinned horizontal scroll ---------------- */
{
  const track = $('.projects__track');
  const dist = () => track.scrollWidth - innerWidth;
  gsap.to(track, {
    x: () => -dist(),
    ease: 'none',
    scrollTrigger: { trigger: '.projects', pin: '.projects__pin', start: 'top top', end: () => '+=' + dist(), scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
  });
}

/* ---------------- Toolkit + contact reveals ---------------- */
gsap.from('.tool-col li', { yPercent: 100, opacity: 0, stagger: 0.04, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: '.toolkit', start: 'top 70%' } });
gsap.from(contactSplits.flatMap((s) => s.chars), {
  yPercent: 110, stagger: 0.025, duration: 1.1, ease: 'expo.out',
  scrollTrigger: { trigger: '.contact', start: 'top 60%' },
});
gsap.from('.contact__actions .btn', { y: 40, opacity: 0, stagger: 0.1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.contact__actions', start: 'top 90%' } });

/* ---------------- Project thumbnails: procedural FE contour plots ---------------- */
function legend(x) {
  const c = [[13, 46, 242], [0, 204, 255], [38, 255, 89], [255, 235, 26], [255, 46, 20]];
  x = Math.min(Math.max(x, 0), 1) * 4;
  const i = Math.min(Math.floor(x), 3), f = x - i;
  return c[i].map((v, k) => Math.round(v + (c[i + 1][k] - v) * f));
}
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

function drawMesh(canvas, seed, time = 0) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const r = rng(seed * 9973 + 7);
  ctx.fillStyle = '#070807';
  ctx.fillRect(0, 0, W, H);
  const nx = 22, ny = 16, pad = 26;
  const hole = seed % 2 === 1 ? { x: W * (0.35 + r() * 0.3), y: H * (0.35 + r() * 0.3), r: H * (0.12 + r() * 0.08) } : null;
  const hot = Array.from({ length: 3 }, () => ({ x: r() * W, y: r() * H, a: 0.4 + r() * 0.6, s: 0.6 + r() * 1.4 }));
  const bend = (r() - 0.5) * 0.5;
  // node grid, jittered and bent like a deformed shape
  const P = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    let x = pad + (i / nx) * (W - pad * 2) + (i % nx && j % ny ? (r() - 0.5) * 6 : 0);
    let y = pad + (j / ny) * (H - pad * 2) + (i % nx && j % ny ? (r() - 0.5) * 6 : 0);
    const u = i / nx;
    y += Math.sin(u * Math.PI) * bend * 40 * Math.sin(time * 1.5 + 1) ;
    P.push([x, y]);
  }
  const stress = (x, y) => {
    let s = 0.15 + 0.25 * (y / H);
    for (const h of hot) { const d = Math.hypot(x - h.x, y - h.y) / (W * 0.25 * h.s); s += h.a * Math.exp(-d * d); }
    if (hole) { const d = Math.hypot(x - hole.x, y - hole.y); s += 0.9 * Math.pow(hole.r / Math.max(d, hole.r), 3); }
    return s + 0.04 * Math.sin(time * 2 + x * 0.05);
  };
  ctx.lineWidth = 0.6;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    for (const tri of [[a, b, d], [a, d, c]]) {
      const cx = (P[tri[0]][0] + P[tri[1]][0] + P[tri[2]][0]) / 3;
      const cy = (P[tri[0]][1] + P[tri[1]][1] + P[tri[2]][1]) / 3;
      if (hole && Math.hypot(cx - hole.x, cy - hole.y) < hole.r) continue;
      const [R, G, B] = legend(stress(cx, cy));
      ctx.fillStyle = `rgb(${R},${G},${B})`;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.beginPath();
      ctx.moveTo(...P[tri[0]]); ctx.lineTo(...P[tri[1]]); ctx.lineTo(...P[tri[2]]); ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
  }
  // constraint marks on the left edge, load arrow on the right
  ctx.strokeStyle = '#ecebe4'; ctx.lineWidth = 1.2;
  for (let j = 0; j <= ny; j += 2) { const [x, y] = P[j * (nx + 1)]; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 14, y - 6); ctx.lineTo(x - 14, y + 6); ctx.closePath(); ctx.stroke(); }
  const [ax, ay] = P[Math.floor(ny / 2) * (nx + 1) + nx];
  ctx.beginPath(); ctx.moveTo(ax + 4, ay); ctx.lineTo(ax + 20, ay); ctx.moveTo(ax + 4, ay); ctx.lineTo(ax + 10, ay - 5); ctx.moveTo(ax + 4, ay); ctx.lineTo(ax + 10, ay + 5); ctx.stroke();
  ctx.fillStyle = '#ecebe4'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('NODES ' + (nx + 1) * (ny + 1) + ' · ELEM ' + nx * ny * 2, 10, 14);
}
$$('.card__mesh').forEach((box) => {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 360;
  box.appendChild(c);
  const seed = +box.dataset.seed;
  drawMesh(c, seed);
  // the mesh "deforms" while you hover the card
  let raf = 0, t0 = 0;
  const card = box.closest('.card');
  const loop = (t) => { drawMesh(c, seed, (t - t0) / 1000); raf = requestAnimationFrame(loop); };
  card.addEventListener('pointerenter', () => { t0 = performance.now(); raf = requestAnimationFrame(loop); });
  card.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); drawMesh(c, seed); });
});

addEventListener('load', () => ScrollTrigger.refresh());
