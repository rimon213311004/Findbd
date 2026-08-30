import type { ReactNode } from 'react';
import { AuthProvider } from '../lib/auth';
import { Navbar } from '../components/navbar';
import './globals.css';

export const metadata = {
  title: 'FindBD — Lost & Found in Bangladesh',
  description: 'Bangladesh-focused lost & found platform with automatic Lost↔Found matching.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-ink text-paper antialiased">
        <AuthProvider>
          <Navbar />
          <main className="wall min-h-[calc(100vh-4rem)]">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
