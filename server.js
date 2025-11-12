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
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
  }
}));

app.listen(PORT, () => {
  console.log(`SalaryLens server listening on http://localhost:${PORT}`);
});
