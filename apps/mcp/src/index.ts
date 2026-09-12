import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getItemDetail, getDataDirectory, listLibrary, openDatabase } from '@keeptrail/core';

const db = openDatabase(getDataDirectory());
const server = new McpServer({ name: 'keeptrail', version: '0.1.0' });

function text(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

server.tool('search_library', 'Search the local Keeptrail library. Read-only.', {
  query: z.string().max(600), limit: z.number().int().min(1).max(10).optional()
}, async ({ query, limit }) => {
  const result = listLibrary(db, { query, limit: limit ?? 5 });
  return text({ items: result.items.map((item) => ({ id: item.id, title: item.title, snippet: item.match?.text ?? item.summary.slice(0, 240), evidenceReferences: item.match?.evidenceId ? [item.match.evidenceId] : [] })), total: result.total, mode: result.mode });
});

server.tool('get_item', 'Get a concise Keeptrail item summary with sources. Read-only.', {
  id: z.string().uuid()
}, async ({ id }) => {
  const item = getItemDetail(db, id);
  return text(item ? { id: item.id, title: item.title, summary: item.summary, websites: item.websites, tags: item.tags, sourceUrl: item.sourceUrl } : { error: 'Item not found.' });
});

server.tool('get_passages', 'Get exact evidence passages for one Keeptrail item. Read-only.', {
  itemId: z.string().uuid(), evidenceIds: z.array(z.string().min(1)).max(5)
}, async ({ itemId, evidenceIds }) => {
  const item = getItemDetail(db, itemId);
  if (!item) return text({ error: 'Item not found.' });
  const passages = item.evidence.filter((evidence) => evidenceIds.includes(evidence.id)).map((evidence) => ({ id: evidence.id, label: evidence.label, text: evidence.excerpt ?? '', startMs: evidence.startMs, endMs: evidence.endMs }));
  return text({ itemId, passages, truncated: passages.length < evidenceIds.length });
});

server.tool('list_topics', 'List Keeptrail topics. Read-only.', {
  limit: z.number().int().min(1).max(50).optional(), cursor: z.string().optional()
}, async ({ limit }) => {
  const result = listLibrary(db, { limit: 1 });
  return text({ topics: result.topics.slice(0, limit ?? 50), nextCursor: null });
});

await server.connect(new StdioServerTransport());
