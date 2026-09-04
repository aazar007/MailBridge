import Link from 'next/link';
import { GmailLogo, OutlookLogo, ICloudLogo, YahooLogo } from '@/lib/logos';
import { AppLogo } from '@/components/app-logo';
import { TransitionLink } from '@/components/transition-link';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center mt-0.5">
        {n}
      </div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-mono border border-gray-200">
      {children}
    </code>
  );
}

function AppPasswordBtn({ href, label, color }: { href: string; label: string; color: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 ${color}`}
    >
      <span>🔑</span>
      {label}
      <span className="text-xs opacity-75">↗</span>
    </a>
  );
}

function SmtpBox({ host, port, secure }: { host: string; port: number; secure?: boolean }) {
  return (
    <div className="mt-2 p-4 bg-gray-900 rounded-xl text-xs font-mono text-green-400 space-y-1">
      <p><span className="text-gray-500">Host:     </span>{host}</p>
      <p><span className="text-gray-500">Port:     </span>{port}</p>
      <p><span className="text-gray-500">Security: </span>{secure ? 'SSL/TLS (turn SSL checkbox ON)' : 'STARTTLS (leave SSL checkbox OFF)'}</p>
    </div>
  );
}

function Section({ icon, title, badge, children }: {
  icon: React.ReactNode; title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-5 border-b bg-gray-50">
        <span className="flex-shrink-0">{icon}</span>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {badge && <span className="text-xs font-medium text-gray-500">{badge}</span>}
        </div>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </section>
  );
}

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 shadow-sm flex items-center gap-4">
        <TransitionLink href="/main" className="text-blue-600 hover:text-blue-800 text-sm font-medium">← Back to app</TransitionLink>
        <AppLogo size={32} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Setup Guide</h1>
          <p className="text-gray-400 text-xs mt-0.5">How to get App Passwords and connect each provider</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-900 space-y-2">
          <p className="font-semibold text-base">Why App Passwords?</p>
          <p>
            Gmail, iCloud, and Yahoo block regular passwords in third-party apps.
            An App Password is a separate code used only for sending — your main password stays private.
          </p>
          <p className="text-blue-800">
            <strong>Gmail without App Password?</strong> Select the Gmail preset and click <strong>Sign in with Google</strong> — sending uses the Gmail API (no App Password). iCloud and Yahoo still require App Passwords via SMTP.
          </p>
        </div>

        <Section icon={<span className="text-2xl">📝</span>} title="Creating a draft email" badge="Use as your template">
          <p className="text-sm text-gray-700">Compose a draft in your email provider, then load it in the app (Template step → <strong>Load from email draft</strong>).</p>

          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2"><GmailLogo size={20} /> Gmail</p>
              <Step n={1}>Open <a href="https://mail.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Gmail</a> → click <strong>Compose</strong>.</Step>
              <Step n={2}>Write your subject and body. Use placeholders like <Code>{'{{First_Name}}'}</Code> where you want personalization.</Step>
              <Step n={3}>Close the compose window — Gmail auto-saves it under <strong>Drafts</strong>.</Step>
              <Step n={4}>In this app, go to Template → <strong>Load from email draft</strong> → Gmail → pick your draft.</Step>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2"><OutlookLogo size={20} /> Outlook</p>
              <Step n={1}>Open <a href="https://outlook.live.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Outlook</a> → <strong>New mail</strong>.</Step>
              <Step n={2}>Write subject and body with placeholders like <Code>{'{{First_Name}}'}</Code>.</Step>
              <Step n={3}>Click the <strong>X</strong> on the compose tab — Outlook saves it to <strong>Drafts</strong>.</Step>
              <Step n={4}>In this app, Template → <strong>Load from email draft</strong> → Outlook → pick your draft.</Step>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2"><ICloudLogo size={20} /> iCloud Mail</p>
              <Step n={1}>Open <a href="https://www.icloud.com/mail" target="_blank" rel="noreferrer" className="text-blue-600 underline">iCloud Mail</a> → compose a new message.</Step>
              <Step n={2}>Write your content, then close without sending — it saves to <strong>Drafts</strong>.</Step>
              <Step n={3}>Copy the HTML (Inspect → Copy outerHTML) into the app template, or paste manually.</Step>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-2"><YahooLogo size={20} /> Yahoo Mail</p>
              <Step n={1}>Open <a href="https://mail.yahoo.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">Yahoo Mail</a> → <strong>Compose</strong>.</Step>
              <Step n={2}>Write your email, then close — Yahoo saves it under <strong>Drafts</strong>.</Step>
              <Step n={3}>Copy the HTML into the app template, or paste manually.</Step>
            </div>
          </div>
        </Section>

        <Section icon={<GmailLogo size={32} />} title="Gmail" badge="Sign in with Google">
          <p className="text-sm text-gray-700 font-medium">No App Password needed — sign in with Google to send.</p>
          <Step n={1}>In the app, select the <strong>Gmail</strong> preset.</Step>
          <Step n={2}>Click <strong>Sign in with Google</strong> and approve access (includes send permission).</Step>
          <Step n={3}>Enter a <strong>From Name</strong>, then continue through the send steps.</Step>
          <p className="text-xs text-gray-500 pt-1">
            If you signed in before, sign out and sign in again after adding the <Code>gmail.send</Code> scope in Google Cloud Console.
          </p>
        </Section>

        <Section icon={<OutlookLogo size={32} />} title="Outlook / Microsoft 365" badge="Sign in with Microsoft">
          <p className="text-sm text-gray-700 font-medium">No App Password needed for Outlook in this app.</p>
          <Step n={1}>In the app, select the <strong>Outlook</strong> preset.</Step>
          <Step n={2}>Click <strong>Sign in with Microsoft</strong> and approve access.</Step>
          <Step n={3}>Enter a <strong>From Name</strong>, then continue through the send steps.</Step>
        </Section>

        <Section icon={<ICloudLogo size={32} />} title="iCloud Mail" badge="App-Specific Password required">
          <p className="text-sm text-gray-700 font-medium">Password field: App-Specific Password</p>
          <Step n={1}>
            Make sure <strong>iCloud Mail is enabled</strong>: Settings → Apple ID → iCloud → Mail → ON.
          </Step>
          <Step n={2}>
            Go to <strong>appleid.apple.com → Sign-In and Security → App-Specific Passwords</strong>.
          </Step>
          <Step n={3}>
            Click <strong>+</strong>, name it (e.g. <Code>MailBridge</Code>), then copy the password shown.
          </Step>
          <Step n={4}>
            Paste it into the <strong>Password</strong> field in the app. Username: your <Code>@icloud.com</Code> or <Code>@me.com</Code> address.
          </Step>
          <AppPasswordBtn href="https://appleid.apple.com/account/manage" label="Open Apple ID Security" color="bg-gray-800" />
          <SmtpBox host="smtp.mail.me.com" port={587} />
        </Section>

        <Section icon={<YahooLogo size={32} />} title="Yahoo Mail" badge="App Password required">
          <p className="text-sm text-gray-700 font-medium">Password field: App Password</p>
          <Step n={1}>
            Go to <a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer" className="text-blue-600 underline">Yahoo Account Security</a>.
          </Step>
          <Step n={2}>Click <strong>Generate app password</strong>.</Step>
          <Step n={3}>Select <strong>Other app</strong>, name it anything, then copy the password.</Step>
          <Step n={4}>Paste it into the <strong>Password</strong> field in the app.</Step>
          <AppPasswordBtn href="https://login.yahoo.com/account/security" label="Open Yahoo Account Security" color="bg-purple-600" />
          <SmtpBox host="smtp.mail.yahoo.com" port={587} />
        </Section>

        <Section icon={<OutlookLogo size={32} />} title="Avoiding junk / spam folder" badge="Outlook & bulk sending">
          <p className="text-sm text-gray-700">If Outlook emails land in Junk, try these steps:</p>
          <Step n={1}>Use a clear, personal <strong>From Name</strong> (e.g. your club or organization name).</Step>
          <Step n={2}>Personalize each email with placeholders — identical bulk messages trigger spam filters.</Step>
          <Step n={3}>Increase the <strong>delay between sends</strong> (e.g. 3–5 seconds) on step 1.</Step>
          <Step n={4}>Send a test to yourself first; if it arrives in Inbox, ask recipients to mark <strong>Not junk</strong> once.</Step>
          <Step n={5}>Avoid ALL CAPS, excessive links, and spam trigger words in the subject line.</Step>
          <p className="text-xs text-gray-500 pt-2">
            Microsoft filters bulk personalized mail aggressively. There is no guaranteed fix, but the above reduces junk placement for most recipients.
          </p>
        </Section>

        <div className="text-center pb-4">
          <TransitionLink href="/main"
            className="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm">
            ← Back to MailBridge
          </TransitionLink>
        </div>
      </div>
    </main>
  );
}
