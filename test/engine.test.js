/**
 * NODE-JHS2 — Unit Tests
 * Run with: node test/engine.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSTemplateEngine = require('../index');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
(async () => {
  const engine = new JSTemplateEngine({ cache: false });

  console.log('\nNODE-JHS2 Test Suite\n');
  console.log('── renderString ──────────────────────────────────────────');

  await test('renders static HTML unchanged', async () => {
    const out = await engine.renderString('<h1>Hello</h1>', {});
    assert.strictEqual(out, '<h1>Hello</h1>');
  });

  await test('renders echo tag with variable', async () => {
    const out = await engine.renderString('<p><?= name ?></p>', { name: 'World' });
    assert.strictEqual(out, '<p>World</p>');
  });

  await test('auto-escapes HTML in echo tag', async () => {
    const out = await engine.renderString('<?= val ?>', { val: '<script>alert(1)</script>' });
    assert.strictEqual(out, '&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  await test('raw() bypasses auto-escape', async () => {
    const out = await engine.renderString('<?= raw(val) ?>', { val: '<b>bold</b>' });
    assert.strictEqual(out, '<b>bold</b>');
  });

  await test('executes code block (if/else)', async () => {
    const tpl = '<?jhs if (x > 0) { ?>positive<?jhs } else { ?>non-positive<?jhs } ?>';
    const out1 = await engine.renderString(tpl, { x: 5 });
    const out2 = await engine.renderString(tpl, { x: -1 });
    assert.strictEqual(out1.trim(), 'positive');
    assert.strictEqual(out2.trim(), 'non-positive');
  });

  await test('executes forEach loop', async () => {
    const tpl = '<?jhs items.forEach(i => { ?><?= i ?>,<?jhs }); ?>';
    const out = await engine.renderString(tpl, { items: ['a', 'b', 'c'] });
    assert.strictEqual(out, 'a,b,c,');
  });

  await test('echo() function outputs escaped content', async () => {
    const tpl = '<?jhs echo(msg); ?>';
    const out = await engine.renderString(tpl, { msg: '<b>test</b>' });
    assert.strictEqual(out, '&lt;b&gt;test&lt;/b&gt;');
  });

  await test('handles null/undefined in echo gracefully', async () => {
    const out = await engine.renderString('<?= val ?>', { val: null });
    assert.strictEqual(out, '');
  });

  console.log('\n── Security ──────────────────────────────────────────────');

  await test('blocks banned module (vm)', async () => {
    let threw = false;
    try {
      await engine.renderString('<?jhs require("vm"); ?>', {});
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, 'Expected an error for banned require');
  });

  await test('blocks banned module (jhs)', async () => {
    let threw = false;
    try {
      await engine.renderString('<?jhs require("jhs"); ?>', {});
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, 'Expected an error for banned require');
  });

  await test('custom banned_require is enforced', async () => {
    const safeEngine = new JSTemplateEngine({
      cache: false,
      banned_require: ['fs']
    });
    let threw = false;
    try {
      await safeEngine.renderString('<?jhs require("fs"); ?>', {});
    } catch (e) {
      threw = true;
    }
    assert.ok(threw, 'Expected an error for custom banned require');
  });

  console.log('\n── Cache ─────────────────────────────────────────────────');

  await test('clearCache() empties the cache', async () => {
    const cachedEngine = new JSTemplateEngine({ cache: true });
    // Force a cache entry by using a mock path trick via renderString (no file)
    cachedEngine.templateCache.set('test-key', 'compiled-fn');
    assert.strictEqual(cachedEngine.templateCache.size, 1);
    cachedEngine.clearCache();
    assert.strictEqual(cachedEngine.templateCache.size, 0);
  });

  console.log('\n── autoEscape: false ─────────────────────────────────────');

  await test('autoEscape=false does not escape output', async () => {
    const rawEngine = new JSTemplateEngine({ cache: false, autoEscape: false });
    const out = await rawEngine.renderString('<?= val ?>', { val: '<b>bold</b>' });
    assert.strictEqual(out, '<b>bold</b>');
  });

  console.log('\n── raw() in echo() ──────────────────────────────────────');

  await test('echo(raw()) prints trusted markup unescaped', async () => {
    const out = await engine.renderString('<?jhs echo(raw(msg)); ?>', { msg: '<b>bold</b>' });
    assert.strictEqual(out, '<b>bold</b>');
  });

  await test('mixed trust: raw() markup + escapeHtml() data', async () => {
    const tpl = '<?jhs echo(raw("<li>" + escapeHtml(item) + "</li>")); ?>';
    const out = await engine.renderString(tpl, { item: '<script>x</script>' });
    assert.strictEqual(out, '<li>&lt;script&gt;x&lt;/script&gt;</li>');
  });

  await test('raw() + concatenation keeps the [object Object] quirk (as documented)', async () => {
    const out = await engine.renderString('<?= raw("a") + "b" ?>', {});
    assert.strictEqual(out, '[object Object]b');
  });

  console.log('\n── Cache + mtime hot reload ──────────────────────────────');

  await test('cached template is reused until its mtime changes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jhs2-test-'));
    const file = path.join(dir, 'hot.jhs');
    try {
      fs.writeFileSync(file, 'v1');
      const hotEngine = new JSTemplateEngine({ cache: true, viewsPath: dir });

      let compiles = 0;
      const origCompile = hotEngine._compile.bind(hotEngine);
      hotEngine._compile = (src) => { compiles++; return origCompile(src); };

      assert.strictEqual(await hotEngine.render('hot.jhs'), 'v1');
      assert.strictEqual(await hotEngine.render('hot.jhs'), 'v1');
      assert.strictEqual(compiles, 1); // second render hit the cache

      fs.writeFileSync(file, 'v2');
      const later = new Date(Date.now() + 2000); // guarantee a different mtime
      fs.utimesSync(file, later, later);

      assert.strictEqual(await hotEngine.render('hot.jhs'), 'v2'); // hot reload
      assert.strictEqual(compiles, 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) process.exit(1);
})();
