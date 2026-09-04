import { LegalLayout, LegalSection } from '@/components/legal-layout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" subtitle="Last updated: May 28, 2026">
      <p>
        MailBridge (&quot;the App&quot;) is a web tool that helps you compose and send personalized
        emails through your own email account. This policy describes what information the App handles
        and how it is used.
      </p>

      <LegalSection title="Information we process">
        <p>
          The App runs in your browser and on our hosting provider (Vercel). Depending on how you
          use it, we may process:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>SMTP settings, email templates, and recipient lists you enter</li>
          <li>OAuth tokens when you sign in with Google or Microsoft (stored in secure cookies on our server)</li>
          <li>Email content and recipient data while sending messages on your behalf</li>
          <li>Basic technical logs from our host (e.g. request time, errors) for reliability and security</li>
        </ul>
      </LegalSection>

      <LegalSection title="Data stored on your device">
        <p>
          SMTP configuration, templates, saved recipient lists, and similar preferences may be stored
          in your browser&apos;s <strong>localStorage</strong>. This data stays on your device unless you
          clear it or use a different browser.
        </p>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>When you choose to connect an account, the App interacts with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Google</strong> — to read drafts and send mail via Gmail API (if you sign in with Google)</li>
          <li><strong>Microsoft</strong> — to read drafts and send mail via Microsoft Graph (if you sign in with Microsoft)</li>
          <li>Your email provider&apos;s SMTP servers — when you send via SMTP (Gmail App Password, iCloud, Yahoo, etc.)</li>
        </ul>
        <p>
          Those providers process data under their own privacy policies. We only access the permissions
          you approve during sign-in.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <p>We use the information above solely to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide the App&apos;s features (compose, preview, and send emails)</li>
          <li>Maintain your signed-in session until it expires or you sign out</li>
          <li>Operate and protect the service (e.g. fix errors, prevent abuse)</li>
        </ul>
        <p>We do not sell your personal information.</p>
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          OAuth session cookies expire after about one hour. Data in localStorage remains until you
          delete it. Server logs are retained only as long as needed for operations and security.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <ul className="list-disc pl-5 space-y-1">
          <li>Sign out of Google or Microsoft from the App to revoke the session cookie</li>
          <li>Clear browser storage to remove saved templates and recipient lists</li>
          <li>Revoke the App&apos;s access anytime in your Google or Microsoft account security settings</li>
        </ul>
      </LegalSection>

      <LegalSection title="Children">
        <p>The App is not directed at children under 13. We do not knowingly collect information from children.</p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may update this policy from time to time. The &quot;Last updated&quot; date at the top will
          reflect the latest version.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For privacy questions about this App, contact the operator through the project repository
          or the support channel associated with your deployment of MailBridge.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
