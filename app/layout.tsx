import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { RouteTransitionProvider } from '@/components/route-transition-provider';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MailBridge',
  description: 'MailBridge — send personalized emails to multiple recipients. Arabic & English supported.',
  icons: { icon: '/auto-sender-logo.png' },
  verification: {
    google: 'nbxmnq9ybjojewqXwXrGbHAwo2OWj7c9tEioO6QPLrM',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}>
      <body>
        <RouteTransitionProvider>{children}</RouteTransitionProvider>
      </body>
    </html>
  );
}
