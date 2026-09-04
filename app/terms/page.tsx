import { LegalLayout, LegalSection } from '@/components/legal-layout';

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service" subtitle="Last updated: May 28, 2026">
      <p>
        By using MailBridge (&quot;the App&quot;), you agree to these Terms of Service. If you do not
        agree, do not use the App.
      </p>

      <LegalSection title="What the App does">
        <p>
          The App is a tool that lets you connect your own email account (via OAuth or SMTP) to
          compose and send personalized messages to recipients you provide. You are responsible for
          the content you send and for complying with applicable laws.
        </p>
      </LegalSection>

      <LegalSection title="Your responsibilities">
        <ul className="list-disc pl-5 space-y-1">
          <li>You must have permission to email each recipient</li>
          <li>You must comply with anti-spam laws (e.g. CAN-SPAM, GDPR where applicable) and your provider&apos;s policies</li>
          <li>You must not use the App for phishing, malware, harassment, or illegal content</li>
          <li>You are responsible for securing your device, App Passwords, and account credentials</li>
          <li>You must only connect email accounts you are authorized to use</li>
        </ul>
      </LegalSection>

      <LegalSection title="Third-party services">
        <p>
          The App integrates with Google, Microsoft, and other email providers. Your use of those
          services is also governed by their terms. We are not affiliated with Google, Microsoft,
          or other providers except as necessary to offer the App&apos;s features.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The App is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, whether
          express or implied, including fitness for a particular purpose or uninterrupted operation.
          Email delivery, inbox placement, and provider availability are not guaranteed.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, the operators of the App shall not be liable for
          any indirect, incidental, special, or consequential damages, or for lost data, failed
          deliveries, account restrictions imposed by email providers, or misuse of the App by you
          or others.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>We may suspend or restrict access if we reasonably believe you are:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Sending unsolicited bulk email (spam)</li>
          <li>Violating these Terms or applicable law</li>
          <li>Abusing the service or harming other users or providers</li>
        </ul>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          We may modify these Terms at any time. Continued use of the App after changes are posted
          constitutes acceptance of the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These Terms are governed by applicable local laws where the App is operated, without
          regard to conflict-of-law principles.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          For questions about these Terms, contact the operator through the project repository
          or the support channel associated with your deployment of MailBridge.
        </p>
      </LegalSection>
    </LegalLayout>
  );
}
