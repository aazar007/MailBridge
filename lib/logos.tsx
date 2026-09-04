export function GmailLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#fbc02d" d="M45 12.3V16.2l-10 7.5V11.2l3.1-2.3c.8-.6 1.7-.9 2.6-.9C43.1 8 45 9.9 45 12.3z"/>
      <path fill="#c62828" d="M3 12.3V16.2l10 7.5V11.2L9.9 8.9C9.1 8.3 8.2 8 7.3 8 4.9 8 3 9.9 3 12.3z"/>
      <path fill="#1e88e5" d="M3 16.2l3.6 1.7L13 23.7V40H6c-1.7 0-3-1.3-3-3V16.2z"/>
      <path fill="#4caf50" d="M45 16.2l-5 2.75-5 4.75L35 40h7c1.7 0 3-1.3 3-3V16.2z"/>
      <polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/>
    </svg>
  );
}

export function OutlookLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect x="1" y="1" width="10" height="10" rx="1" fill="#f25022"/>
      <rect x="13" y="1" width="10" height="10" rx="1" fill="#7fba00"/>
      <rect x="1" y="13" width="10" height="10" rx="1" fill="#00a4ef"/>
      <rect x="13" y="13" width="10" height="10" rx="1" fill="#ffb900"/>
    </svg>
  );
}

export function YahooLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <rect width="24" height="24" rx="5" fill="#6001D2"/>
      <text x="12" y="17" textAnchor="middle" fill="white" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="bold">Y!</text>
    </svg>
  );
}

export function ICloudLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id="icloud-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5AC8FA"/>
          <stop offset="100%" stopColor="#007AFF"/>
        </linearGradient>
      </defs>
      <path fill="url(#icloud-grad)" d="M19.4 10.1c-.3-3.4-3.1-6.1-6.6-6.1-2.5 0-4.8 1.4-5.9 3.6C4.9 8 3 10.2 3 12.8 3 15.7 5.3 18 8.2 18h10.8c2.2 0 4-1.8 4-4 0-1.9-1.3-3.5-3.6-3.9z"/>
    </svg>
  );
}

export function CustomSmtpLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.1 4.9C21 6.9 22 9.4 22 12s-1 5.1-2.9 7.1M4.9 19.1C3 17.1 2 14.6 2 12s1-5.1 2.9-7.1"/>
      <path d="M14.8 9.2c.8.8 1.2 1.8 1.2 2.8s-.4 2-.8 2.8M9.2 14.8c-.8-.8-1.2-1.8-1.2-2.8s.4-2 .8-2.8"/>
    </svg>
  );
}

export function PaperPlaneLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}>
      <polygon points="18,54 82,8 56,52" fill="#d0d0d0"/>
      <polygon points="56,52 82,8 62,92" fill="#e8e8e8"/>
      <polygon points="18,54 82,8 62,92" fill="#b0b0b0"/>
      <polygon points="18,54 56,52 44,68" fill="#c0c0c0"/>
    </svg>
  );
}
