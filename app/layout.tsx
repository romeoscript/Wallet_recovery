import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import WalletContextProvider from '@/components/WalletContextProvider';

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
  title: 'Glean | Solana Rent Recovery',
  description: 'Find the money you forgot you had. Reclaim rent from empty token accounts and recover hidden SOL.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${interMono.variable}`}>
      <body>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
