import { z } from 'zod';

export const ItemStatus = z.enum([
  'queued', 'downloading', 'transcribing', 'analyzing', 'indexing', 'ready',
  'waiting_for_key', 'waiting_for_quota', 'needs_browser_session', 'needs_review',
  'failed', 'paused', 'canceled'
]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const ItemType = z.enum(['video', 'image', 'page']);
export type ItemType = z.infer<typeof ItemType>;

export const Platform = z.enum(['youtube', 'instagram', 'tiktok', 'x', 'web', 'local']);
export type Platform = z.infer<typeof Platform>;

export const EvidenceRef = z.object({
  id: z.string().min(1).max(120),
  kind: z.enum(['description', 'transcript', 'capture', 'page']),
  label: z.string().max(180),
  excerpt: z.string().max(600).optional(),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional()
}).strict();
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const WebsiteMention = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  literalUrl: z.string().url().max(2048).nullable(),
  description: z.string().max(300),
  certainty: z.enum(['explicit', 'uncertain']),
  confirmationStatus: z.enum(['confirmed', 'needs_checking']).default('confirmed'),
  evidenceIds: z.array(z.string().min(1)).min(1).max(8)
}).strict();
export type WebsiteMention = z.infer<typeof WebsiteMention>;

export const Topic = z.object({
  slug: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  colorToken: z.enum(['sage', 'ochre', 'lilac', 'coral', 'blue', 'moss', 'plum', 'muted']),
  itemCount: z.number().int().nonnegative()
}).strict();
export type Topic = z.infer<typeof Topic>;

export const SearchSnippet = z.object({
  text: z.string().max(500),
  evidenceId: z.string().max(120).optional(),
  startMs: z.number().int().nonnegative().optional()
}).strict();

export const LibraryItem = z.object({
  id: z.string().uuid(),
  type: ItemType,
  platform: Platform,
  sourceUrl: z.string().url().nullable(),
  platformId: z.string().nullable(),
  title: z.string().max(160),
  author: z.string().max(160).nullable(),
  summary: z.string().max(600),
  status: ItemStatus,
  createdAt: z.string(),
  publishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  thumbnailAssetId: z.string().uuid().nullable(),
  topics: z.array(z.string().max(80)).max(3),
  tags: z.array(z.string().max(60)).max(8),
  match: SearchSnippet.nullable(),
  websiteCount: z.number().int().nonnegative(),
  originalBytes: z.number().int().nonnegative().nullable()
}).strict();
export type LibraryItem = z.infer<typeof LibraryItem>;

export const ItemDetail = LibraryItem.extend({
  keyPoints: z.array(z.object({ text: z.string().max(500), evidenceIds: z.array(z.string()).min(1).max(8) }).strict()).max(8),
  websites: z.array(WebsiteMention).max(20),
  evidence: z.array(EvidenceRef).max(80),
  note: z.string().max(12000),
  transcript: z.array(z.object({
    id: z.string(), text: z.string().max(1000), startMs: z.number().int().nonnegative(), endMs: z.number().int().nonnegative()
  }).strict()).max(500),
  captures: z.array(z.object({
    id: z.string().uuid(),
    url: z.string(),
    label: z.string().max(180),
    timestampMs: z.number().int().nonnegative().nullable(),
    alt: z.string().max(300),
    descriptors: z.object({ subject: z.array(z.string().max(60)).max(5), style: z.array(z.string().max(60)).max(5), layout: z.array(z.string().max(60)).max(5) }).strict()
  }).strict()).max(32),
  collections: z.array(z.object({ id: z.string().uuid(), name: z.string().max(120) }).strict()).max(30)
}).strict();
export type ItemDetail = z.infer<typeof ItemDetail>;

export const LibraryResponse = z.object({
  items: z.array(LibraryItem),
  total: z.number().int().nonnegative(),
  mode: z.enum(['hybrid', 'keyword']),
  topics: z.array(Topic),
  tags: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative() }).strict()).max(100),
  platformCounts: z.record(Platform, z.number().int().nonnegative()),
  processingCount: z.number().int().nonnegative()
}).strict();
export type LibraryResponse = z.infer<typeof LibraryResponse>;

export const GraphNode = z.object({
  id: z.string(),
  kind: z.enum(['topic', 'item', 'website']),
  label: z.string().max(160),
  subtitle: z.string().max(200).optional(),
  colorToken: Topic.shape.colorToken.optional(),
  itemId: z.string().uuid().optional(),
  x: z.number(),
  y: z.number(),
  selected: z.boolean().default(false)
}).strict();
export const GraphEdge = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(['topic', 'website']),
  label: z.string().max(120).optional(),
  colorToken: Topic.shape.colorToken.optional()
}).strict();
export const GraphResponse = z.object({
  nodes: z.array(GraphNode).max(80),
  edges: z.array(GraphEdge).max(120),
  topic: z.string().nullable(),
  visibleCount: z.number().int().nonnegative(),
  hasMore: z.boolean()
}).strict();
export type GraphResponse = z.infer<typeof GraphResponse>;

export const ImportUrlsRequest = z.object({
  urls: z.string().min(1).max(40000)
}).strict();

export const ImportResponse = z.object({
  created: z.array(z.object({ id: z.string().uuid(), url: z.string().url(), status: ItemStatus }).strict()),
  existing: z.array(z.object({ id: z.string().uuid(), url: z.string().url(), status: ItemStatus }).strict()),
  rejected: z.array(z.object({ url: z.string().max(2048), reason: z.string().max(240) }).strict())
}).strict();
export type ImportResponse = z.infer<typeof ImportResponse>;

export const UpdateItemRequest = z.object({
  note: z.string().max(12000).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(8).optional(),
  collectionIds: z.array(z.string().uuid()).max(30).optional()
}).strict();

export const ProviderId = z.enum(['groq', 'openrouter', 'mistral', 'gemini']);
export type ProviderId = z.infer<typeof ProviderId>;

export const ProviderDescriptor = z.object({
  id: ProviderId,
  name: z.string().max(80),
  model: z.string().max(160),
  keyUrl: z.string().url(),
  docsUrl: z.string().url(),
  freeSummary: z.string().max(500),
  supportsVision: z.literal(true)
}).strict();
export type ProviderDescriptor = z.infer<typeof ProviderDescriptor>;

export const Settings = z.object({
  provider: ProviderId,
  providerName: z.string().max(80),
  hasProviderKey: z.boolean(),
  keyUrl: z.string().url(),
  docsUrl: z.string().url(),
  freeSummary: z.string().max(500),
  supportsVision: z.literal(true),
  providers: z.array(ProviderDescriptor).min(1),
  // Kept for compatibility with clients built against the original MVP shell.
  hasGeminiKey: z.boolean(),
  browserSessionEnabled: z.boolean(),
  browserName: z.enum(['chrome', 'firefox']).nullable(),
  dailyCloudCap: z.number().int().min(1).max(30),
  cloudCallsToday: z.number().int().nonnegative(),
  processingPaused: z.boolean(),
  dataDirectory: z.string(),
  gatewayStatus: z.enum(['not_configured', 'healthy', 'unavailable']),
  model: z.string().max(160)
}).strict();
export type Settings = z.infer<typeof Settings>;

export const Health = z.object({
  ok: z.boolean(),
  version: z.string(),
  node: z.string(),
  dataDirectory: z.string(),
  database: z.enum(['ok', 'error']),
  worker: z.enum(['online', 'offline']),
  gateway: z.enum(['configured', 'not_configured', 'unavailable'])
}).strict();
