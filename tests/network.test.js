import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimedFetch, readAll } from '../site/src/network.js';
import { createSupabaseRepository } from '../site/src/supabase.js';

test('reads all rows even when the server cap is below the requested page size', async () => {
  const rows = Array.from({ length: 2501 }, (_, id) => ({ id }));
  const result = await readAll(() => ({ range: async (from) => ({ data: rows.slice(from, from + 400), count: rows.length }) }));
  assert.deepEqual(result, rows);
});

test('does not silently return partial rows after a failed page', async () => {
  await assert.rejects(readAll(() => ({ range: async (from) => from ? { error: new Error('offline') } : { data: [{ id: 1 }], count: 2 } })), /offline/);
});

test('times out stalled requests', async () => {
  const fetcher = createTimedFetch((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), 20);
  await assert.rejects(fetcher('https://example.test'), /aborted/);
});

test('preserves status, headers and body', async () => {
  const response = await createTimedFetch(async () => new Response('[1]', { status: 206, headers: { 'content-range': '0-0/1' } }))('https://example.test');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), '0-0/1');
  assert.deepEqual(await response.json(), [1]);
});

function mockClient({ fail = '' } = {}) {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    const result = () => table === fail ? { error: new Error('offline') } : {
      data: [{ id: table + '-1' }], count: 1,
    };
    const query = { select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; }, range: async () => result(), then(resolve) { return Promise.resolve(result()).then(resolve); } };
    return query;
  } };
  return { client, calls };
}
const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } };

test('bootstrap performs only reads and loads category checks concurrently', async () => {
  const { client, calls } = mockClient();
  const repository = await createSupabaseRepository({}, client);
  const result = await repository.getBootstrap();
  assert.equal(result.spaces.length, 1);
  assert.equal(result.current_category_checks.length, 1);
  assert.equal(calls.length, 8);
  assert.equal(calls.filter((table) => table === 'app_settings').length, 1);
});

test('history failure does not hide the current checklist', async () => {
  const { client } = mockClient({ fail: 'archived_checks' });
  const result = await (await createSupabaseRepository({}, client)).getBootstrap();
  assert.equal(result.spaces.length, 1);
  assert.equal(result.warnings.length, 1);
});

test('current data failure is surfaced instead of showing a misleading empty checklist', async () => {
  const { client } = mockClient({ fail: 'spaces' });
  await assert.rejects((await createSupabaseRepository({}, client)).getBootstrap(), /offline/);
});

test('initial checklist does not request historical tables', async () => {
  const { client, calls } = mockClient();
  const result = await (await createSupabaseRepository({}, client)).getBootstrap({ includeHistory: false });
  assert.equal(result.spaces.length, 1);
  assert.equal(calls.length, 6);
  assert.ok(calls.every((table) => !table.startsWith('archived_')));
});
