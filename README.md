# Pranav Raut — Portfolio

Personal portfolio of **Pranav Ramesh Raut**, Python AI/ML Software Developer.
Built with plain HTML, CSS, vanilla JavaScript (ES modules) and Three.js, bundled with Vite.
Fully static — deployable on Netlify Free with no backend, database, API keys or environment variables.

## Run locally

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build → dist/
npm run preview   # serve the production build at http://localhost:4173
```

## Project structure

```
index.html              All page content (semantic HTML, SEO + Open Graph meta)
vite.config.js          Build config; generates sitemap.xml + robots.txt from the deploy URL
netlify.toml            Netlify build settings + headers
public/
  favicon.svg
  apple-touch-icon.png
  og-image.png          Social share preview (1200×630)
  resume.pdf            ← add your resume here
src/
  main.js               Entry: fonts, styles, module bootstrapping, lazy-loads the 3D scene
  style.css             Design tokens, layout, components, responsive + reduced-motion rules
  js/
    scene.js            Three.js neural sphere, signal pulses, particle ring & background field
    animations.js       Scroll reveals, hero text animation, role typer, timeline progress
    navigation.js       Sticky header, active-section tracking, mobile menu (focus-trapped)
    interactions.js     Card tilt, skills orbit highlighting, project dialog, copy email, resume check
```

## Updating content

- **Text, experience, projects, skills** — edit `index.html` directly.
- **Resume** — replace `public/resume.pdf` (keep the file name). Until it exists, the
  Download Resume buttons show a short message asking visitors to email instead.
- **Site URL** — on Netlify the deployed URL is picked up automatically (via Netlify's `URL`
  build variable) for the canonical link, Open Graph tags and sitemap. To build for a custom domain
  elsewhere: `SITE_URL=https://your-domain.com npm run build`.
