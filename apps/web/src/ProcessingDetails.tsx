import { useEffect, useState } from 'react';

type Report = {
  itemId: string; status: string; errorCode: string | null; explanation: string | null; retryable: boolean;
  counts: { assets: number; transcripts: number; evidence: number; analyses: number };
  jobs: Array<{ id: string; stage: string; status: string; attempt_count: number }>;
};

function csrfHeaders(): HeadersInit {
  const headers = new Headers();
  const csrf = document.cookie.match(/(?:^|; )keeptrail_csrf=([^;]+)/)?.[1];
  if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));
  return headers;
}

export function ProcessingDetails({ id, status, onRetry }: { id: string; status: string; onRetry: () => void }) {
  const [report, setReport] = useState<Report | null>(null); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { let disposed = false; setReport(null); setMessage(''); fetch(`/api/items/${id}/diagnostics`).then(async (response) => { if (!response.ok) throw new Error(`Diagnostics unavailable (${response.status}).`); return response.json() as Promise<Report>; }).then((value) => { if (!disposed) setReport(value); }).catch((error: Error) => { if (!disposed) setMessage(error.message); }); return () => { disposed = true; }; }, [id, status]);
  async function post(path: string): Promise<void> { const response = await fetch(path, { method: 'POST', headers: csrfHeaders() }); if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error ?? `Request failed (${response.status}).`); } }
  async function retry() { setBusy(true); setMessage(''); try { await post(`/api/items/${id}/retry`); setMessage('Retry queued. Processing status will update automatically.'); onRetry(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Retry failed.'); } finally { setBusy(false); } }
  async function changeState(action: 'pause' | 'resume' | 'cancel') { if (action === 'cancel' && !confirm('Cancel processing for this source?')) return; setBusy(true); setMessage(''); try { await post(`/api/items/${id}/${action}`); setMessage(action === 'cancel' ? 'Processing canceled.' : `Processing ${action}d.`); onRetry(); } catch (error) { setMessage(error instanceof Error ? error.message : `Could not ${action} processing.`); } finally { setBusy(false); } }
  const active = ['queued', 'downloading', 'transcribing', 'indexing', 'analyzing', 'waiting_for_quota'].includes(status); const paused = status === 'paused';
  return <section className="detail-section" aria-label="Processing diagnostics"><h3>Processing</h3>{report?.explanation && <p role="status">{report.explanation}</p>}{report && <details><summary>Technical details</summary><p>Source ID: <code>{id}</code></p>{report.errorCode && <p>Error: <code>{report.errorCode}</code></p>}<p>{report.counts.assets} assets · {report.counts.transcripts} transcript segments · {report.counts.evidence} analysis records</p><ol>{report.jobs.map((job) => <li key={job.id}>{job.stage}: {job.status} · attempt {job.attempt_count}</li>)}</ol><a href={`/api/items/${id}/diagnostics`} target="_blank" rel="noreferrer">Open safe debug report</a><p>Report excludes keys, cookies, source text and local paths.</p></details>}{report?.retryable && <button className="button button-quiet" disabled={busy} onClick={() => { void retry(); }}>{busy ? 'Working…' : 'Retry processing'}</button>}{active && <button className="button button-quiet" disabled={busy} onClick={() => { void changeState('pause'); }}>Pause</button>}{paused && <button className="button button-quiet" disabled={busy} onClick={() => { void changeState('resume'); }}>Resume</button>}{active && <button className="danger-link" disabled={busy} onClick={() => { void changeState('cancel'); }}>Cancel processing</button>}{message && <p role="status">{message}</p>}</section>;
}
