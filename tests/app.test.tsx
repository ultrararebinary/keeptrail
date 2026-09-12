// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../apps/web/src/App';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('Keeptrail app shell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes('/api/library')) return Promise.resolve(jsonResponse({
        items: [], total: 0, mode: 'keyword', topics: [], tags: [],
        platformCounts: { youtube: 0, instagram: 0, tiktok: 0, x: 0, web: 0, local: 0 }, processingCount: 0
      }));
      if (path.includes('/api/settings')) return Promise.resolve(jsonResponse({
        hasGeminiKey: false, dataDirectory: '/tmp/keeptrail', cloudCallsToday: 0,
        dailyCloudCap: 30, model: 'gemini-2.5-flash-lite', browserSessionEnabled: false, browserName: 'chrome'
      }));
      return Promise.resolve(jsonResponse({}));
    }));
  });

  it('renders a local-first empty state with an accessible add-link entry point', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Start with something worth finding again.')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /add a link/i })).toBeInTheDocument();
    expect(screen.getByText(/Search stays local/)).toBeInTheDocument();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    expect(screen.getByLabelText('Search your library')).toHaveFocus();
  });
});
