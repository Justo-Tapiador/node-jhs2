/**
 * NODE-JHS2 — Example HTTPS Server
 *
 * Demonstrates how to integrate the JHS template engine
 * with a native Node.js HTTPS server.
 *
 * Prerequisites:
 *   - SSL certificate files in ./ssl/ (key.pem and cert.pem)
 *   - Run: node examples/server.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const JSTemplateEngine = require('../index');

// --- Engine setup ---
const engine = new JSTemplateEngine({
  viewsPath: path.join(__dirname, 'views'),
  cache: false, // Disable cache in development for live reloads
  banned_require: ['child_process'] // Block additional dangerous modules
});

// --- SSL options ---
// Generate self-signed certs for local dev:
//   openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, '../ssl/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../ssl/cert.pem'))
};

// --- Simple router helper ---
function getRoute(url) {
  return url.split('?')[0]; // Strip query string
}

// --- Request handler ---
async function handleRequest(req, res) {
  const route = getRoute(req.url);

  try {
    let html;

    if (route === '/' || route === '/index') {
      html = await engine.render('index.jhs', {
        title: 'NODE-JHS2 Example',
        heading: 'Welcome to NODE-JHS2',
        user: { name: 'Developer', isAdmin: true },
        items: ['Template caching', 'XSS auto-escaping', 'VM sandbox', 'include() support']
      });

    } else if (route === '/about') {
      html = await engine.renderString(`
        <!DOCTYPE html>
        <html>
          <head><title><?= title ?></title></head>
          <body>
            <h1><?= title ?></h1>
            <p>NODE-JHS2 version: <?= version ?></p>
            <a href="/">← Back</a>
          </body>
        </html>
      `, { title: 'About NODE-JHS2', version: '1.0.0' });

    } else {
      // 404
      html = await engine.renderString(`
        <!DOCTYPE html>
        <html>
          <body>
            <h1>404 — Not Found</h1>
            <p>The page <strong><?= path ?></strong> does not exist.</p>
            <a href="/">← Back to home</a>
          </body>
        </html>
      `, { path: route });

      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);

  } catch (err) {
    console.error('Template error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${err.message}`);
  }
}

// --- Start server ---
const PORT = 443;
const server = https.createServer(sslOptions, handleRequest);

server.listen(PORT, () => {
  console.log(`NODE-JHS2 example server running at https://localhost:${PORT}`);
});
