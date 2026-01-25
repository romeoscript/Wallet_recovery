import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const interMono = Inter({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NullSet | Solana Rent Recovery',
  description: 'Find the money you forgot you had. Reclaim rent from empty token accounts and consolidate dust across your derived wallets.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${interMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
