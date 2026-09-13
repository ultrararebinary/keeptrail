import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { app as Server } from '../apps/server/src/index';

let app: typeof Server;
const previousDirectory = process.env.KEEPTRAIL_DATA_DIR;
const directory = mkdtempSync(join(tmpdir(), 'keeptrail-api-test-'));
beforeAll(async () => {
  process.env.KEEPTRAIL_DATA_DIR = directory;
  app = (await import('../apps/server/src/index')).app;
  await app.ready();
});
afterAll(async () => {
  await app.close();
  if (previousDirectory === undefined) delete process.env.KEEPTRAIL_DATA_DIR;
  else process.env.KEEPTRAIL_DATA_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});

it('exposes safe capability reports with correlation IDs and rejects foreign hosts/origins', async () => {
  const response = await app.inject({ url: '/api/diagnostics' });
  expect(response.statusCode).toBe(200);
  expect(response.headers['x-request-id']).toBeTruthy();
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.json().capabilities.cloudAnalysis).toBe('available');
  expect(response.body).not.toContain(directory);
  expect((await app.inject({ url: '/api/diagnostics', headers: { host: 'example.com' } })).statusCode).toBe(403);
  expect((await app.inject({ url: '/api/diagnostics', headers: { origin: 'https://example.com' } })).statusCode).toBe(403);
});

it('returns useful missing-source and duplicate-job statuses', async () => {
  expect((await app.inject({ url: '/api/items/missing/diagnostics' })).statusCode).toBe(404);
  const bootstrap = await app.inject({ url: '/api/settings' });
  const setCookie = bootstrap.headers['set-cookie'];
  const cookie = (Array.isArray(setCookie) ? setCookie : [setCookie]).filter(Boolean).map((value) => value.split(';', 1)[0]).join('; ');
  const csrf = /(?:^|; )keeptrail_csrf=([^;]+)/.exec(cookie)?.[1];
  const imported = await app.inject({ method: 'POST', url: '/api/import/url', headers: { cookie, 'x-csrf-token': csrf }, payload: { urls: 'https://www.instagram.com/p/api-test/' } });
  const id = imported.json().created[0].id;
  expect((await app.inject({ url: `/api/items/${id}/diagnostics` })).json().status).toBe('queued');
  expect((await app.inject({ method: 'POST', url: `/api/items/${id}/retry`, headers: { cookie, 'x-csrf-token': csrf } })).statusCode).toBe(409);
});
