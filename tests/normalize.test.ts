import { describe, expect, it } from 'vitest';
import { normalizeSource, rejectPrivateHostname } from '../packages/core/src/normalize';

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
});
