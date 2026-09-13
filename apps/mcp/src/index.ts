import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { capabilities, getItemDetail, getDataDirectory, itemDiagnostics, listLibrary, openReadOnlyDatabase } from '@keeptrail/core';

const db = openReadOnlyDatabase(getDataDirectory());
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
}, async ({ limit, cursor }) => {
  const pageLimit = limit ?? 50;
  const offset = cursor ? Number(Buffer.from(cursor, 'base64url').toString('utf8')) : 0;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;
  const rows = db.prepare('SELECT slug,label,color_token AS colorToken,(SELECT COUNT(*) FROM item_topics it WHERE it.topic_slug=t.slug) AS itemCount FROM topics t ORDER BY display_order LIMIT ? OFFSET ?').all(pageLimit + 1, safeOffset) as Array<{ slug: string; label: string; colorToken: string; itemCount: number }>;
  const hasMore = rows.length > pageLimit;
  return text({ topics: rows.slice(0, pageLimit), nextCursor: hasMore ? Buffer.from(String(safeOffset + pageLimit)).toString('base64url') : null });
});

server.tool('get_processing_status', 'Get bounded processing status for one item. Read-only.', {
  itemId: z.string().uuid()
}, async ({ itemId }) => {
  const report = itemDiagnostics(db, itemId);
  return text(report ? { itemId: report.itemId, status: report.status, errorCode: report.errorCode, retryable: report.retryable, counts: report.counts, jobs: report.jobs } : { error: 'Item not found.' });
});

server.tool('get_capabilities', 'Get Keeptrail capability and prerequisite status. Read-only.', {}, async () => text({ capabilities }));

await server.connect(new StdioServerTransport());
