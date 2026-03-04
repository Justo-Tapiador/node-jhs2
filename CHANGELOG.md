# Changelog

All notable changes to NODE-JHS2 will be documented in this file.

---

## [2.0.0] — 2026-03-04

This is a complete rewrite of [node-jhs v1](https://github.com/YOUR_USERNAME/node-jhs).
Template syntax (`<?jhs ?>`, `<?= ?>`) is unchanged — existing `.jhs` files are compatible.

### Breaking Changes

- `autoEscape` is now **enabled by default**. Values output via `<?= ?>` are HTML-escaped automatically. Use `raw()` to opt out: `<?= raw(html) ?>`.
- `require()` inside templates is now **filtered**. Calling a blocked module throws an error. `vm` and `jhs2` are always blocked.
- The internal compilation and execution pipeline has been fully replaced.

### Added

- Sandboxed execution via `vm.createContext()` — templates no longer run in the global Node.js scope
- 5-second execution timeout per template to prevent infinite loops
- `autoEscape` option with automatic XSS protection for all output
- `raw()` helper — bypass escaping for trusted HTML content
- `raw()` uses a sentinel `RawString` wrapper so it correctly bypasses `__escape()` inside `<?= ?>` echo tags (bug that existed in v1)
- `echo()` function available inside all templates
- `include()` helper — render sub-templates with inherited or extended data
- `banned_require` option — configurable list of blocked modules
- `res.renderTemplate()` integration pattern for middleware-based HTTPS servers
- `res.json()`, `res.send()`, `res.redirect()` helper pattern documented
- Full async/await support throughout

### Unchanged from v1

- Template file extension: `.jhs`
- Delimiter syntax: `<?jhs ... ?>` and `<?= expr ?>`
- `viewsPath`, `cache`, `openTag`, `closeTag`, `echoTag`, `encoding` options
- `engine.render(path, data)` and `engine.renderString(template, data)` API
- `engine.clearCache()` and `JSTemplateEngine.clearRequireCache(pattern)`
