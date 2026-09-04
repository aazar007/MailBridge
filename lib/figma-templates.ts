export type FigmaTemplateId =
  | 'welcome'
  | 'newsletter'
  | 'promotion'
  | 'followup'
  | 'announcement'
  | 'blank';

export const FIGMA_TEMPLATES: {
  id: FigmaTemplateId;
  name: string;
  desc: string;
  subject: string;
  body: string;
}[] = [
  {
    id: 'welcome',
    name: 'Welcome Email',
    desc: 'Greet new subscribers',
    subject: 'Welcome to {{company}} — We\'re glad you\'re here!',
    body: `Hi {{first_name}},

Welcome aboard! We're thrilled to have you with us at {{company}}.

Your account is all set. Here's what to do next:
  • Explore features at your own pace
  • Complete your profile for a personalized experience
  • Reply to this email with any questions

We're here every step of the way.

Warm regards,
The {{company}} Team`,
  },
  {
    id: 'newsletter',
    name: 'Newsletter',
    desc: 'Monthly or weekly updates',
    subject: '{{company}} Newsletter — {{month}} {{year}}',
    body: `Hello {{first_name}},

Here's what's new at {{company}} this month:

HIGHLIGHTS
  • Improved dashboard with new analytics tools
  • Community spotlight — hear from top users
  • Upcoming webinar on {{date}} — register now

BY THE NUMBERS
We served 10,000+ customers this month. Thank you.

Best,
{{sender_name}}`,
  },
  {
    id: 'promotion',
    name: 'Sales Promotion',
    desc: 'Offers, discounts, and deals',
    subject: '{{first_name}}, your exclusive {{discount}}% off expires soon',
    body: `Hi {{first_name}},

We have something special just for you.

  {{discount}}% OFF YOUR NEXT ORDER
  Code: {{promo_code}}
  Expires: {{expiry_date}}

✓ Free shipping over $50
✓ 30-day hassle-free returns
✓ 24/7 customer support

Happy shopping,
{{company}} Team`,
  },
  {
    id: 'followup',
    name: 'Follow-up',
    desc: 'Re-engage inactive contacts',
    subject: 'We miss you, {{first_name}} — here\'s what you\'ve missed',
    body: `Hi {{first_name}},

We noticed you haven't visited in a while and wanted to check in.

Since your last visit:
  • 3 new features launched based on your feedback
  • Support is now available 24/7
  • Load time reduced by 40%

We'd love to have you back. Reply anytime — we read every message.

Best,
{{sender_name}}`,
  },
  {
    id: 'announcement',
    name: 'Announcement',
    desc: 'Product launches and news',
    subject: 'Introducing {{product_name}} from {{company}}',
    body: `Hi {{first_name}},

Today is a big day. We're officially launching {{product_name}}.

It lets you {{value_proposition}} in a fraction of the time.

  → Try it free for 14 days
  → Watch the 3-minute demo
  → Read the full announcement on our blog

With excitement,
{{sender_name}}
{{company}}`,
  },
  {
    id: 'blank',
    name: 'Blank',
    desc: 'Start from scratch',
    subject: '',
    body: '',
  },
];
