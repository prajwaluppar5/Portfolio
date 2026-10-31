# Portfolio — Prajwal Uppar

A one-page, scroll-driven 3D portfolio. It takes its style from award-winning sites such as
landonorris.com (OFF+BRAND: Webflow, Lenis smooth scroll, GSAP, Rive), but the design and code here are original.

## Live site

<https://prajwaluppar5.github.io/Portfolio/>, served by GitHub Pages from the `main` branch root.

## Run it locally

- **Windows:** double-click `open_local.bat`. It opens <http://localhost:5199/>.
- **macOS/Linux:** `./open_local.sh`
- Any static server works (`python -m http.server`). Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

No build step. All libraries and fonts are saved in `vendor/` and `fonts/`, so it also works offline.

## What's in it

| Section | Effect |
|---|---|
| Loader | Counts up "solver" steps with a stress-legend progress bar, then the curtain wipes up |
| Hero | Huge split-letter name rises in; 32k-particle "specimen" assembles from an explosion |
| Marquee | Infinite ticker that speeds up and reverses with scroll velocity |
| About | Words light up as you scroll; stats count up |
| Experience | 4 pinned chapters. Particles morph **specimen → jet → race wheel → gear → molar** |
| Projects | Pinned horizontal scroll; each card has a procedural FE contour plot that deforms on hover |
| Toolkit / Contact | Hover fills, magnetic buttons, Karlsruhe live clock, custom cursor with labels |

The particles are coloured like an FEA result plot (blue → red, low → high stress), and the cursor acts as a moving load.

## Where the "3D assets" come from

There are none to license. Every shape is generated in code in `js/shapes.js` (three.js primitives,
extrusions and vertex displacement), then sampled into particles in `js/scene.js`. Project thumbnails are
drawn on a 2D canvas in `js/main.js`.

## Files

```
index.html          markup + content
css/style.css       layout, type, responsive rules
js/main.js          Lenis + GSAP ScrollTrigger choreography, loader, cursor, cards
js/scene.js         three.js renderer, particle morph shader, bloom
js/shapes.js        procedural shapes + fake stress fields
vendor/             three r180 (+ addons), GSAP 3.13 (+ ScrollTrigger, SplitText), Lenis 1.3
fonts/              Big Shoulders Display, Inter Tight, JetBrains Mono (OFL, via Fontsource)
```

## Editing content

All text is in `index.html`. Facts come from the Master CV in the KrazeBase vault. Push to `main` and the live site updates within a minute or two. Phone number and date
of birth are deliberately left out because the site is public-facing. To add a 3D shape: write a builder in
`shapes.js`, add it to `shapeBuilders` + `loadPoints`, then extend `pick()`/`pickS()` in the shader
(currently max 5 shapes, indices 0–4).

## Licences

three.js (MIT), Lenis (MIT), GSAP (free GreenSock standard licence), fonts (SIL OFL 1.1).
