/**
 * NODE-JHS2 — Integration Example with a Native Node.js HTTPS Server
 *
 * This example shows how to integrate the JHS template engine
 * into a custom middleware-based HTTPS server — without Express or any framework.
 *
 * Architecture:
 *   - A simple MiddlewareManager class chains async middleware functions
 *   - One middleware attaches res.renderTemplate(), res.json(), res.send(), res.redirect()
 *   - Template files (.jhs) in /public are detected and rendered automatically
 *   - Static files are served from /public
 *   - A final middleware renders a 404 error page
 *
 * Prerequisites:
 *   SSL certificate files (generate self-signed for local dev):
 *     openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes
 */

'use strict';

const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const JSTemplateEngine = require('../index');

// ─── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  port: 443,
  host: '0.0.0.0',
  ssl: {
    key:  path.join(__dirname, '../ssl/key.pem'),
    cert: path.join(__dirname, '../ssl/cert.pem'),
  },
  views:     path.join(__dirname, 'views'),
  publicDir: path.join(__dirname, 'public'),
};

// ─── Template Engine ──────────────────────────────────────────────────────────

const templateEngine = new JSTemplateEngine({
  viewsPath: CONFIG.views,
  cache: process.env.NODE_ENV === 'production', // cache on in prod, off in dev
  autoEscape: true,
});

// ─── MiddlewareManager ────────────────────────────────────────────────────────

/**
 * Minimal middleware chain manager.
 * Works like Express app.use() but built on raw Node.js.
 * Each middleware receives (req, res, next) and must call next() to continue.
 */
class MiddlewareManager {
  constructor() {
    this.middlewares = [];
  }

  /** Register a middleware function */
  use(middleware) {
    this.middlewares.push(middleware);
  }

  /** Execute the middleware chain for a request */
  async execute(req, res) {
    let index = 0;

    const next = async (error) => {
      if (error) {
        console.error('Middleware error:', error);
        if (!res.headersSent) {
          await renderError(res, 500);
        }
        return;
      }

      if (index >= this.middlewares.length) {
        if (!res.headersSent) {
          await renderError(res, 404);
        }
        return;
      }

      const middleware = this.middlewares[index++];
      try {
        await middleware(req, res, next);
      } catch (err) {
        await next(err);
      }
    };

    await next();
  }
}

// ─── Error page helper ────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  400: 'Bad Request',
  403: 'Forbidden',
  404: 'Page Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

async function renderError(res, code) {
  const message = ERROR_MESSAGES[code] || 'Unknown Error';
  try {
    const html = await templateEngine.render('errors/error.jhs', { code, message });
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    // Fallback if error template itself fails
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><html><body><h1>${code} — ${message}</h1></body></html>`);
  }
}

// ─── Middleware chain ─────────────────────────────────────────────────────────

const server = new MiddlewareManager();

// ── 1. Attach helper methods to res ──────────────────────────────────────────
//
// This is the key integration point for NODE-JHS2.
// All subsequent middlewares can call res.renderTemplate() to render .jhs files.
//
server.use((req, res, next) => {

  /**
   * Render a .jhs template and send the response.
   * @param {string} templatePath - Template file path (relative to viewsPath, or absolute)
   * @param {object} data         - Data passed into the template
   * @param {number} statusCode   - HTTP status code (default: 200)
   */
  res.renderTemplate = async (templatePath, data = {}, statusCode = 200) => {
    try {
      const html = await templateEngine.render(templatePath, {
        ...data,
        req,  // req and res are always available inside .jhs templates
        res,
      });
      res.writeHead(statusCode, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(html),
      });
      res.end(html);
    } catch (error) {
      console.error('renderTemplate error:', error.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Template render error: ' + error.message);
      }
    }
  };

  /** Send a JSON response */
  res.json = (data, statusCode = 200) => {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  };

  /** Send a plain text response */
  res.send = (text, statusCode = 200) => {
    res.writeHead(statusCode, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
    });
    res.end(text);
  };

  /** Redirect to another URL */
  res.redirect = (location, statusCode = 302) => {
    res.writeHead(statusCode, { 'Location': location });
    res.end();
  };

  next();
});

// ── 2. Parse URL and query string ────────────────────────────────────────────
server.use((req, res, next) => {
  const parsed   = url.parse(req.url, true);
  req.pathname   = parsed.pathname;
  req.query      = parsed.query;
  next();
});

// ── 3. Block non-allowed HTTP methods ────────────────────────────────────────
const ALLOWED_METHODS = new Set(['GET', 'POST', 'HEAD', 'OPTIONS']);

server.use((req, res, next) => {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.writeHead(405, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Allow': [...ALLOWED_METHODS].join(', '),
    });
    res.end(`Method ${req.method} not allowed`);
    return;
  }
  next();
});

// ── 4. Serve static files and .jhs templates from /public ────────────────────
//
// Files with .jhs extension are rendered as templates.
// All other files are served as static assets.
// Directories automatically resolve to index.jhs or index.html.
//
server.use(async (req, res, next) => {
  try {
    const decoded  = decodeURIComponent(req.pathname);
    const safePath = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
    let   filePath = path.join(CONFIG.publicDir, safePath);

    // Prevent path traversal
    if (!filePath.startsWith(CONFIG.publicDir)) return next();

    let stats;
    try {
      stats = await fs.promises.stat(filePath);
    } catch {
      return next(); // File not found — pass to next middleware
    }

    // Directory → look for index.jhs or index.html
    if (stats.isDirectory()) {
      const indexJhs  = path.join(filePath, 'index.jhs');
      const indexHtml = path.join(filePath, 'index.html');

      try {
        await fs.promises.access(indexJhs);
        filePath = indexJhs;
      } catch {
        try {
          await fs.promises.access(indexHtml);
          filePath = indexHtml;
        } catch {
          return next(); // No index found
        }
      }
    }

    const ext = path.extname(filePath);

    // .jhs → render as template
    if (ext === '.jhs') {
      await res.renderTemplate(filePath, {
        // Pass any global template data here
        // e.g. user: req.user, siteName: 'My App'
      });
      return;
    }

    // Static file → serve with correct MIME type
    const MIME_TYPES = {
      '.html': 'text/html',
      '.css':  'text/css',
      '.js':   'text/javascript',
      '.json': 'application/json',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.webp': 'image/webp',
      '.gif':  'image/gif',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.woff': 'font/woff',
      '.woff2':'font/woff2',
      '.ttf':  'font/ttf',
      '.pdf':  'application/pdf',
      '.mp3':  'audio/mpeg',
    };

    const content = await fs.promises.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    res.end(content);

  } catch (error) {
    console.error('Static file middleware error:', error);
    return next();
  }
});

// ── 5. Application routes ─────────────────────────────────────────────────────

// GET /contact
server.use(async (req, res, next) => {
  if (req.pathname === '/contact' && req.method === 'GET') {
    await res.renderTemplate('contact.jhs', {
      title: 'Contact Us',
      error: null,
      success: null,
      formData: {},
    });
  } else {
    next();
  }
});

// POST /contact
server.use(async (req, res, next) => {
  if (req.pathname === '/contact' && req.method === 'POST') {
    // Read POST body
    const body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try {
          resolve(Object.fromEntries(new URLSearchParams(data)));
        } catch {
          reject(new Error('Invalid POST body'));
        }
      });
    });

    const { name, email, message } = body;

    if (!name || !email || !message) {
      return await res.renderTemplate('contact.jhs', {
        title: 'Contact Us',
        error: 'All fields are required.',
        success: null,
        formData: { name, email, message },
      });
    }

    // Process the message (save to DB, send email, etc.)
    console.log('Contact form received:', { name, email, message });

    await res.renderTemplate('contact.jhs', {
      title: 'Contact Us',
      error: null,
      success: 'Message sent! We will get back to you soon.',
      formData: {},
    });
  } else {
    next();
  }
});

// ── 6. Final 404 catch-all ────────────────────────────────────────────────────
server.use(async (req, res) => {
  await renderError(res, 404);
});

// ─── HTTPS Server ─────────────────────────────────────────────────────────────

const httpsServer = https.createServer(
  {
    key:  fs.readFileSync(CONFIG.ssl.key),
    cert: fs.readFileSync(CONFIG.ssl.cert),
  },
  async (req, res) => {
    await server.execute(req, res);
  }
);

httpsServer.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`✓ Server running at https://${CONFIG.host}:${CONFIG.port}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function stop() {
  console.log('\n⏹  Shutting down server...');
  httpsServer.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT',  stop);
process.on('SIGTERM', stop);

module.exports = { server, templateEngine, httpsServer };
