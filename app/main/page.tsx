'use client';

import { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Send, ChevronLeft, ChevronRight, CheckCircle, Calendar, Zap, Loader2 } from 'lucide-react';
import { PaperPlaneLoader } from '@/components/paper-plane-loader';
import { AppLogo } from '@/components/app-logo';
import { TransitionLink } from '@/components/transition-link';
import { CampaignStepper } from '@/components/campaign-stepper';
import {
  FigmaSmtpStep,
  validateSmtpStep,
  isGmailProvider,
  isOutlookProvider,
  PRESETS,
  ProviderLogo,
  type SmtpConfig,
} from '@/components/campaign/smtp-step';
import { FigmaDraftStep, validateDraftStep } from '@/components/campaign/draft-step';
import { FigmaRecipientsStep, validateRecipientsStep, fetchPreviews } from '@/components/campaign/recipients-step';
import { FigmaPreviewStep } from '@/components/campaign/preview-step';
import {
  inputCls,
  Field,
  Card,
  Notice,
  ErrorMsg,
  Btn,
  SelectCard,
  SectionLabel,
} from '@/components/mail-ui';
import type { EmailAttachment, SendPayload } from '@/lib/send-types';
import { buildAttachmentMap } from '@/lib/attachments';
import { createId } from '@/lib/id';
import {
  cancelScheduledJob,
  createScheduledJob,
  fetchScheduledJob,
  fetchScheduledJobs,
  updateScheduledJobTime,
  type PublicScheduledJob,
} from '@/lib/schedule-api';
import { formatScheduleTime } from '@/lib/schedule';
import {
  combineDateAndTime,
  toDateInputValue,
  toTimeInputValue,
  todayDateInputValue,
} from '@/lib/datetime';
import {
  deleteWorkSessionRemote,
  fetchWorkSession,
  getOrCreateSessionId,
  saveWorkSessionRemote,
  clearSessionId,
} from '@/lib/session-api';
import { clearAllAttachmentCache } from '@/lib/attachment-cache';

// ─── Types ────────────────────────────────────────────────────────────────────


interface Template {
  subject: string;
  body: string;
  signature?: string;
}

interface Recipient {
  email: string;
  [key: string]: string;
}

interface Preview {
  to: string;
  toName: string;
  subject: string;
  body: string;
}

// ─── Step 5: Send ─────────────────────────────────────────────────────────────

function SendStep({
  smtpConfig,
  template,
  recipients,
  useOutlookGraph,
  useGmailApi,
  attachmentMap,
  attachmentsUploading,
  sessionId,
  onBack,
  onStartOver,
  onScheduled,
  onSendComplete,
  onFooterIdleChange,
}: {
  smtpConfig: SmtpConfig;
  template: Template;
  recipients: Recipient[];
  useOutlookGraph?: boolean;
  useGmailApi?: boolean;
  attachmentMap: Record<string, EmailAttachment[]>;
  attachmentsUploading?: boolean;
  sessionId: string;
  onBack: () => void;
  onStartOver: () => void;
  onScheduled: (scheduledAt: string, payload: SendPayload) => Promise<void>;
  onSendComplete?: () => void;
  onFooterIdleChange?: (idle: boolean) => void;
}) {
  const [sending, setSending] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [instantJob, setInstantJob] = useState<PublicScheduledJob | null>(null);
  const [error, setError] = useState('');
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const defaultSchedule = new Date(Date.now() + 60 * 60 * 1000);
  const [scheduleDate, setScheduleDate] = useState(() => toDateInputValue(defaultSchedule));
  const [scheduleTime, setScheduleTime] = useState(() => toTimeInputValue(defaultSchedule));
  const [scheduledDone, setScheduledDone] = useState(false);
  const [confirmedScheduleTime, setConfirmedScheduleTime] = useState('');
  const sendCompleteFired = useRef(false);
  const stopPollingRef = useRef(false);

  const sentCount = instantJob?.sentCount ?? 0;
  const failCount = instantJob?.failedCount ?? 0;
  const totalCount = instantJob?.recipientCount ?? 0;
  const progress = totalCount > 0 ? ((sentCount + failCount) / totalCount) * 100 : 0;
  const done = !!instantJob && (instantJob.status === 'completed' || instantJob.status === 'failed' || (instantJob.pendingCount ?? 0) === 0);
  const idle = !sending && !instantJob && !scheduledDone;

  useEffect(() => {
    onFooterIdleChange?.(idle);
  }, [idle, onFooterIdleChange]);
  const attachmentCount = Object.values(attachmentMap).filter((a) => a.length > 0).length;

  useEffect(() => {
    if (!done || sendCompleteFired.current || !onSendComplete) return;
    sendCompleteFired.current = true;
    onSendComplete();
  }, [done, onSendComplete]);

  useEffect(() => {
    return () => { stopPollingRef.current = true; };
  }, []);

  function buildPayload(): SendPayload {
    return {
      smtpConfig,
      template,
      recipients,
      useOutlookGraph,
      useGmailApi,
      attachmentMap,
      sessionId,
    };
  }

  // Instant send is a resumable background job (same pipeline as scheduled
  // sends, chunked with rest periods between groups) rather than one
  // continuously-streamed request — this gives it the same delay pacing,
  // timeout safety, and provider-friendly chunking scheduled sends already
  // have. Progress advances in chunk-sized steps, not per-recipient.
  async function pollInstantJob(jobId: string) {
    if (stopPollingRef.current) return;
    let job: PublicScheduledJob | null;
    try {
      job = await fetchScheduledJob(jobId);
    } catch (e) {
      setError(`Failed to check send status: ${e}`);
      setSending(false);
      return;
    }
    if (stopPollingRef.current) return;

    if (job) {
      setInstantJob(job);
      const finished = job.status === 'completed' || job.status === 'failed' || (job.pendingCount ?? 0) === 0;
      if (!finished) {
        setTimeout(() => pollInstantJob(jobId), 5000);
        return;
      }
    }
    // job === null means it already finished and was cleaned up between
    // polls — the last setInstantJob(job) call before that already carried
    // its final counts, so there's nothing more to update.
    setSending(false);
  }

  async function startSending() {
    if (attachmentsUploading) {
      setError('Attachments are still uploading. Wait for the upload to finish, then try again.');
      return;
    }
    setError('');
    setInstantJob(null);
    setSending(true);
    stopPollingRef.current = false;

    try {
      const job = await createScheduledJob({
        scheduledAt: new Date().toISOString(),
        label: `${recipients.length} emails`,
        payload: buildPayload(),
        sessionId,
        instant: true,
      });
      setInstantJob(job);
      const finished = job.status === 'completed' || job.status === 'failed' || (job.pendingCount ?? 0) === 0;
      if (finished) {
        setSending(false);
      } else {
        setTimeout(() => pollInstantJob(job.id), 5000);
      }
    } catch (e) {
      setError(`Send failed: ${e}`);
      setSending(false);
    }
  }

  function getScheduledWhen(): Date {
    return combineDateAndTime(scheduleDate, scheduleTime);
  }

  async function handleSchedule() {
    if (attachmentsUploading) {
      setError('Attachments are still uploading. Wait for the upload to finish, then try again.');
      return;
    }
    if (!scheduleDate || !scheduleTime) {
      setError('Pick a date and time.');
      return;
    }
    const when = getScheduledWhen();
    if (Number.isNaN(when.getTime())) {
      setError('Invalid date or time.');
      return;
    }
    if (when.getTime() <= Date.now()) {
      setError('Scheduled time must be in the future.');
      return;
    }
    setError('');
    setScheduling(true);
    try {
      await onScheduled(when.toISOString(), buildPayload());
      setConfirmedScheduleTime(when.toISOString());
      setScheduledDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setScheduling(false);
    }
  }

  return (
    <Card title="Send your campaign" subtitle={`Choose when to deliver to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}.`}>
      {(() => {
        const activeLabel = PRESETS.find((p) => p.host === smtpConfig.host)?.label
          ?? (smtpConfig.host === '' ? 'Custom' : undefined);
        const provider = PRESETS.find((p) => p.label === activeLabel);
        if (!provider) return null;
        return (
          <div className="flex items-center gap-3 p-3.5 border border-border rounded-lg bg-muted/30">
            <ProviderLogo preset={provider} size={18} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Sending via {provider.label}
                {useGmailApi && ' · Gmail API'}
                {useOutlookGraph && ' · Microsoft Graph'}
              </p>
              <p className="text-xs text-muted-foreground font-mono truncate">{smtpConfig.user || smtpConfig.fromName}</p>
            </div>
          </div>
        );
      })()}
      {!sending && !instantJob && !scheduledDone && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                mode: 'now' as const,
                icon: Zap,
                title: 'Send Now',
                desc: `Deliver immediately to all ${recipients.length} recipients`,
              },
              {
                mode: 'schedule' as const,
                icon: Calendar,
                title: 'Schedule',
                desc: 'Pick a date and time for automatic delivery',
              },
            ].map(({ mode, icon: Icon, title, desc }) => (
              <SelectCard
                key={mode}
                selected={sendMode === mode}
                onClick={() => setSendMode(mode)}
                className="p-5"
              >
                <div className={`size-10 rounded-md mb-4 flex items-center justify-center transition-colors ${
                  sendMode === mode ? 'bg-foreground' : 'bg-muted'
                }`}>
                  <Icon className={`size-5 ${sendMode === mode ? 'text-background' : 'text-muted-foreground'}`} />
                </div>
                <p className="font-bold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </SelectCard>
            ))}
          </div>

          <AnimatePresence>
            {sendMode === 'schedule' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="border border-border rounded-lg bg-card p-5 space-y-4">
                  <SectionLabel>Schedule delivery</SectionLabel>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Date">
                      <input
                        type="date"
                        className={inputCls}
                        value={scheduleDate}
                        min={todayDateInputValue()}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                    </Field>
                    <Field label="Time">
                      <input
                        type="time"
                        className={inputCls}
                        value={scheduleTime}
                        step={60}
                        onChange={(e) => setScheduleTime(e.target.value)}
                      />
                    </Field>
                  </div>
                  {scheduleDate && scheduleTime && (
                    <p className="text-xs text-muted-foreground font-mono">
                      Scheduled for {formatScheduleTime(getScheduledWhen().toISOString())}. For large batches sent in chunks, keep this tab open until it finishes — it drives each chunk forward.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Btn
            onClick={sendMode === 'now' ? startSending : handleSchedule}
            disabled={scheduling || attachmentsUploading || (sendMode === 'schedule' && (!scheduleDate || !scheduleTime))}
            size="lg"
            className="w-full"
          >
            {attachmentsUploading ? (
              'Uploading attachments…'
            ) : scheduling ? (
              <><Loader2 className="size-4 animate-spin" />Scheduling…</>
            ) : sendMode === 'schedule' ? (
              <><Calendar className="size-4" />Schedule Campaign</>
            ) : (
              <><Send className="size-4" />Send {recipients.length} Email{recipients.length !== 1 ? 's' : ''} Now</>
            )}
          </Btn>
        </div>
      )}

      {scheduledDone && (
        <div className="flex flex-col items-center justify-center text-center py-10 space-y-6">
          <div className="size-20 rounded-full bg-foreground flex items-center justify-center">
            <CheckCircle className="size-10 text-background" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-foreground">Campaign scheduled</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {recipients.length} email{recipients.length !== 1 ? 's' : ''} will send on{' '}
              {formatScheduleTime(confirmedScheduleTime || getScheduledWhen().toISOString())}.
            </p>
          </div>
          <Btn onClick={onStartOver} variant="secondary">
            Send another campaign →
          </Btn>
        </div>
      )}

      {(sending || instantJob) && (
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-muted-foreground font-mono mb-2">
              <span>{sentCount + failCount} of {totalCount} sent{failCount > 0 ? ` (${failCount} failed)` : ''}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-foreground rounded-full"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          </div>

          {done ? (
            <Notice variant={failCount === 0 ? 'success' : 'warning'}>
              {failCount === 0
                ? `All ${sentCount} emails sent successfully.`
                : `Done — ${sentCount} sent, ${failCount} failed`}
            </Notice>
          ) : (
            <div className="px-4 py-3 rounded-lg border border-border text-muted-foreground text-center text-sm flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {instantJob?.status === 'partial'
                ? 'Sending in chunks — pausing briefly between groups, continuing automatically…'
                : 'Sending…'}
            </div>
          )}
        </div>
      )}

      <ErrorMsg msg={error} />
    </Card>
  );
}

// ─── Scheduled job time editor ────────────────────────────────────────────────

function ScheduleTimeEditor({
  job,
  onSave,
  onCancel,
}: {
  job: PublicScheduledJob;
  onSave: (id: string, scheduledAt: string) => void;
  onCancel: () => void;
}) {
  const initial = new Date(job.scheduledAt);
  const [date, setDate] = useState(toDateInputValue(initial));
  const [time, setTime] = useState(toTimeInputValue(initial));

  function save() {
    const when = combineDateAndTime(date, time);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      alert('Pick a date and time in the future.');
      return;
    }
    onSave(job.id, when.toISOString());
  }

  return (
    <div className="flex flex-wrap items-end gap-2 w-full">
      <input type="date" className={`${inputCls} max-w-[11rem]`} value={date} min={todayDateInputValue()} onChange={(e) => setDate(e.target.value)} />
      <input type="time" className={`${inputCls} max-w-[9rem]`} value={time} step={60} onChange={(e) => setTime(e.target.value)} />
      <button type="button" onClick={save} className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">Save</button>
      <button type="button" onClick={onCancel} className="px-3 py-2 border border-gray-300 text-xs rounded-lg hover:bg-white">Cancel</button>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const [step, setStep] = useState(1);
  const [stepDirection, setStepDirection] = useState(1);
  const [navigating, setNavigating] = useState(false);
  const pendingNav = useRef<{ target: number; advance: boolean } | null>(null);
  const [oauthError, setOauthError] = useState('');
  const [pendingDraft, setPendingDraft] = useState<{ subject: string; body: string } | null>(null);
  const [smtpError, setSmtpError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [recipientsError, setRecipientsError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sendStepIdle, setSendStepIdle] = useState(true);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);

  function completeNavigation() {
    const pending = pendingNav.current;
    if (pending) {
      setStep(pending.target);
      pendingNav.current = null;
    }
    setNavigating(false);
  }

  function transitionToStep(target: number, advance: boolean) {
    if (navigating || target === step) return;
    if (!advance && target >= step) return;
    setStepDirection(target > step ? 1 : -1);
    pendingNav.current = { target, advance };
    setNavigating(true);
  }

  function goToStep(target: number) {
    transitionToStep(target, false);
  }

  function advanceStep(target: number) {
    transitionToStep(target, true);
  }

  // Pick up a draft loaded from the Gmail Drafts page
  useEffect(() => {
    const raw = localStorage.getItem('pendingDraft');
    if (raw) {
      try { setPendingDraft(JSON.parse(raw)); } catch { /* ignore */ }
      localStorage.removeItem('pendingDraft');
    }
  }, []);

  // URL params: step navigation after OAuth, error messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const provider = params.get('provider');
    const stepParam = params.get('step');

    if (error) {
      const label = provider === 'outlook' ? 'Microsoft sign-in' : provider === 'gmail' ? 'Google sign-in' : 'Sign-in';
      setOauthError(`${label} failed: ${decodeURIComponent(error.replace(/\+/g, ' '))}`);
    }

    if (stepParam) {
      const n = parseInt(stepParam, 10);
      if (n >= 1 && n <= 5) setStep(n);
    }

    if (error || stepParam) {
      window.history.replaceState({}, '', '/main');
    }
  }, []);

  const defaultSmtp: SmtpConfig = { host: 'smtp.gmail.com', port: 587, secure: false, user: '', password: '', fromName: '', delayMs: 4000 };
  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(defaultSmtp);
  const [template, setTemplate] = useState<Template>({ subject: '', body: '', signature: '' });
  const hydrated = useRef(false);

  // Load persisted values after mount (avoids SSR/client hydration mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('smtpConfig');
      if (saved && saved !== 'undefined') setSmtpConfig(JSON.parse(saved));
    } catch { /* ignore */ }
    try {
      const saved = localStorage.getItem('emailTemplate');
      if (saved && saved !== 'undefined') setTemplate(JSON.parse(saved));
    } catch { /* ignore */ }
    hydrated.current = true;
  }, []);

  // Persist smtp config and template — only after initial load to avoid overwriting saved data
  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem('smtpConfig', JSON.stringify(smtpConfig));
  }, [smtpConfig]);
  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem('emailTemplate', JSON.stringify(template));
  }, [template]);

  useEffect(() => {
    fetch('/api/auth/google/session').then((r) => r.json()).then((d) => setGmailConnected(!!d.connected)).catch(() => setGmailConnected(false));
    fetch('/api/auth/microsoft/session').then((r) => r.json()).then((d) => setOutlookConnected(!!d.connected)).catch(() => setOutlookConnected(false));
  }, [step]);

  useEffect(() => {
    if (!gmailConnected || !isGmailProvider(smtpConfig) || smtpConfig.password) return;

    const params = new URLSearchParams();
    if (smtpConfig.user) params.set('from', smtpConfig.user);

    fetch(`/api/auth/google/signature${params.size ? `?${params.toString()}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load Gmail signature'))))
      .then((data: { signature?: string }) => {
        const signature = data.signature?.trim();
        if (!signature) return;
        setTemplate((current) => {
          if (current.signature?.trim()) return current;
          return { ...current, signature };
        });
      })
      .catch((err) => {
        console.warn('[main] Gmail signature load failed:', err);
      });
  }, [gmailConnected, smtpConfig.host, smtpConfig.password, smtpConfig.user]);

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<EmailAttachment[]>([]);
  const [attachmentAssignments, setAttachmentAssignments] = useState<Record<string, string[]>>({});
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const sessionReady = useRef(false);
  const [scheduledJobs, setScheduledJobs] = useState<PublicScheduledJob[]>([]);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [scheduleLoadError, setScheduleLoadError] = useState('');
  const [scheduleToasts, setScheduleToasts] = useState<Array<{ id: string; message: string; type: 'success' | 'error' }>>([]);
  const prevJobMapRef = useRef<Map<string, PublicScheduledJob>>(new Map());
  const failedDismissTimersRef = useRef<Map<string, number>>(new Map());

  const attachmentMap = buildAttachmentMap(recipients, attachmentFiles, attachmentAssignments);

  useEffect(() => {
    if (!hydrated.current) return;
    const id = getOrCreateSessionId(() => createId('sess_'));
    setSessionId(id);
    fetchWorkSession(id)
      .then((data) => {
        if (data) {
          setRecipients(data.recipients as Recipient[]);
          setColumns(data.columns);
          setAttachmentAssignments(data.attachmentAssignments);
          setAttachmentFiles(
            data.attachmentFiles.map((file) => ({
              id: file.id,
              filename: file.filename,
              contentType: file.contentType,
              content: '',
            })),
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        sessionReady.current = true;
      });
  }, []);

  useEffect(() => {
    if (!sessionReady.current || !sessionId) return;
    const timer = window.setTimeout(() => {
      saveWorkSessionRemote(sessionId, {
        recipients,
        columns,
        attachmentAssignments,
        attachmentFiles: attachmentFiles.map((file) => ({
          id: file.id,
          filename: file.filename,
          contentType: file.contentType,
        })),
      }).catch(() => {});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [sessionId, recipients, columns, attachmentAssignments, attachmentFiles]);

  function pushScheduleToast(toast: { id: string; message: string; type: 'success' | 'error' }) {
    setScheduleToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast]);
    window.setTimeout(() => {
      setScheduleToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, 8000);
  }

  useEffect(() => {
    const currentMap = new Map(scheduledJobs.map((j) => [j.id, j]));
    const prev = prevJobMapRef.current;

    for (const [id, prevJob] of prev) {
      if (!currentMap.has(id) && (prevJob.status === 'pending' || prevJob.status === 'processing' || prevJob.status === 'partial')) {
        pushScheduleToast({
          id: `sent-${id}`,
          type: 'success',
          message: `${prevJob.label} sent successfully`,
        });
      }
    }

    prevJobMapRef.current = currentMap;
  }, [scheduledJobs]);

  useEffect(() => {
    for (const job of scheduledJobs) {
      if (job.status !== 'failed' || failedDismissTimersRef.current.has(job.id)) continue;
      const timer = window.setTimeout(() => {
        cancelJob(job.id).catch(() => {});
        failedDismissTimersRef.current.delete(job.id);
      }, 10000);
      failedDismissTimersRef.current.set(job.id, timer);
    }
  }, [scheduledJobs]);

  useEffect(() => {
    async function refresh() {
      try {
        const jobs = await fetchScheduledJobs();
        setScheduledJobs(jobs);
        setScheduleLoadError('');
      } catch (e) {
        setScheduleLoadError(String(e));
      }
    }
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, []);

  async function handleScheduleSend(scheduledAt: string, payload: SendPayload) {
    await createScheduledJob({
      scheduledAt,
      label: `${payload.recipients.length} emails`,
      payload,
      sessionId,
    });
    // The server already ran finishComposerAfterSchedule() which cleanly moves
    // attachment files to the job and wipes unrelated composer files.
    // Do NOT call deleteWorkSessionRemote here — it would invoke emptyFilesHandler()
    // and delete the attachment files that were just claimed for this scheduled job.
    resetComposerLocalState();
    setScheduledJobs(await fetchScheduledJobs());
  }

  /** Reset only local/browser state after scheduling or cancelling a campaign. */
  function resetComposerLocalState() {
    setAttachmentFiles([]);
    setAttachmentAssignments({});
    void clearAllAttachmentCache();
    clearSessionId();
    setSessionId(getOrCreateSessionId(() => createId('sess_')));
  }

  function clearComposerFiles() {
    const oldSessionId = sessionId;
    setAttachmentFiles([]);
    setAttachmentAssignments({});
    void clearAllAttachmentCache();
    if (oldSessionId) {
      void deleteWorkSessionRemote(oldSessionId).then(() => {
        setSessionId(getOrCreateSessionId(() => createId('sess_')));
      });
    } else {
      clearSessionId();
      setSessionId(getOrCreateSessionId(() => createId('sess_')));
    }
  }

  async function rescheduleJob(id: string, scheduledAt: string) {
    await updateScheduledJobTime(id, scheduledAt);
    setScheduledJobs(await fetchScheduledJobs());
    setEditingJobId(null);
  }

  async function cancelJob(id: string) {
    await cancelScheduledJob(id);
    setScheduledJobs(await fetchScheduledJobs());
    setEditingJobId(null);
  }

  function resetCampaign() {
    if (sessionId) {
      void deleteWorkSessionRemote(sessionId).then(() => {
        clearSessionId();
        setSessionId(getOrCreateSessionId(() => createId('sess_')));
      });
    }
    void clearAllAttachmentCache();
    setStep(1);
    setRecipients([]);
    setColumns([]);
    setPreviews([]);
    setAttachmentFiles([]);
    setAttachmentAssignments({});
    setSmtpError('');
    setDraftError('');
    setRecipientsError('');
  }

  const activeLabel = smtpConfig.selectedPreset
    ?? (PRESETS.find((p) => p.host === smtpConfig.host)?.label
    ?? (smtpConfig.host === '' ? 'Custom' : undefined));
  const useGmailApi = isGmailProvider(smtpConfig) && !smtpConfig.password;
  const useOutlookGraph = isOutlookProvider(smtpConfig) && !smtpConfig.password;
  const oauthConnected = useGmailApi ? gmailConnected : useOutlookGraph ? outlookConnected : true;

  async function handleContinue() {
    if (step === 1) {
      const err = validateSmtpStep(smtpConfig, activeLabel, oauthConnected);
      if (err) { setSmtpError(err); return; }
      setSmtpError('');
      advanceStep(2);
      return;
    }
    if (step === 2) {
      const err = validateDraftStep(template);
      if (err) { setDraftError(err); return; }
      setDraftError('');
      advanceStep(3);
      return;
    }
    if (step === 3) {
      if (attachmentsUploading) {
        setRecipientsError('Attachments are still uploading. Wait for the upload to finish, then continue.');
        return;
      }
      const err = validateRecipientsStep(recipients);
      if (err) { setRecipientsError(err); return; }
      setRecipientsError('');
      setPreviewLoading(true);
      try {
        const p = await fetchPreviews(template, recipients, attachmentMap);
        setPreviews(p);
        advanceStep(4);
      } catch (e) {
        setRecipientsError(String(e));
      } finally {
        setPreviewLoading(false);
      }
      return;
    }
    if (step === 4) {
      advanceStep(5);
    }
  }

  const showFooter = (step < 5 || sendStepIdle) && !navigating;
  const continueDisabled = step === 3 && (previewLoading || attachmentsUploading);

  return (
    <main className="min-h-screen bg-background flex flex-col">
      <PaperPlaneLoader show={navigating} onComplete={completeNavigation} />

      <header className="border-b border-border bg-background px-6 py-4 flex items-center gap-3 sticky top-0 z-20">
        <AppLogo size={36} />
        <div className="min-w-0">
          <span className="font-bold text-foreground tracking-tight block">MailBridge</span>
          <p className="text-muted-foreground text-xs mt-0.5 hidden sm:block">Personalized bulk email · Arabic &amp; English · any SMTP</p>
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <span className="text-xs text-muted-foreground font-mono hidden md:block">
            Step {step} / 5
          </span>
          <TransitionLink href="/draft-id"
            className="text-xs font-semibold text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 px-2.5 sm:px-3 py-1.5 rounded-md transition-colors">
            Draft IDs
          </TransitionLink>
          <TransitionLink href="/support"
            className="text-xs font-semibold text-foreground border border-border hover:border-foreground/30 px-2.5 sm:px-3 py-1.5 rounded-md transition-colors">
            Setup Guide
          </TransitionLink>
        </div>
      </header>

      <CampaignStepper current={step} onStepClick={goToStep} />

      <div className={`flex-1 transition-opacity duration-200 ${navigating ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
        <div className="max-w-2xl mx-auto px-5 py-10">

        {oauthError && (
          <Notice variant="error" >
            <div className="flex items-start justify-between gap-3">
              <p>{oauthError}</p>
              <button onClick={() => setOauthError('')} className="text-xs px-2 shrink-0 opacity-70 hover:opacity-100">✕</button>
            </div>
          </Notice>
        )}

        {/* Banner: draft loaded from Gmail Drafts page */}
        {pendingDraft && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <div className="text-sm text-green-800">
              <strong>Draft loaded:</strong>{' '}
              <span dir="auto">{pendingDraft.subject || '(no subject)'}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTemplate({ subject: pendingDraft.subject, body: pendingDraft.body });
                  setPendingDraft(null);
                  advanceStep(2);
                }}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
              >
                Load into template →
              </button>
              <button onClick={() => setPendingDraft(null)} className="text-green-600 hover:text-green-800 text-xs px-2">✕</button>
            </div>
          </div>
        )}

        {scheduleLoadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load scheduled sends: {scheduleLoadError}
          </div>
        )}

        {scheduleToasts.map((toast) => (
          <div
            key={toast.id}
            className={`mb-4 flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${
              toast.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-red-200 bg-red-50 text-red-800'
            }`}
          >
            <p className="text-sm">{toast.message}</p>
            <button
              type="button"
              onClick={() => setScheduleToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="text-xs px-2 shrink-0 opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}

        {scheduledJobs.filter((j) => j.status === 'processing' || j.status === 'partial').map((j) => (
          <div key={j.id} className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              <strong>{j.status === 'partial' ? 'Sending in progress' : 'Sending now'}:</strong>{' '}
              {j.label} — {j.sentCount ?? 0}/{j.recipientCount} sent
              {(j.pendingCount ?? 0) > 0 && ` · ${j.pendingCount} remaining`}
            </p>
            {j.error && <p className="text-xs text-amber-800 mt-1">{j.error}</p>}
          </div>
        ))}

        {scheduledJobs.filter((j) => j.status === 'failed').map((j) => (
          <div key={j.id} className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-800">
              <strong>Failed:</strong> {j.label} — {j.error ?? 'Send failed'}
            </p>
            <button
              type="button"
              onClick={() => cancelJob(j.id)}
              className="text-red-500 hover:text-red-700 text-xs px-2 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}

        {(scheduledJobs.filter((j) => j.status === 'pending').length > 0) && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-3">
            <p className="text-sm font-semibold text-blue-900">Scheduled sends (automatic)</p>
            {scheduledJobs.filter((j) => j.status === 'pending').map((j) => (
              <div key={j.id} className="space-y-2">
                {editingJobId === j.id ? (
                  <ScheduleTimeEditor job={j} onSave={rescheduleJob} onCancel={() => setEditingJobId(null)} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-blue-800">
                    <span>
                      {j.label} ({j.recipientCount}) — {formatScheduleTime(j.scheduledAt)}
                      {new Date(j.scheduledAt).getTime() <= Date.now() && (
                        <span className="text-amber-700"> · sending soon</span>
                      )}
                    </span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditingJobId(j.id)} className="text-xs text-blue-700 hover:text-blue-900 font-medium">
                        Edit time
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelJob(j.id)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: stepDirection * 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: stepDirection * -28 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
          >
        {step === 1 && (
          <FigmaSmtpStep config={smtpConfig} onChange={setSmtpConfig} error={smtpError} onError={setSmtpError} />
        )}
        {step === 2 && (
          <FigmaDraftStep
            template={template}
            onChange={setTemplate}
            error={draftError}
            isGmail={isGmailProvider(smtpConfig) && !smtpConfig.password}
            isOutlook={isOutlookProvider(smtpConfig) && !smtpConfig.password}
            gmailConnected={gmailConnected}
            outlookConnected={outlookConnected}
          />
        )}
        {step === 3 && (
          <FigmaRecipientsStep
            template={template}
            recipients={recipients}
            columns={columns}
            attachmentFiles={attachmentFiles}
            attachmentAssignments={attachmentAssignments}
            sessionId={sessionId}
            onAttachmentFilesChange={setAttachmentFiles}
            onAttachmentAssignmentsChange={setAttachmentAssignments}
            onAttachmentsUploadingChange={setAttachmentsUploading}
            onRecipientsChange={(r, c) => { setRecipients(r); setColumns(c); }}
            error={recipientsError}
          />
        )}
        {step === 4 && (
          <FigmaPreviewStep
            previews={previews}
            recipientCount={recipients.length}
            attachmentCount={Object.values(attachmentMap).reduce((n, a) => n + a.length, 0)}
            smtpConfig={smtpConfig}
          />
        )}
        {step === 5 && (
          <SendStep
            smtpConfig={smtpConfig}
            template={template}
            recipients={recipients}
            useOutlookGraph={isOutlookProvider(smtpConfig) && !smtpConfig.password}
            useGmailApi={isGmailProvider(smtpConfig) && !smtpConfig.password}
            attachmentMap={attachmentMap}
            attachmentsUploading={attachmentsUploading}
            sessionId={sessionId}
            onBack={() => goToStep(4)}
            onStartOver={resetCampaign}
            onScheduled={handleScheduleSend}
            onSendComplete={clearComposerFiles}
            onFooterIdleChange={setSendStepIdle}
          />
        )}
          </motion.div>
        </AnimatePresence>
        </div>
      </div>

      {showFooter && (
        <div className="border-t border-border bg-background px-6 py-4 flex items-center justify-between sticky bottom-0 z-20">
          <button
            type="button"
            onClick={() => goToStep(step - 1)}
            disabled={step === 1}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:cursor-not-allowed transition-colors font-semibold"
          >
            <ChevronLeft className="size-4" />
            Back
          </button>
          {step < 5 && (
            <Btn onClick={handleContinue} disabled={continueDisabled}>
              {step === 4 ? 'Proceed to Send' : 'Continue'}
              <ChevronRight className="size-4" />
            </Btn>
          )}
        </div>
      )}

      <footer className="max-w-2xl mx-auto px-5 pb-8 pt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <TransitionLink href="/privacy" className="hover:text-foreground underline-offset-2 hover:underline">
          Privacy Policy
        </TransitionLink>
        <span aria-hidden="true">·</span>
        <TransitionLink href="/terms" className="hover:text-foreground underline-offset-2 hover:underline">
          Terms of Service
        </TransitionLink>
      </footer>
    </main>
  );
}
