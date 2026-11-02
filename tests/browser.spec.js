import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { getDateKey } from '../site/src/utils.js';

let server, base;
test.use({ channel: 'msedge' });
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const path = resolve('site', '.' + (req.url === '/' ? '/index.html' : req.url));
      const data = await readFile(path);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' })[extname(path)] || 'application/octet-stream');
      res.end(data);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => server.close());
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
});

test('demo renders all templates and persists a completed checklist after reload', async ({ page }) => {
  await page.route('**/app-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__APP_CONFIG__ = { useSupabase: false };' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base);
  await expect(page.locator('#app-loading')).toBeHidden();
  await expect(page.locator('#spaces-list .space-card')).toHaveCount(2);
  await page.locator('#employee-buttons button').first().click();
  await page.locator('[data-action="open-detail-sheet"][data-checklist-type="open"]').first().click();
  await expect(page.locator('#detail-sheet-body')).toContainText('의자 정리');
  await expect(page.locator('#detail-sheet-body')).toContainText('바닥 오염 확인');
  await page.locator('#detail-sheet-close').click();
  await page.locator('[data-action="toggle-summary-check"][data-checklist-type="open"]').first().check();
  await expect(page.locator('[data-action="toggle-summary-check"][data-checklist-type="open"]').first()).toBeChecked();
  await page.reload();
  await expect(page.locator('[data-space-id="space_demo_1"] [data-action="toggle-summary-check"][data-checklist-type="open"]').first()).toBeChecked();
  expect(errors).toEqual([]);
});

test('employee feature can be turned off and other open pages update without reload', async ({ page, context }) => {
  await context.route('**/app-config.js', (route) => route.fulfill({ contentType: 'text/javascript', body: 'window.__APP_CONFIG__ = { useSupabase: false };' }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base);
  await expect(page.locator('#app-loading')).toBeHidden();

  await page.locator('#setup-open-button').click();
  await page.locator('#setup-password').fill('8883');
  await page.locator('#setup-auth-form button').click();
  await page.locator('#use-employee-toggle').uncheck();
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator('#setup-close-button').click();
  await expect(page.locator('#employee-card')).toBeHidden();

  const other = await context.newPage();
  other.on('dialog', (dialog) => dialog.accept());
  await other.goto(base);
  await expect(other.locator('#app-loading')).toBeHidden();
  await expect(other.locator('#employee-card')).toBeHidden();

  const summary = '[data-space-id="space_demo_1"] [data-action="toggle-summary-check"][data-checklist-type="open"]';
  await page.locator(summary).check();
  await expect(page.locator(summary)).toBeChecked();
  await expect(other.locator(summary)).toBeChecked();

  await page.locator('[data-space-id="space_demo_1"] [data-action="open-space-sheet"]').click();
  await page.locator('#space-sheet-body [data-role="shared-comment-input"]').fill('정수기 점검 필요');
  await page.locator('#space-sheet-body [data-action="save-sheet-comment"]').click();
  await expect(page.locator('#space-sheet-body .comment-item')).toContainText('정수기 점검 필요');
  await expect(page.locator('#space-sheet-body .comment-item')).not.toContainText('닥디');
  await expect(page.locator('#space-sheet-body [data-action="delete-comment"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ddc-checklist-state-v4')).current_comments[0].employee_name);
  expect(stored).toBe('닥디');
  expect(errors).toEqual([]);
});

test('unreachable database shows retry and never substitutes demo items', async ({ page }) => {
  await page.route('https://*.supabase.co/**', (route) => route.abort('namenotresolved'));
  await page.goto(base);
  await expect(page.locator('#load-error')).toBeVisible();
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  await expect(page.locator('#app-loading')).toBeHidden();
  await expect(page.locator('#spaces-list .space-card')).toHaveCount(0);
});

test('server checklist appears before stalled archive maintenance completes', async ({ page }) => {
  const yesterday = getDateKey(new Date(Date.now() - 86400000), 'Asia/Seoul');
  let settingReads = 0;
  const writes = [];
  await page.route('https://*.supabase.co/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') { writes.push(request.method()); return route.abort(); }
    const table = new URL(request.url()).pathname.split('/').pop();
    if (table === 'app_settings' && ++settingReads > 1) {
      // Keep maintenance pending while the current checklist must already be usable.
      await new Promise((done) => setTimeout(done, 1500));
    }
    const data = table === 'spaces' ? Array.from({ length: 12 }, (_, index) => ({ id: `space-${index}`, name: `공간 ${index}`, sort_order: index, open_checklist_template: '첫 항목\n둘째 항목', close_checklist_template: '마감 항목' }))
      : table === 'app_settings' ? [{ id: 'settings', last_daily_archive_date: yesterday, history_limit: 10 }]
      : [];
    const isSingle = request.headers().accept?.includes('vnd.pgrst.object');
    await route.fulfill({ contentType: 'application/json', headers: { 'content-range': `0-${Math.max(data.length - 1, 0)}/${data.length}` }, body: JSON.stringify(isSingle ? data[0] : data) });
  });
  const started = Date.now();
  await page.goto(base);
  await expect(page.locator('#spaces-list .space-card')).toHaveCount(12);
  await expect(page.locator('#app-loading')).toBeHidden();
  expect(Date.now() - started).toBeLessThan(1500);
  expect(writes).toEqual([]);
});
