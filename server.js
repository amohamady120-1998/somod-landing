const express = require('express');
const compression = require('compression');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// Allow the pages' own inline scripts (the theme setter in <head>) by hash, so the
// policy keeps working when one of them is edited.
const inlineScriptHashes = new Set();
for (const file of fs.readdirSync(PUBLIC).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(path.join(PUBLIC, file), 'utf8');
  for (const [, body] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    inlineScriptHashes.add(`'sha256-${crypto.createHash('sha256').update(body).digest('base64')}'`);
  }
}

const CSP = [
  "default-src 'self'",
  `script-src 'self' ${[...inlineScriptHashes].join(' ')}`,
  "style-src 'self' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self' https://api.web3forms.com",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

app.disable('x-powered-by');
app.use(compression());
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  });
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.static(PUBLIC, {
  extensions: ['html'], // /privacy serves privacy.html
  setHeaders(res, filePath) {
    // Images keep their names when they change, so cache them for a week and revalidate
    // pages, styles and scripts on every visit (cheap thanks to ETags).
    if (/\.(webp|png|jpg|svg|ico)$/.test(filePath)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'no-cache');
  },
}));

app.use((req, res) => res.status(404).sendFile(path.join(PUBLIC, '404.html')));

app.listen(PORT, () => console.log(`Somod Landing on port ${PORT}`));
