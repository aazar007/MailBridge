'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { AppLogo } from '@/components/app-logo';
import { TransitionLink } from '@/components/transition-link';
import { GmailLogo, OutlookLogo, ICloudLogo, YahooLogo } from '@/lib/logos';

type Provider = 'gmail' | 'outlook' | 'icloud' | 'yahoo';

interface Draft {
  id: string;
  subject: string;
  date: string;
}

interface DraftContent {
  subject: string;
  body: string;
}

// ─── Small shared UI ──────────────────────────────────────────────────────────

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="bg-gray-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200">
      {children}
    </code>
  );
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap"
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}

// ─── Generic DraftList (works for Gmail and Outlook) ──────────────────────────

function DraftList({ drafts, apiBase, logoutUrl }: {
  drafts: Draft[];
  apiBase: string;
  logoutUrl: string;
}) {
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<(DraftContent & { id: string }) | null>(null);
  const [error, setError] = useState('');

  const filtered = drafts.filter(
    (d) => d.subject.toLowerCase().includes(search.toLowerCase()) || d.id.includes(search)
  );

  async function loadDraft(id: string) {
    setLoadingId(id);
    setError('');
    try {
      const res = await fetch(`${apiBase}/${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSelected({ ...data, id });
    } catch (e) {
      setError(`Failed to load draft: ${e}`);
    } finally {
      setLoadingId(null);
    }
  }

  function useInTemplate() {
    if (!selected) return;
    localStorage.setItem('pendingDraft', JSON.stringify({ subject: selected.subject, body: selected.body }));
    window.location.href = '/main';
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          placeholder="Search by subject or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <a
          href={logoutUrl}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-500 hover:border-red-300 hover:text-red-600 transition-colors whitespace-nowrap"
        >
          Disconnect
        </a>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">
            {filtered.length} draft{filtered.length !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
          </p>
          <p className="text-xs text-gray-400">Click a draft to preview and load it</p>
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">No drafts found.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((d) => (
              <div
                key={d.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors cursor-pointer
                  ${selected?.id === d.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                onClick={() => loadDraft(d.id)}
              >
                <div className="flex-1 min-w-0">
                  <p dir="auto" className="text-sm font-medium text-gray-800 truncate">{d.subject}</p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{d.id}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                  <CopyBtn text={d.id} label="Copy ID" />
                  <button
                    onClick={() => loadDraft(d.id)}
                    disabled={loadingId === d.id}
                    className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {loadingId === d.id ? '…' : 'Load'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">Subject</p>
              <p dir="auto" className="text-sm font-semibold text-gray-800 truncate">{selected.subject || '(no subject)'}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <CopyBtn text={selected.id} label="Copy ID" />
              <CopyBtn text={selected.subject} label="Copy subject" />
              <CopyBtn text={selected.body} label="Copy HTML" />
              <button
                onClick={useInTemplate}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition-colors"
              >
                Use in template →
              </button>
            </div>
          </div>
          <div className="p-1 bg-white">
            {selected.body ? (
              <iframe
                srcDoc={`<div dir="auto" style="font-family:sans-serif;padding:16px;line-height:1.6">${selected.body}</div>`}
                className="w-full border-0 rounded"
                style={{ minHeight: 200 }}
                sandbox="allow-same-origin"
                onLoad={(e) => {
                  const f = e.target as HTMLIFrameElement;
                  if (f.contentDocument?.body)
                    f.style.height = `${f.contentDocument.body.scrollHeight + 24}px`;
                }}
              />
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Draft body is empty.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Not-connected screens ────────────────────────────────────────────────────

function GmailNotConnected({ errorMsg }: { errorMsg: string }) {
  const missingEnv = errorMsg.includes('GOOGLE_CLIENT_ID') || errorMsg.includes('client_id');

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
      <div className="flex justify-center">
        <div className="flex items-center justify-center rounded-xl" style={{ width: 56, height: 56, backgroundColor: '#EA4335' }}>
          <GmailLogo size={28} />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">Connect your Gmail</h2>
      {missingEnv ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-left text-sm text-amber-900 space-y-3">
          <p className="font-semibold">One-time setup required</p>
          <p>Create a <Code>.env.local</Code> file with your Google OAuth credentials.</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{errorMsg}</div>
      ) : null}
      <a
        href="/api/auth/google"
        className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-colors shadow-sm"
      >
        <GmailLogo size={20} />
        Sign in with Google
      </a>
    </div>
  );
}

function OutlookNotConnected({ errorMsg }: { errorMsg: string }) {
  const missingEnv = errorMsg.includes('MICROSOFT_CLIENT_ID');

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
      <div className="flex justify-center">
        <div className="flex items-center justify-center rounded-xl" style={{ width: 56, height: 56, backgroundColor: '#0078D4' }}>
          <OutlookLogo size={28} />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">Connect your Outlook</h2>
      {missingEnv ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-left text-sm text-amber-900 space-y-3">
          <p className="font-semibold">One-time setup required</p>
          <p>Add Microsoft OAuth credentials to your environment variables.</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{errorMsg}</div>
      ) : (
        <p className="text-gray-500 text-sm">Sign in to allow sending mail from your Outlook account:</p>
      )}
      <a
        href="/api/auth/microsoft"
        className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:border-blue-400 hover:text-blue-700 transition-colors shadow-sm"
      >
        <OutlookLogo size={20} />
        Sign in with Microsoft
      </a>
    </div>
  );
}

function NotSupportedSection({ provider }: { provider: 'icloud' | 'yahoo' }) {
  const name = provider === 'icloud' ? 'iCloud Mail' : 'Yahoo Mail';
  const Logo = provider === 'icloud' ? ICloudLogo : YahooLogo;
  const color = provider === 'icloud' ? '#555555' : '#6001D2';
  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
      <div className="flex justify-center">
        <div className="flex items-center justify-center rounded-xl" style={{ width: 56, height: 56, backgroundColor: color }}>
          <Logo size={28} />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-900">{name} drafts</h2>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-700 space-y-3 text-left">
        <p className="font-semibold text-gray-800">Not available</p>
        <p>
          {name} does not provide a public API for reading drafts. Draft browsing is only
          supported for <strong>Gmail</strong> and <strong>Outlook</strong>.
        </p>
        <p>To use a {name} draft as a template, open the draft in your mail client, copy the subject and body, then paste them into the <strong>Template</strong> step in the app.</p>
      </div>
      <Link
        href="/main"
        className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm"
      >
        ← Back to MailBridge
      </Link>
    </div>
  );
}

// ─── Per-provider sections ────────────────────────────────────────────────────

function GmailSection() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError && params.get('provider') !== 'outlook') setErrorMsg(urlError.replace(/_/g, ' '));

    fetch('/api/drafts')
      .then(async (res) => {
        if (res.status === 401) { setStatus('disconnected'); return; }
        const data = await res.json();
        if (data.error) { setErrorMsg(data.error); setStatus('disconnected'); return; }
        setDrafts(data.drafts);
        setStatus('connected');
      })
      .catch((e) => { setErrorMsg(String(e)); setStatus('disconnected'); });
  }, []);

  if (status === 'loading') return <LoadingSpinner label="Connecting to Gmail…" />;
  if (status === 'disconnected') return <GmailNotConnected errorMsg={errorMsg} />;
  return <DraftList drafts={drafts} apiBase="/api/drafts" logoutUrl="/api/auth/logout" />;
}

function OutlookSection() {
  const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError && params.get('provider') === 'outlook') setErrorMsg(urlError);

    fetch('/api/drafts/outlook')
      .then(async (res) => {
        if (res.status === 401) { setStatus('disconnected'); return; }
        const data = await res.json();
        if (data.error) { setErrorMsg(data.error); setStatus('disconnected'); return; }
        setDrafts(data.drafts);
        setStatus('connected');
      })
      .catch((e) => { setErrorMsg(String(e)); setStatus('disconnected'); });
  }, []);

  if (status === 'loading') return <LoadingSpinner label="Connecting to Outlook…" />;
  if (status === 'disconnected') return <OutlookNotConnected errorMsg={errorMsg} />;
  return <DraftList drafts={drafts} apiBase="/api/drafts/outlook" logoutUrl="/api/auth/microsoft/logout" />;
}

function LoadingSpinner({ label }: { label: string }) {
  return (
    <div className="text-center py-24 text-gray-400">
      <p className="text-sm">{label}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS: { id: Provider; label: string; Logo: typeof GmailLogo; color: string }[] = [
  { id: 'gmail',   label: 'Gmail',   Logo: GmailLogo,   color: '#EA4335' },
  { id: 'outlook', label: 'Outlook', Logo: OutlookLogo, color: '#0078D4' },
  { id: 'icloud',  label: 'iCloud',  Logo: ICloudLogo,  color: '#555555' },
  { id: 'yahoo',   label: 'Yahoo',   Logo: YahooLogo,   color: '#6001D2' },
];

export default function DraftIdPage() {
  const [provider, setProvider] = useState<Provider>('gmail');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('provider') as Provider | null;
    if (p && TABS.some((t) => t.id === p)) setProvider(p);
  }, []);

  function switchTab(p: Provider) {
    setProvider(p);
    const url = new URL(window.location.href);
    url.searchParams.set('provider', p);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.toString());
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 shadow-sm flex items-center gap-4">
        <TransitionLink href="/main" className="text-blue-600 hover:text-blue-800 text-sm font-medium">← Back to app</TransitionLink>
        <AppLogo size={32} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Email Drafts</h1>
          <p className="text-gray-400 text-xs mt-0.5">Browse drafts, copy IDs, load into template</p>
        </div>
      </header>

      {/* Provider tabs */}
      <div className="bg-white border-b px-6">
        <div className="max-w-3xl mx-auto flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors
                ${provider === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800'}`}
            >
              <span className="flex items-center justify-center rounded" style={{ width: 22, height: 22, backgroundColor: tab.color }}>
                <tab.Logo size={14} />
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {provider === 'gmail'   && <GmailSection />}
        {provider === 'outlook' && <OutlookSection />}
        {(provider === 'icloud' || provider === 'yahoo') && <NotSupportedSection provider={provider} />}
      </div>
    </main>
  );
}
