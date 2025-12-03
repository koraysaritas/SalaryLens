const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Health endpoint
app.get('/healthz', (req, res) => {
  res.json({ ok: true });
});

// Serve static files from /public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    // Basic security headers for static content
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '0');

    // Cache-busting strategy:
    // - HTML files: no-cache (always revalidate)
    // - Versioned assets (CSS, JS, SVG with ?v= query): long-term cache
    // - Other files: short cache
    if (filePath.endsWith('.html')) {
      // Always revalidate HTML to get latest version references
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else if (filePath.match(/\.(css|js|svg)$/) && res.req.url.includes('?v=')) {
      // Versioned assets can be cached for a long time (1 year)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // Default: short cache for other files
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.listen(PORT, () => {
  console.log(`SalaryLens server listening on http://localhost:${PORT}`);
});
