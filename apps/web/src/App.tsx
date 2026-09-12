import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  Archive, ArrowDownToLine, Check, ChevronDown, ChevronRight, CircleAlert, CircleHelp, ExternalLink,
  FileImage, FileVideo, FolderOpen, Gauge, Globe2, Link2, List, LoaderCircle, Map, Maximize2,
  MoreHorizontal, Pencil, Plus, RefreshCw, Search, Settings as SettingsIcon, SlidersHorizontal, Sparkles,
  Tag, Trash2, Upload, X, ZoomIn, ZoomOut
} from 'lucide-react';
import type { GraphResponse, ItemDetail, LibraryItem, LibraryResponse, Settings as AppSettings } from '@keeptrail/shared';

type View = 'search' | 'explore' | 'settings';

const topicLabels: Record<string, string> = {
  design: 'Design', typography: 'Typography', animation: 'Animation', development: 'Development',
  'ai-tools': 'AI tools', photography: 'Photography', learning: 'Learning', other: 'Other'
};

const platformLabels: Record<string, string> = {
  youtube: 'YouTube', instagram: 'Instagram', tiktok: 'TikTok', x: 'X', web: 'Web', local: 'Local'
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
    ...options
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function statusLabel(status: LibraryItem['status']): string {
  const labels: Record<LibraryItem['status'], string> = {
    queued: 'Queued', downloading: 'Downloading', transcribing: 'Transcribing on device', indexing: 'Indexing',
    analyzing: 'Finding useful details', ready: 'Ready', waiting_for_key: 'Waiting for key', waiting_for_quota: 'Waiting for quota',
    needs_browser_session: 'Browser session required', needs_review: 'Needs review', failed: 'Failed', paused: 'Paused', canceled: 'Canceled'
  };
  return labels[status];
}

function Logo() {
  return <a className="brand" href="#top" aria-label="Keeptrail home"><img src="/logo-mark.svg" alt="" /><span>Keeptrail</span></a>;
}

function PlatformMark({ platform }: { platform: LibraryItem['platform'] }) {
  const icon = platform === 'web' ? <Globe2 size={13} /> : platform === 'local' ? <FolderOpen size={13} /> : <span>{platformLabels[platform]?.slice(0, 1)}</span>;
  return <span className={`platform-mark platform-${platform}`} aria-hidden="true">{icon}</span>;
}

function TopicPill({ label, colorToken = 'muted' }: { label: string; colorToken?: string }) {
  return <span className={`topic-pill topic-${colorToken}`}><span className="topic-dot" aria-hidden="true" />{label}</span>;
}

function StatusPill({ status }: { status: LibraryItem['status'] }) {
  const active = !['ready', 'failed', 'canceled'].includes(status);
  return <span className={`status-pill status-${status}`}><span className={active ? 'status-pulse' : 'status-dot'} aria-hidden="true" />{statusLabel(status)}</span>;
}

function AddLinkPanel({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [urls, setUrls] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!urls.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ created: Array<{ id: string }>; rejected: Array<{ url: string; reason: string }> }>('/api/import/url', {
        method: 'POST', body: JSON.stringify({ urls })
      });
      setMessage(`${result.created.length} link${result.created.length === 1 ? '' : 's'} saved${result.rejected.length ? ` · ${result.rejected.length} rejected` : ''}.`);
      setUrls('');
      onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The links could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/import/file', { method: 'POST', body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'The file could not be imported.');
      setMessage('File saved. It will appear here when processing starts.');
      onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The file could not be saved.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return <section className={`add-link-panel ${open ? 'is-open' : ''}`} aria-label="Add a link">
    <button className="add-link-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <Plus size={17} />Add a link<ChevronDown size={15} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <form className="add-link-form" onSubmit={submit}>
      <div className="form-heading"><div><strong>Bring something worth finding again.</strong><p>Paste up to 20 video or website links, one per line.</p></div><button type="button" className="icon-button" aria-label="Close add link panel" onClick={() => setOpen(false)}><X size={17} /></button></div>
      <label className="sr-only" htmlFor="url-import">Video or website links</label>
      <textarea id="url-import" value={urls} onChange={(event) => setUrls(event.target.value)} placeholder="https://…" rows={3} />
      <div className="form-actions"><button className="button button-primary" disabled={busy || !urls.trim()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}Save links</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />Import file</button><input ref={fileRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={upload} /></div>
      {message && <p className="form-message" role="status"><CircleHelp size={15} />{message}</p>}
    </form>}
  </section>;
}

function Toolbar(props: { view: View; setView: (view: View) => void; query: string; setQuery: (query: string) => void; processingCount: number; onRefresh: () => void; onSettings: () => void; onImported: () => void }) {
  return <header className="topbar">
    <div className="topbar-main"><Logo /><nav className="mode-toggle" aria-label="Primary"><button className={props.view === 'search' ? 'active' : ''} onClick={() => props.setView('search')}><Search size={15} />Search</button><button className={props.view === 'explore' ? 'active' : ''} onClick={() => props.setView('explore')}><Map size={15} />Explore</button></nav><div className="toolbar-search"><Search size={17} /><label className="sr-only" htmlFor="library-search">Search your library</label><input id="library-search" value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search what you remember…" /><kbd>⌘ K</kbd>{props.query && <button className="search-clear" aria-label="Clear search" onClick={() => props.setQuery('')}><X size={14} /></button>}</div><div className="toolbar-actions"><AddLinkPanel onImported={props.onImported} />{props.processingCount > 0 && <button className="processing-indicator" onClick={props.onRefresh}><LoaderCircle size={15} className="spin" /><span>{props.processingCount} processing</span></button>}<button className="icon-button" aria-label="Refresh library" onClick={props.onRefresh}><RefreshCw size={17} /></button><button className="icon-button" aria-label="Open settings" onClick={props.onSettings}><SettingsIcon size={17} /></button></div></div>
    <div className="topbar-sub"><span className="breadcrumb"><span>Library</span><ChevronRight size={13} /><strong>{props.view === 'search' ? 'Search' : props.view === 'explore' ? 'Explore' : 'Settings'}</strong></span><span className="subcopy">Local discovery library · Find your way back.</span></div>
  </header>;
}

function FilterRail(props: { data: LibraryResponse | null; topic: string; setTopic: (value: string) => void; platform: string; setPlatform: (value: string) => void; tag: string; setTag: (value: string) => void; clear: () => void }) {
  const hasFilters = Boolean(props.topic || props.platform || props.tag);
  const platforms = Object.entries(props.data?.platformCounts ?? {}).filter(([, count]) => count > 0);
  return <aside className="filter-rail" aria-label="Library filters"><div className="rail-heading"><div><span className="eyebrow">Narrow by</span><h2>Filters</h2></div><button className="icon-button small" aria-label="Filter options"><SlidersHorizontal size={15} /></button></div>
    <div className="filter-section"><div className="filter-label">Topics</div>{props.data?.topics.map((item) => <button key={item.slug} className={`filter-option ${props.topic === item.slug ? 'selected' : ''}`} onClick={() => props.setTopic(props.topic === item.slug ? '' : item.slug)}><span className={`topic-dot dot-${item.colorToken}`} aria-hidden="true" /><span>{item.label}</span><span className="count">{item.itemCount}</span></button>)}</div>
    <div className="filter-section"><div className="filter-label">Platforms</div>{platforms.map(([key, count]) => <button key={key} className={`filter-option ${props.platform === key ? 'selected' : ''}`} onClick={() => props.setPlatform(props.platform === key ? '' : key)}><PlatformMark platform={key as LibraryItem['platform']} /><span>{platformLabels[key]}</span><span className="count">{count}</span></button>)}{!platforms.length && <p className="quiet-copy">Sources will appear here.</p>}</div>
    <div className="filter-section"><div className="filter-label">Tags</div>{props.data?.tags.slice(0, 8).map((item) => <button key={item.label} className={`filter-option ${props.tag === item.label ? 'selected' : ''}`} onClick={() => props.setTag(props.tag === item.label ? '' : item.label)}><Tag size={14} /><span>{item.label}</span><span className="count">{item.count}</span></button>)}{!props.data?.tags.length && <p className="quiet-copy">Tags appear as sources become ready.</p>}</div>
    {hasFilters && <button className="clear-filters" onClick={props.clear}><X size={14} />Clear filters</button>}
    <div className="rail-footer"><div className="rail-note"><Sparkles size={15} /><span>Search stays local. Cloud analysis only runs when you configure a key.</span></div></div>
  </aside>;
}

function ResultRow({ item, selected, onSelect }: { item: LibraryItem; selected: boolean; onSelect: () => void }) {
  return <button className={`result-row ${selected ? 'selected' : ''}`} onClick={onSelect} aria-current={selected ? 'true' : undefined}><div className={`result-thumb thumb-${item.platform}`}><span>{item.type === 'image' ? <FileImage size={20} /> : item.type === 'video' ? <FileVideo size={20} /> : <Globe2 size={20} />}</span>{formatDuration(item.durationMs) && <small>{formatDuration(item.durationMs)}</small>}</div><div className="result-content"><div className="result-topline"><span className="result-platform"><PlatformMark platform={item.platform} />{platformLabels[item.platform]}{item.author ? ` · ${item.author}` : ''}</span><span className="result-date">{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div><h3>{item.title || 'Untitled source'}</h3><p>{item.match?.text ?? item.summary ?? 'Saved source waiting to be processed.'}</p><div className="result-meta"><span className="tag-line">{item.topics.slice(0, 1).map((topic) => <TopicPill key={topic} label={topicLabels[topic] ?? topic} />)}{item.tags.slice(0, 3).map((tag) => <span className="tag" key={tag}>{tag}</span>)}</span>{item.websiteCount > 0 && <span className="evidence-count"><Link2 size={13} />{item.websiteCount} website{item.websiteCount === 1 ? '' : 's'}</span>}</div></div><ChevronRight className="row-chevron" size={17} /></button>;
}

function SearchResults({ data, selectedId, setSelectedId, onRetry }: { data: LibraryResponse | null; selectedId: string | null; setSelectedId: (id: string) => void; onRetry: () => void }) {
  if (!data) return <div className="loading-state"><LoaderCircle className="spin" size={24} /><span>Loading your library…</span></div>;
  if (!data.items.length) return <div className="empty-state"><div className="empty-icon"><Archive size={22} /></div><h2>Start with something worth finding again.</h2><p>Save a video, a website, or a local image. Keeptrail will keep the evidence close so you can come back to it later.</p><button className="button button-primary" onClick={() => document.querySelector<HTMLButtonElement>('.add-link-trigger')?.click()}><Plus size={16} />Add your first link</button></div>;
  return <div className="results-column"><div className="results-heading"><div><span className="eyebrow">{data.total} {data.total === 1 ? 'source' : 'sources'}</span><h1>{data.items.length === data.total ? 'Your library' : 'Search results'}</h1></div><div className="results-view-actions"><button className="icon-button small" aria-label="List view"><List size={15} /></button><button className="icon-button small" aria-label="Sort results"><ChevronDown size={15} /></button></div></div><div className="results-list" role="list">{data.items.map((item) => <ResultRow key={item.id} item={item} selected={item.id === selectedId} onSelect={() => setSelectedId(item.id)} />)}</div>{data.total > data.items.length && <button className="load-more" onClick={onRetry}>Load more</button>}</div>;
}

function DetailPanel({ item, onSaved, onExplore }: { item: ItemDetail | null; onSaved: () => void; onExplore: () => void }) {
  const [note, setNote] = useState(item?.note ?? '');
  const [tags, setTags] = useState(item?.tags.join(', ') ?? '');
  const [saving, setSaving] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setNote(item?.note ?? ''); setTags(item?.tags.join(', ') ?? ''); setMessage(null); }, [item?.id, item?.note, item?.tags]);
  if (!item) return <aside className="detail-panel detail-empty"><div className="detail-empty-art"><Link2 size={26} /></div><h2>Follow a thread</h2><p>Select a source to see its summary, evidence, captures, and notes.</p><span className="detail-hint"><span className="keycap">↵</span> Open a result</span></aside>;
  const currentItem = item;
  async function save() {
    setSaving(true); setMessage(null);
    try { await api(`/api/items/${currentItem.id}`, { method: 'PATCH', body: JSON.stringify({ note, tags: tags.split(',').map((value) => value.trim()).filter(Boolean) }) }); setMessage('Saved'); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save changes.'); }
    finally { setSaving(false); }
  }
  async function deleteOriginal() {
    if (!confirm('Remove the original file? Notes, transcript, captures, and search will stay. This cannot be undone.')) return;
    try { await api(`/api/items/${currentItem.id}/original/delete`, { method: 'POST', body: '{}' }); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The original could not be removed.'); }
  }
  return <aside className="detail-panel" aria-label="Source details"><div className="detail-topbar"><div className="detail-source-label"><PlatformMark platform={currentItem.platform} />{platformLabels[currentItem.platform]}</div><div className="detail-actions"><a className="icon-button small" href={currentItem.sourceUrl ?? '#'} target="_blank" rel="noreferrer" aria-label="Open source" onClick={(event) => { if (!currentItem.sourceUrl) event.preventDefault(); }}><ExternalLink size={15} /></a><button className="icon-button small" aria-label="More source actions"><MoreHorizontal size={16} /></button></div></div><div className="detail-scroll"><div className="detail-heading"><span className="eyebrow">{statusLabel(currentItem.status)}</span><h2>{currentItem.title}</h2><p className="detail-source-url">{currentItem.sourceUrl ?? 'Local file'} {currentItem.author ? `· ${currentItem.author}` : ''}</p></div><div className="detail-status"><StatusPill status={currentItem.status} />{currentItem.originalBytes && <span className="storage-note"><Archive size={13} />Original {formatBytes(currentItem.originalBytes)}</span>}</div><section className="detail-section"><h3>Summary</h3><p className="summary-copy">{currentItem.summary || 'A summary will appear after this source is processed.'}</p>{currentItem.keyPoints.length > 0 && <ul className="key-points">{currentItem.keyPoints.map((point) => <li key={point.text}><Check size={14} />{point.text}</li>)}</ul>}</section><section className="detail-section"><div className="section-heading"><h3>Websites <span>{currentItem.websites.length}</span></h3><button className="text-button" onClick={() => setEvidenceOpen((value) => !value)}>{evidenceOpen ? 'Hide evidence' : 'Show evidence'}<ChevronDown size={14} className={evidenceOpen ? 'rotate-180' : ''} /></button></div>{currentItem.websites.length ? <div className="website-list">{currentItem.websites.map((website) => <div className="website-row" key={website.id}><div className="website-icon"><Globe2 size={16} /></div><div className="website-text"><strong>{website.name}</strong>{website.literalUrl ? <a href={website.literalUrl} target="_blank" rel="noreferrer">{website.literalUrl}<ExternalLink size={12} /></a> : <span className="uncertain">Name only · no URL guessed</span>}</div><span className={`certainty ${website.certainty}`}>{website.confirmationStatus === 'needs_checking' ? 'Needs checking' : website.certainty}</span></div>)}</div> : <p className="quiet-copy">No websites found in this source.</p>}{evidenceOpen && currentItem.evidence.length > 0 && <div className="evidence-list">{currentItem.evidence.slice(0, 4).map((evidence) => <div className="evidence-row" key={evidence.id}><span className="evidence-kind">{evidence.kind}</span><p>{evidence.excerpt ?? evidence.label}</p>{evidence.startMs !== undefined && <button className="timestamp">{formatDuration(evidence.startMs)}</button>}</div>)}</div>}</section><section className="detail-section"><div className="section-heading"><h3>Note</h3><Pencil size={14} /></div><label className="sr-only" htmlFor="item-note">Your note</label><textarea id="item-note" className="note-editor" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Keep the detail you want to remember…" /><div className="tag-editor"><Tag size={14} /><label className="sr-only" htmlFor="item-tags">Tags</label><input id="item-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Add tags, separated by commas" /></div><div className="save-row"><button className="button button-primary" onClick={save} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} {saving ? 'Saving…' : 'Save changes'}</button>{message && <span className="save-message" role="status">{message}</span>}</div></section>{currentItem.captures.length > 0 && <section className="detail-section"><div className="section-heading"><h3>Captures <span>{currentItem.captures.length}</span></h3><button className="text-button">View all<ChevronRight size={14} /></button></div><div className="capture-grid">{currentItem.captures.slice(0, 3).map((capture) => <figure key={capture.id}><img src={capture.url} alt={capture.alt} loading="lazy" /><figcaption>{capture.label}</figcaption></figure>)}</div></section>}<section className="detail-section detail-footer-actions"><button className="button button-quiet" onClick={onExplore}><Map size={15} />Explore connections</button><a className="button button-quiet" href={`/api/items/${currentItem.id}/export.json`}><ArrowDownToLine size={15} />Export JSON</a><button className="danger-link" onClick={deleteOriginal}><Trash2 size={14} />Delete original video</button></section></div></aside>;
}

function GraphView({ selectedId, setSelectedId, topic, setTopic }: { selectedId: string | null; setSelectedId: (id: string) => void; topic: string; setTopic: (topic: string) => void }) {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pointerOrigin = useRef({ x: 0, y: 0 });
  useEffect(() => { const query = topic ? `?topic=${encodeURIComponent(topic)}${selectedId ? `&itemId=${selectedId}` : ''}` : selectedId ? `?itemId=${selectedId}` : ''; api<GraphResponse>(`/api/graph${query}`).then(setGraph).catch(() => setGraph(null)); }, [topic, selectedId]);
  function pointerDown(event: ReactPointerEvent<SVGSVGElement>) { setDragging(true); pointerOrigin.current = { x: event.clientX - offset.x, y: event.clientY - offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) { if (dragging) setOffset({ x: event.clientX - pointerOrigin.current.x, y: event.clientY - pointerOrigin.current.y }); }
  return <section className="explore-stage"><div className="explore-heading"><div><span className="eyebrow">Explore the trail</span><h1>Connections with a reason.</h1><p>Follow shared topics and explicit website mentions. Suggested similarity stays separate.</p></div><div className="explore-controls"><label className="select-control"><span className="sr-only">Filter topic routes</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">All topics</option>{Object.entries(topicLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={14} /></label><button className="icon-button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}><ZoomOut size={16} /></button><button className="icon-button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}><ZoomIn size={16} /></button><button className="icon-button" aria-label="Reset map" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><Maximize2 size={16} /></button></div></div><div className="map-wrap"><div className="map-legend"><span className="legend-title">Shown on the map</span><span><i className="legend-dot topic-sage" />Topic</span><span><i className="legend-dot legend-item" />Source</span><span><i className="legend-dot legend-website" />Website mention</span></div>{graph ? <svg className={`route-map ${dragging ? 'dragging' : ''}`} viewBox="0 0 1400 860" role="img" aria-label="Explore connections map" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}><g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>{graph.edges.map((edge) => { const from = graph.nodes.find((node) => node.id === edge.from); const to = graph.nodes.find((node) => node.id === edge.to); if (!from || !to) return null; return <path key={edge.id} d={`M ${from.x} ${from.y} C ${from.x + 80} ${from.y}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`} className={`map-edge edge-${edge.kind}`} />; })}{graph.nodes.map((node) => node.kind === 'topic' ? <g key={node.id} className={`map-node map-topic-node ${node.selected ? 'selected' : ''}`} transform={`translate(${node.x} ${node.y})`}><circle r="13" className={`node-route route-${node.colorToken}`} /><circle r="4" className="node-core" /><text x="25" y="-3">{node.label}</text><text x="25" y="16" className="node-subtitle">Topic route</text></g> : <g key={node.id} className={`map-node ${node.selected ? 'selected' : ''}`} transform={`translate(${node.x} ${node.y})`} tabIndex={0} role="button" aria-label={`Open ${node.label}`} onClick={() => node.itemId && setSelectedId(node.itemId)} onKeyDown={(event) => { if (event.key === 'Enter' && node.itemId) setSelectedId(node.itemId); }}><circle r={node.kind === 'website' ? 7 : 9} className={`node-station station-${node.kind}`} /><text x="16" y="-2">{node.label}</text>{node.subtitle && <text x="16" y="16" className="node-subtitle">{node.subtitle}</text>}</g>)}</g></svg> : <div className="map-loading"><LoaderCircle className="spin" size={24} />Building your map…</div>}</div><div className="map-list"><div className="map-list-heading"><div><span className="eyebrow">Keyboard alternative</span><h2>Sources on this route</h2></div><List size={17} /></div>{graph?.nodes.filter((node) => node.kind !== 'topic').slice(0, 12).map((node) => <button key={node.id} className="map-list-row" onClick={() => node.itemId && setSelectedId(node.itemId)}><span className={`list-node node-${node.kind}`} /><span><strong>{node.label}</strong><small>{node.subtitle}</small></span><ChevronRight size={15} /></button>)}{graph && !graph.nodes.some((node) => node.kind !== 'topic') && <p className="quiet-copy">Add a few sources to see their connections here.</p>}</div></section>;
}

const providerFallbacks = [
  { id: 'groq', name: 'Groq', model: 'groq/qwen/qwen3.6-27b', keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/vision', freeSummary: 'Free Qwen 3.6 vision tier: 30 RPM, 1,000 requests/day, 8,000 TPM, and 200,000 TPD.', supportsVision: true },
  { id: 'openrouter', name: 'OpenRouter Free', model: 'openrouter/openrouter/free', keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground', freeSummary: 'Free router for text and images. Without purchased credits, OpenRouter documents 50 free-model requests/day.', supportsVision: true },
  { id: 'mistral', name: 'Mistral Free', model: 'mistral/mistral-small-latest', keyUrl: 'https://console.mistral.ai/api-keys', docsUrl: 'https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key', freeSummary: 'Mistral Studio Free mode needs no credit card. Mistral Small accepts text and images; limits apply.', supportsVision: true },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini/gemini-2.5-flash-lite', keyUrl: 'https://aistudio.google.com/api-keys', docsUrl: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite', freeSummary: 'Google AI Studio Developer API free tier when billing is disabled.', supportsVision: true }
] as const;

function SettingsView({ settings, onSaved }: { settings: AppSettings | null; onSaved: () => void }) {
  const [key, setKey] = useState('');
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [provider, setProvider] = useState(settings?.provider ?? 'groq');
  useEffect(() => { if (settings?.provider) setProvider(settings.provider); }, [settings?.provider]);
  const providerInfo = settings?.providers?.find((entry) => entry.id === provider) ?? providerFallbacks.find((entry) => entry.id === provider) ?? providerFallbacks[0];
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try { await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ provider, apiKey: key || undefined, billingAcknowledged: provider === 'gemini' ? ack : undefined }) }); setKey(''); setMessage('Provider settings saved.'); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setSaving(false); }
  }
  async function changeProvider(value: string) {
    if (!providerFallbacks.some((entry) => entry.id === value)) return;
    setProvider(value as typeof provider);
    try { await api('/api/settings', { method: 'PATCH', body: JSON.stringify({ provider: value }) }); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The provider could not be selected.'); }
  }
  async function setBrowserSetting(value: { browserSessionEnabled?: boolean; browserName?: 'chrome' | 'firefox' }) { await api('/api/settings', { method: 'PATCH', body: JSON.stringify(value) }); onSaved(); }
  return <section className="settings-view"><div className="settings-heading"><div><span className="eyebrow">Keeptrail / Settings</span><h1>Keep your setup clear.</h1><p>Local storage and transcription stay on this Mac. Selected text and captures leave it only when you configure a cloud provider.</p></div><Gauge size={29} /></div><form onSubmit={save} className="settings-grid"><section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Sparkles size={17} /></div><div><h2>Provider health</h2><p>Choose a free vision-capable provider. The key is stored locally and never shown again.</p></div></div><label htmlFor="provider-select">AI provider</label><select id="provider-select" className="provider-select" value={provider} onChange={(event) => { void changeProvider(event.target.value); }}>{(settings?.providers ?? providerFallbacks).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select><p className="settings-note">{providerInfo.freeSummary} <a href={providerInfo.docsUrl} target="_blank" rel="noreferrer">Provider details</a></p><label htmlFor="provider-key">{providerInfo.name} API key</label><div className="key-input"><input id="provider-key" type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={settings?.hasProviderKey ? 'Configured · enter a new key to replace' : `Paste a key from ${providerInfo.name}`} autoComplete="new-password" /><span>{settings?.hasProviderKey ? 'Configured' : 'Not configured'}</span></div>{provider === 'gemini' && <><label className="check-row"><input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} /><span>This key belongs to a Google AI Studio project without billing enabled.</span></label><p className="settings-note">Keeptrail cannot verify billing state from a pasted key. Free-tier handling follows Google’s terms.</p></>}<button className="button button-primary" disabled={saving || (!key && !settings?.hasProviderKey)}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />} Save provider</button><p className="settings-note"><a href={providerInfo.keyUrl} target="_blank" rel="noreferrer">Create or manage this API key</a></p></section><section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><FolderOpen size={17} /></div><div><h2>Storage and processing</h2><p>Durable local files, resumable jobs, and a conservative cloud cap.</p></div></div><div className="setting-row"><span>Data directory</span><code>{settings?.dataDirectory ?? 'Loading…'}</code></div><div className="setting-row"><span>Cloud calls today</span><strong>{settings?.cloudCallsToday ?? 0} / {settings?.dailyCloudCap ?? 30}</strong></div><div className="setting-row"><span>Selected model</span><strong>{settings?.model ?? providerInfo.model}</strong></div><p className="settings-note">The daily cap can be lowered below 30. Keeptrail never silently switches to a paid provider.</p><button type="button" className="button button-quiet" onClick={onSaved}><Archive size={15} />Review storage</button></section><section className="settings-card"><div className="settings-card-heading"><div className="settings-icon"><Globe2 size={17} /></div><div><h2>Browser session</h2><p>Optional, off by default. Use only for sources that need an explicit session.</p></div></div><label className="check-row"><input type="checkbox" checked={settings?.browserSessionEnabled ?? false} onChange={(event) => { void setBrowserSetting({ browserSessionEnabled: event.target.checked }); }} /><span>Allow browser session access when a source asks for it</span></label><div className="browser-choice"><button type="button" className={settings?.browserName === 'chrome' ? 'selected' : ''} onClick={() => { void setBrowserSetting({ browserName: 'chrome' }); }}>Chrome</button><button type="button" className={settings?.browserName === 'firefox' ? 'selected' : ''} onClick={() => { void setBrowserSetting({ browserName: 'firefox' }); }}>Firefox</button></div></section></form>{message && <p className="settings-message" role="status"><Check size={15} />{message}</p>}</section>;
}

export function App() {
  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [platform, setPlatform] = useState('');
  const [tag, setTag] = useState('');
  const [data, setData] = useState<LibraryResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const filters = useMemo(() => new URLSearchParams({ ...(query ? { q: query } : {}), ...(topic ? { topic } : {}), ...(platform ? { platform } : {}), ...(tag ? { tag } : {}) }).toString(), [query, topic, platform, tag]);
  async function loadLibrary() {
    try { const result = await api<LibraryResponse>(`/api/library${filters ? `?${filters}` : ''}`); setData(result); setError(null); if (!selectedId && result.items[0]) setSelectedId(result.items[0].id); if (selectedId && !result.items.some((item) => item.id === selectedId) && result.items[0]) setSelectedId(result.items[0].id); }
    catch (err) { setError(err instanceof Error ? err.message : 'Keeptrail could not reach its local API.'); setData(null); }
  }
  async function loadSettings() { try { setSettings(await api<AppSettings>('/api/settings')); } catch { setSettings(null); } }
  function refresh() { void loadLibrary(); void loadSettings(); if (selectedId) void api<ItemDetail>(`/api/items/${selectedId}`).then(setDetail).catch(() => undefined); }
  useEffect(() => { if (debounceRef.current) window.clearTimeout(debounceRef.current); debounceRef.current = window.setTimeout(() => { void loadLibrary(); }, 250); return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); }; }, [filters]);
  useEffect(() => { if (!selectedId) { setDetail(null); return; } void api<ItemDetail>(`/api/items/${selectedId}`).then(setDetail).catch(() => setDetail(null)); }, [selectedId, data]);
  useEffect(() => { void loadSettings(); }, []);
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('library-search')?.focus();
      }
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);
  return <div id="top" className="app-shell"><a className="skip-link" href="#main-content">Skip to main content</a><Toolbar view={view} setView={setView} query={query} setQuery={setQuery} processingCount={data?.processingCount ?? 0} onRefresh={refresh} onSettings={() => setView('settings')} onImported={refresh} />{error && <div className="global-error" role="alert"><CircleAlert size={16} /><span>{error}</span><button onClick={refresh}><RefreshCw size={14} />Retry</button></div>}<main id="main-content" className={view === 'search' ? 'main-content search-layout' : 'main-content'}>{view === 'search' && <><FilterRail data={data} topic={topic} setTopic={setTopic} platform={platform} setPlatform={setPlatform} tag={tag} setTag={setTag} clear={() => { setTopic(''); setPlatform(''); setTag(''); }} /><SearchResults data={data} selectedId={selectedId} setSelectedId={setSelectedId} onRetry={refresh} /><DetailPanel item={detail} onSaved={refresh} onExplore={() => setView('explore')} /></>}{view === 'explore' && <GraphView selectedId={selectedId} setSelectedId={setSelectedId} topic={topic} setTopic={setTopic} />}{view === 'settings' && <SettingsView settings={settings} onSaved={() => { refresh(); setView('settings'); }} />}</main><footer className="app-footer"><span>Keeptrail · local discovery library</span><span>Selected text and captures only leave this Mac when you configure analysis.</span><a href="https://github.com/ultrararebinary/keeptrail" target="_blank" rel="noreferrer">View source <ExternalLink size={12} /></a></footer></div>;
}
