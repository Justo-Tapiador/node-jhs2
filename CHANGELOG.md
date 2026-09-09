# Changelog

All notable changes to NODE-JHS2 will be documented in this file.

---

## [2.1.0] — 2026-09-09

Parity patch with the wallermax-server Rust port: same `__jhsEchoPart`
mechanism for `echo()`, same mtime hot-reload semantics for the cache.
No breaking changes — template syntax and the public API are untouched.

### Fixed

- `echo(raw(...))` now prints trusted markup unescaped. Previously the
  sentinel was flattened by `String()` before `__escape()` could see it,
  so `echo(raw("<b>bold</b>"))` rendered `[object Object]`.
  `<?= raw(...) ?>` was already correct in 2.0.0.
- Template cache is now revalidated against the file's `mtime` on every
  render: edit a `.jhs` file, save, render again — the new content is
  picked up without `clearCache()` or a process restart. Previously a
  cached template served its first compiled version forever.

### Added

- `__jhsEchoPart` helper in the sandbox context (the `echo()` argument
  mapper, mirroring the Rust port; data keys cannot shadow it).
- Cache entries now store `{ compiledFn, mtime }` instead of the bare
  compiled string (only relevant if you inspected `templateCache`
  directly).
- Tests for `echo(raw())`, mixed-trust output (`raw()` markup +
  `escapeHtml()` data), the `[object Object]` concatenation quirk, and
  mtime-based hot reload.

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
