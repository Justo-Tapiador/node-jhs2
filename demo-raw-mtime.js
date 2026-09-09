/**
 * Demo del parche node-jhs2 2.1.0 — raw() sentinel en echo() + hot reload por mtime.
 * Ejecutar desde la raíz del repo tras aplicar el parche:  node demo-raw-mtime.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSTemplateEngine = require('./index');

(async () => {
  const engine = new JSTemplateEngine({ autoEscape: true });

  console.log('1. <?= raw(x) ?>        →', await engine.renderString('<?= raw(x) ?>', { x: '<b>negrita</b>' }));
  console.log('2. <?= x ?>  (escapado) →', await engine.renderString('<?= x ?>', { x: '<b>negrita</b>' }));
  console.log('3. echo(raw(x))         →', await engine.renderString('<?jhs echo(raw(x)); ?>', { x: '<li>elemento</li>' }));
  console.log('4. echo(x)   (escapado) →', await engine.renderString('<?jhs echo(x); ?>', { x: '<li>elemento</li>' }));
  console.log('5. mixto raw+escapeHtml →', await engine.renderString(
    '<?jhs echo(raw("<li>" + escapeHtml(user) + "</li>")); ?>', { user: '<script>mal' }));
  console.log('6. quirk raw()+"b"      →', await engine.renderString('<?= raw("a") + "b" ?>', {}));

  // require('url') — el caso que motivó la migración al sidecar
  const tpl = [
    "<?jhs var u = require('url'); ?>",
    "<?= new u.URL('https://example.com/v?id=7').searchParams.get('id') ?>"
  ].join('\n');
  console.log('7. require("url")       →', await engine.renderString(tpl, {}));

  // Hot reload por mtime (sin clearCache, sin reinicio)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jhs2-demo-'));
  const file = path.join(dir, 'hot.jhs');
  fs.writeFileSync(file, 'VERSION 1');
  const hot = new JSTemplateEngine({ cache: true, viewsPath: dir });
  console.log('8. render #1            →', await hot.render('hot.jhs'));
  fs.writeFileSync(file, 'VERSION 2 (editada en disco)');
  const later = new Date(Date.now() + 2000);
  fs.utimesSync(file, later, later); // garantiza mtime distinto
  console.log('9. render #2 sin clear  →', await hot.render('hot.jhs'), '← hot reload por mtime');
  fs.rmSync(dir, { recursive: true, force: true });
})();
