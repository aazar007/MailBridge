import Image from 'next/image';

export function AppLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <Image
      src="/auto-sender-logo.png"
      alt="MailBridge"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      priority
    />
  );
}
