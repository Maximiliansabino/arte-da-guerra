import test from 'node:test';
import assert from 'node:assert/strict';
import {server} from '../server.js';

test('rede v0.7: grafo de módulos do cliente e atlas dos mercenários são servidos pelo mesmo servidor', {timeout:10000}, async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pending = [new URL('/client.js', base)], seen = new Set();
    while (pending.length) {
      const url = pending.pop();
      if (seen.has(url.pathname)) continue;
      assert.equal(url.origin, base, 'módulos do jogo não dependem de terceiros');
      seen.add(url.pathname);
      const response = await fetch(url);
      assert.equal(response.status, 200, `${url.pathname} deve ser carregável pelo navegador`);
      assert.match(response.headers.get('content-type'), /javascript/);
      const source = await response.text();
      for (const match of source.matchAll(/\bimport\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g)) {
        pending.push(new URL(match[1], url));
      }
    }
    assert.ok(seen.has('/neutral-art.js'), 'cliente deve carregar a arte nova');
    assert.ok(seen.has('/rules.js'));
    assert.ok(seen.has('/camp-config.js'));
    assert.ok(seen.has('/recruitment.js'), 'interface e servidor usam o planejamento de recrutamento');
    assert.ok(seen.has('/hero-guide.js'), 'guia de heróis é carregado pelo cliente');
    const atlas = await fetch(base + '/assets/mercenary-atlas-v07.png');
    assert.equal(atlas.status, 200);
    assert.match(atlas.headers.get('content-type'), /image\/png/);
    const bytes = Buffer.from(await atlas.arrayBuffer());
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    assert.ok(bytes.readUInt32BE(16) >= 512 && bytes.readUInt32BE(20) >= 512, 'atlas tem resolução suficiente para quatro personagens');
    assert.equal((await fetch(base + '/assets/../package.json')).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
