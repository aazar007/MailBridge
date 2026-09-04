'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AtSign, Check, CheckCircle, Lock, Loader2 } from 'lucide-react';
import { GmailLogo, OutlookLogo, YahooLogo, ICloudLogo, CustomSmtpLogo } from '@/lib/logos';
import { Card, ErrorMsg, Field, Notice, SelectCard, TextInput, inputCls } from '@/components/mail-ui';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  delayMs: number;
  selectedPreset?: string;
}

const PRESETS = [
  { label: 'Gmail', host: 'smtp.gmail.com', port: 587, secure: false, Logo: GmailLogo, color: '#EA4335', oauth: true, desc: 'Sign in with Google' },
  { label: 'Outlook', host: 'outlook.office365.com', port: 993, secure: true, Logo: OutlookLogo, color: '#0078D4', oauth: true, desc: 'Sign in with Microsoft' },
  { label: 'iCloud', host: 'smtp.mail.me.com', port: 587, secure: false, Logo: ICloudLogo, color: '#555555', oauth: false, desc: 'Email + app password' },
  { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 587, secure: false, Logo: YahooLogo, color: '#6001D2', oauth: false, desc: 'Email + app password' },
  { label: 'Custom', host: '', port: 587, secure: false, Logo: CustomSmtpLogo, color: '#059669', oauth: false, desc: 'Configure any SMTP server' },
] as const;

const PROVIDER_EMAIL_RULES: Record<string, { domains: string[]; hint: string }> = {
  Gmail: { domains: ['gmail.com', 'googlemail.com'], hint: 'Gmail requires an @gmail.com or @googlemail.com address.' },
  Outlook: { domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], hint: 'Outlook requires an @outlook.com, @hotmail.com, or @live.com address.' },
  iCloud: { domains: ['icloud.com', 'me.com', 'mac.com'], hint: 'iCloud requires an @icloud.com, @me.com, or @mac.com address.' },
  Yahoo: { domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'], hint: 'Yahoo requires a @yahoo.com, @ymail.com, or @rocketmail.com address.' },
};

export function isOutlookProvider(config: SmtpConfig) {
  return PRESETS.find((p) => p.label === 'Outlook')?.host === config.host;
}

export function isGmailProvider(config: SmtpConfig) {
  return PRESETS.find((p) => p.label === 'Gmail')?.host === config.host;
}

function getProviderEmailError(email: string, label: string | undefined): string | null {
  if (!label || label === 'Custom' || !PROVIDER_EMAIL_RULES[label]) return null;
  const domain = email.trim().toLowerCase().split('@')[1];
  if (!domain) return `Enter a valid email address. ${PROVIDER_EMAIL_RULES[label].hint}`;
  const ok = PROVIDER_EMAIL_RULES[label].domains.some((d) => domain === d || domain.endsWith(`.${d}`));
  return ok ? null : PROVIDER_EMAIL_RULES[label].hint;
}

export function validateSmtpStep(
  config: SmtpConfig,
  activeLabel: string | undefined,
  oauthConnected: boolean,
): string | null {
  if (!activeLabel) return 'Choose a sending provider.';
  const preset = PRESETS.find((p) => p.label === activeLabel);
  if (preset?.oauth) {
    if (!oauthConnected) return `Sign in with ${activeLabel === 'Outlook' ? 'Microsoft' : 'Google'} first.`;
  } else {
    if (activeLabel === 'Custom' && !config.host) return 'Enter SMTP host.';
    if (!config.user || !config.password) return 'Enter email and app password.';
    const emailErr = getProviderEmailError(config.user, activeLabel);
    if (emailErr) return emailErr;
  }
  if (!config.fromName.trim()) return 'Please enter a From Name.';
  return null;
}

export function ProviderLogo({ preset, size = 20, className = '' }: { preset: typeof PRESETS[number]; size?: number; className?: string }) {
  const Logo = preset.Logo;
  return (
    <div
      className={`flex items-center justify-center rounded-md shrink-0 ${className}`}
      style={{ width: size + 14, height: size + 14, backgroundColor: preset.color }}
    >
      <Logo size={size} />
    </div>
  );
}

export function FigmaSmtpStep({
  config,
  onChange,
  error,
  onError,
}: {
  config: SmtpConfig;
  onChange: (c: SmtpConfig) => void;
  error: string;
  onError: (msg: string) => void;
}) {
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookEmail, setOutlookEmail] = useState('');
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState('');
  const [encryption, setEncryption] = useState('TLS');

  const set = (patch: Partial<SmtpConfig>) => onChange({ ...config, ...patch });
  const activeLabel = config.selectedPreset
    ?? (PRESETS.find((p) => p.host === config.host)?.label
    ?? (config.host === '' ? 'Custom' : undefined));
  const provider = PRESETS.find((p) => p.label === activeLabel);
  const useOutlookGraph = isOutlookProvider(config) && !config.password;
  const useGmailApi = isGmailProvider(config) && !config.password;
  const oauthConnected = useOutlookGraph ? outlookConnected : gmailConnected;
  const oauthEmail = useOutlookGraph ? outlookEmail : gmailEmail;

  useEffect(() => { onError(''); }, [activeLabel, onError]);

  useEffect(() => {
    if (!useGmailApi) { setGmailConnected(false); setGmailEmail(''); return; }
    function load() {
      fetch('/api/auth/google/session')
        .then((r) => r.json())
        .then((data: { connected?: boolean; email?: string; displayName?: string }) => {
          if (data.connected && data.email) {
            setGmailConnected(true);
            setGmailEmail(data.email);
            set({ user: data.email, ...(!config.fromName && data.displayName ? { fromName: data.displayName } : {}) });
          } else {
            setGmailConnected(false);
            setGmailEmail('');
            set({ user: '' });
          }
        })
        .catch(() => { setGmailConnected(false); setGmailEmail(''); });
    }
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [useGmailApi]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!useOutlookGraph) { setOutlookConnected(false); setOutlookEmail(''); return; }
    function load() {
      fetch('/api/auth/microsoft/session')
        .then((r) => r.json())
        .then((data: { connected?: boolean; email?: string; displayName?: string }) => {
          if (data.connected && data.email) {
            setOutlookConnected(true);
            setOutlookEmail(data.email);
            set({ user: data.email, ...(!config.fromName && data.displayName ? { fromName: data.displayName } : {}) });
          } else {
            setOutlookConnected(false);
            setOutlookEmail('');
            set({ user: '' });
          }
        })
        .catch(() => { setOutlookConnected(false); setOutlookEmail(''); });
    }
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [useOutlookGraph]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(label: typeof PRESETS[number]['label']) {
    const p = PRESETS.find((x) => x.label === label)!;
    onChange({ ...config, host: p.host, port: p.port, secure: p.secure, user: '', password: '', selectedPreset: label });
  }

  return (
    <Card title="Choose your sending provider" subtitle="Select the email service your campaign will send from">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {PRESETS.map((p) => (
          <SelectCard key={p.label} selected={activeLabel === p.label} onClick={() => select(p.label)}>
            <ProviderLogo preset={p} size={18} className="mb-3" />
            <span className="font-semibold text-foreground text-sm">{p.label}</span>
            <span className="text-muted-foreground text-xs mt-0.5 leading-snug">{p.desc}</span>
          </SelectCard>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {provider && (
          <motion.div
            key={provider.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="border border-border rounded-lg bg-card overflow-hidden"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <ProviderLogo preset={provider} size={16} />
              <div>
                <p className="font-semibold text-foreground text-sm">{provider.label}</p>
                <p className="text-xs text-muted-foreground">{provider.desc}</p>
              </div>
            </div>

            <div className="px-5 py-5 space-y-4">
              {provider.oauth ? (
                oauthConnected ? (
                  <div className="flex items-center gap-3 p-3.5 bg-foreground/[0.04] border border-border rounded-md">
                    <ProviderLogo preset={provider} size={14} />
                    <CheckCircle className="size-4 text-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Connected</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{oauthEmail}</p>
                    </div>
                    <a href={useOutlookGraph ? '/api/auth/microsoft/logout?return=%2Fmain' : '/api/auth/logout?return=%2Fmain'} className="text-xs text-muted-foreground hover:text-foreground">
                      Disconnect
                    </a>
                  </div>
                ) : (
                  <a
                    href={useOutlookGraph ? '/api/auth/microsoft?return=%2Fmain' : '/api/auth/google?return=%2Fmain'}
                    className="flex items-center gap-3 px-4 py-2.5 border border-border rounded-md text-sm font-semibold text-foreground hover:bg-muted transition-colors w-fit"
                  >
                    <ProviderLogo preset={provider} size={14} />
                    Sign in with {provider.label}
                  </a>
                )
              ) : (
                <div className="space-y-3">
                  <Field label="Email address">
                    <TextInput value={config.user} onChange={(v) => set({ user: v })} placeholder="you@example.com" icon={AtSign} />
                  </Field>
                  {PROVIDER_EMAIL_RULES[provider.label] && (
                    <p className="text-xs text-muted-foreground">{PROVIDER_EMAIL_RULES[provider.label].hint}</p>
                  )}
                  <Field label="App password" hint="Use an app-specific password — not your main account password.">
                    <TextInput type="password" value={config.password} onChange={(v) => set({ password: v })} placeholder="xxxx xxxx xxxx xxxx" icon={Lock} />
                  </Field>
                  {provider.label === 'Custom' && (
                    <>
                      <Field label="SMTP host">
                        <TextInput value={config.host} onChange={(v) => set({ host: v })} placeholder="smtp.example.com" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Port">
                          <TextInput value={String(config.port)} onChange={(v) => set({ port: Number(v) || 587 })} placeholder="587" />
                        </Field>
                        <Field label="Encryption">
                          <select
                            value={encryption}
                            onChange={(e) => {
                              setEncryption(e.target.value);
                              set({ secure: e.target.value === 'SSL' });
                            }}
                            className={inputCls}
                          >
                            <option>TLS</option>
                            <option>SSL</option>
                            <option>None</option>
                          </select>
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={config.secure} onChange={(e) => set({ secure: e.target.checked })} className="rounded border-border" />
                        <span className="text-sm text-foreground">Use SSL/TLS (port 465)</span>
                      </label>
                    </>
                  )}
                  {provider.label === 'iCloud' && (
                    <Notice>
                      <p className="font-medium mb-2">Use an App-Specific Password in the password field above.</p>
                      <a href="https://appleid.apple.com/account/manage" target="_blank" rel="noreferrer" className="text-xs font-semibold underline underline-offset-2">
                        Open Apple ID Security ↗
                      </a>
                    </Notice>
                  )}
                  {provider.label === 'Yahoo' && (
                    <Notice>
                      <p className="font-medium mb-2">Generate an App Password in Yahoo Account Security.</p>
                      <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer" className="text-xs font-semibold underline underline-offset-2">
                        Open Yahoo Account Security ↗
                      </a>
                    </Notice>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                <Field label="From name">
                  <TextInput dir="auto" value={config.fromName} onChange={(v) => set({ fromName: v })} placeholder="AI Club" />
                </Field>
                <Field label="Delay between sends" hint="(ms)">
                  <TextInput value={String(config.delayMs)} onChange={(v) => set({ delayMs: Number(v) || 0 })} placeholder="2000" />
                </Field>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorMsg msg={error} />
    </Card>
  );
}

export { PRESETS };
