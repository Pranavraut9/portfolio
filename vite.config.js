import { defineConfig } from 'vite';

// Netlify exposes the deployed site URL as process.env.URL during builds,
// so absolute URLs (canonical, Open Graph, sitemap) are filled in automatically.
// Override locally with: SITE_URL=https://your-domain npm run build
const SITE_URL = (process.env.SITE_URL || process.env.URL || 'http://localhost:4173').replace(/\/$/, '');

function siteMeta() {
  return {
    name: 'site-meta',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', SITE_URL);
    },
    generateBundle() {
      const today = new Date().toISOString().slice(0, 10);
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [siteMeta()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    // three.js is lazy-loaded after first paint, so its larger chunk never blocks content
    chunkSizeWarningLimit: 600,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  server: { open: false },
});
