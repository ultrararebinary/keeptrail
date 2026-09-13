import { describe, expect, it } from 'vitest';
import { normalizeSource, rejectPrivateHostname } from '../packages/core/src/normalize';
import { importUrl, openDatabase, closeDatabase } from '../packages/core/src/index';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('normalizeSource', () => {
  it('canonicalizes a YouTube watch URL to its stable video id', () => {
    expect(normalizeSource('https://www.youtube.com/watch?v=abc123&utm_source=share')).toMatchObject({
      platform: 'youtube',
      platformId: 'abc123',
      canonicalUrl: 'https://www.youtube.com/abc123'
    });
  });

  it('accepts individual social posts and strips tracking from web URLs', () => {
    expect(normalizeSource('https://www.instagram.com/reel/ABC_123/?igshid=xyz')).toMatchObject({
      platform: 'instagram',
      platformId: 'ABC_123'
    });
    expect(normalizeSource('https://example.com/articles/one?utm_campaign=launch&keep=yes').canonicalUrl)
      .toBe('https://example.com/articles/one?keep=yes');
  });

  it('rejects unsafe destinations and non-item social URLs', () => {
    expect(() => normalizeSource('http://127.0.0.1/')).toThrow(/private destinations/i);
    expect(() => normalizeSource('https://www.youtube.com/channel/keeptrail')).toThrow(/individual YouTube/i);
    expect(rejectPrivateHostname('192.168.1.20')).toMatch(/private destinations/i);
  });

  it('does not classify lookalike domains as social platforms', () => {
    expect(normalizeSource('https://notyoutube.com/watch?v=page-1').platform).toBe('web');
    expect(normalizeSource('https://notinstagram.com/reel/ABC').platform).toBe('web');
    expect(normalizeSource('https://nottiktok.com/video/123').platform).toBe('web');
  });

  it('keeps distinct ordinary web paths distinct when platform id is null', () => {
    const directory = mkdtempSync(join(tmpdir(), 'keeptrail-normalize-'));
    const db = openDatabase(directory);
    try {
      const first = importUrl(db, 'https://example.com/library/one');
      const second = importUrl(db, 'https://example.com/library/two');
      expect(first.kind).toBe('created');
      expect(second.kind).toBe('created');
      expect(second.id).not.toBe(first.id);
    } finally {
      closeDatabase(db);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
