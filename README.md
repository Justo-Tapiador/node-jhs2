<img width="256" alt="node-jhs" src="https://github.com/user-attachments/assets/5eb90692-affe-412f-859f-73f28f710da0" />

## What is it?
**NODE-JHS2** is a dynamic template engine for Node.js that lets you embed JavaScript directly in HTML files using `<?jhs ... ?>` delimiters — similar to PHP, but powered by JavaScript.

It is a complete rewrite of [node-jhs](https://github.com/YOUR_USERNAME/node-jhs), with improved security, sandboxed execution, XSS protection, and a cleaner API.

Template files use the `.jhs` extension and integrate seamlessly with native Node.js HTTPS servers and custom middleware chains.

---

## What's new in v2.0.0 (vs node-jhs v1)

| Feature | node-jhs v1 | NODE-JHS2 v2 |
|---|---|---|
| XSS auto-escaping | ❌ | ✅ |
| VM sandbox execution | ❌ | ✅ |
| `require()` filtering | ❌ | ✅ |
| Execution timeout | ❌ | ✅ 5s |
| `raw()` helper | ❌ | ✅ |
| `include()` support | ❌ | ✅ |
| `echo()` function | ❌ | ✅ |
| Template caching | ✅ | ✅ |
| Configurable delimiters | ✅ | ✅ |

> ⚠️ **Breaking change:** The internal compilation and execution model has been completely rewritten. See [Migration from v1](#migration-from-v1).

---

## Features

- 🔖 **PHP-like syntax** — use `<?jhs ... ?>` to run JavaScript inside HTML
- `<?= expr ?>` shorthand for outputting values
- 🛡️ **Auto XSS protection** — HTML escaping enabled by default
- ⚡ **Template caching** — compiled templates are cached for performance
- 🔒 **Sandboxed execution** — templates run inside a Node.js `vm` context
- 📦 **`require` filtering** — block dangerous or unwanted modules
- 🔁 **`include()` support** — embed sub-templates with shared data
- ⏱️ **Execution timeout** — 5-second limit per template to prevent hangs

---

## Installation

```bash
npm install node-jhs2
```

Or clone and use locally:

```bash
git clone https://github.com/Justo-Tapiador/node-jhs2.git
```

---

## Quick Start

### 1. Create a template file (`views/index.jhs`)

```html
<!DOCTYPE html>
<html>
<head>
  <title><?= title ?></title>
</head>
<body>
  <h1>Hello, <?= name ?>!</h1>

  <?jhs if (items.length > 0) { ?>
    <ul>
      <?jhs items.forEach(item => { ?>
        <li><?= item ?></li>
      <?jhs }); ?>
    </ul>
  <?jhs } ?>
</body>
</html>
```

### 2. Render in your server

```js
const https = require('https');
const fs = require('fs');
const JSTemplateEngine = require('node-jhs2');

const engine = new JSTemplateEngine({ viewsPath: './views' });

https.createServer({
  key:  fs.readFileSync('./ssl/key.pem'),
  cert: fs.readFileSync('./ssl/cert.pem')
}, async (req, res) => {
  const html = await engine.render('index.jhs', {
    title: 'My App',
    name: 'World',
    items: ['Apple', 'Banana', 'Cherry']
  });
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
}).listen(443);
```

---

## Template Syntax

### Output a value (auto-escaped)

```html
<?= variableName ?>
```

### Execute JavaScript

```html
<?jhs
  const greeting = 'Hello World';
  let count = 0;
?>
```

### Conditionals

```html
<?jhs if (user.isAdmin) { ?>
  <p>Welcome, Admin!</p>
<?jhs } else { ?>
  <p>Access denied.</p>
<?jhs } ?>
```

### Loops

```html
<?jhs users.forEach(user => { ?>
  <li><?= user.name ?> — <?= user.email ?></li>
<?jhs }); ?>
```

### Include sub-templates

```html
<?jhs const nav = await include('partials/nav.jhs', { active: 'home' }); ?>
<?= raw(nav) ?>
```

> `include()` inherits the parent template's data by default.

### Raw (unescaped) output

```html
<?= raw('<strong>Bold</strong>') ?>
```

### Echo function

```html
<?jhs echo('Hello ', username, '!'); ?>
```

---

## Integration with a Middleware-Based HTTPS Server

NODE-JHS2 is designed to work naturally with custom middleware chains on native Node.js HTTPS servers — no Express required.

The recommended pattern is a `MiddlewareManager` class that chains async functions, with one middleware that attaches `res.renderTemplate()` to the response object. All subsequent middleware and routes then call it directly.

```js
const server = new MiddlewareManager();

// ── Attach res.renderTemplate() ──────────────────────────────────────────────
server.use((req, res, next) => {
  res.renderTemplate = async (templatePath, data = {}, statusCode = 200) => {
    const html = await templateEngine.render(templatePath, { ...data, req, res });
    res.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  };
  next();
});

// ── Serve .jhs files automatically from /public ──────────────────────────────
server.use(async (req, res, next) => {
  const filePath = path.join(PUBLIC_DIR, req.pathname);
  if (path.extname(filePath) === '.jhs') {
    await res.renderTemplate(filePath, { user: req.user });
    return;
  }
  next();
});

// ── Application routes ────────────────────────────────────────────────────────
server.use(async (req, res, next) => {
  if (req.pathname === '/contact' && req.method === 'GET') {
    await res.renderTemplate('contact.jhs', { title: 'Contact Us' });
  } else {
    next();
  }
});

// ── Start HTTPS server ────────────────────────────────────────────────────────
https.createServer(sslOptions, (req, res) => server.execute(req, res))
     .listen(443);
```

See the full working example in [`examples/https-server.js`](examples/https-server.js).

---

## API

### `new JSTemplateEngine(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `viewsPath` | `string` | `./views` | Directory where `.jhs` template files are stored |
| `cache` | `boolean` | `true` | Cache compiled templates in memory |
| `openTag` | `string` | `<?jhs` | Opening tag for code blocks |
| `closeTag` | `string` | `?>` | Closing tag |
| `echoTag` | `string` | `<?=` | Opening tag for output expressions |
| `encoding` | `string` | `utf-8` | File encoding |
| `autoEscape` | `boolean` | `true` | Auto-escape HTML output to prevent XSS |
| `banned_require` | `string[]` | `['vm','jhs2']` | Modules blocked from use inside templates |

---

### `engine.render(templatePath, data)`

Renders a `.jhs` file from disk.

```js
const html = await engine.render('index.jhs', { title: 'Home' });
```

### `engine.renderString(template, data)`

Renders a template directly from a string.

```js
const html = await engine.renderString('<p><?= msg ?></p>', { msg: 'Hi!' });
```

### `engine.clearCache()`

Clears the in-memory template cache.

### `JSTemplateEngine.clearRequireCache(pattern)`

Clears Node.js `require` cache entries matching a pattern (useful in development).

```js
JSTemplateEngine.clearRequireCache('.jhs');
```

---

## Security

### XSS Protection

All values output via `<?= ?>` or `echo()` are HTML-escaped by default:

| Character | Escaped as |
|---|---|
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |
| `'` | `&#039;` |

Use `raw()` to output trusted HTML without escaping:

```html
<?= raw(trustedHtmlString) ?>
```

### Sandboxed VM Execution

Templates run inside a Node.js `vm.createContext()` sandbox with a 5-second execution timeout. Only explicitly whitelisted globals are available inside templates.

### `require` Filtering

Block specific modules from use inside templates:

```js
const engine = new JSTemplateEngine({
  banned_require: ['child_process', 'fs', 'net']
});
```

`vm` and `jhs2` are always blocked by default.

---

## Migration from v1

If you are migrating from [node-jhs v1](https://github.com/YOUR_USERNAME/node-jhs):

- **Template syntax is unchanged** — your `.jhs` files work as-is.
- **`autoEscape` is now on by default.** If you were outputting raw HTML via `<?= ?>`, wrap it with `raw()`: `<?= raw(myHtml) ?>`.
- **`require()` is now filtered.** `vm` and `jhs2` are always blocked. Add others via `banned_require`.
- **Constructor options are backwards compatible** — no changes needed.

---

## Project Structure

```
NODE-JHS2/
├── index.js                    # Main engine module
├── package.json
├── README.md
├── LICENSE
├── .gitignore
├── CHANGELOG.md
├── examples/
│   ├── https-server.js         # Full middleware-based HTTPS server example
│   ├── server.js               # Minimal HTTPS server example
│   └── views/
│       ├── index.jhs
│       └── partials/
│           └── nav.jhs
└── test/
    └── engine.test.js          # Unit tests (13 tests)
```

---

## Contributing

Pull requests are welcome. For major changes, open an issue first.

1. Fork the repo
2. Create your branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---
- [jhs-instantiator](https://github.com/Justo-Tapiador/jhs-instantiator) — 
  Hierarchical Instantiator companion module: progressively degrades 
  multi-rank JHS templates down to plain HTML.
  
## License

MIT — see [LICENSE](LICENSE) for details.
