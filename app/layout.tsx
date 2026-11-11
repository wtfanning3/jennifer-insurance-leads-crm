import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'Leads CRM - Jennifer Richardson Fanning Insurance Agency',
  description: 'SmartFinancial insurance leads, texting and follow-ups.',
  icons: { icon: '/icon.png' },
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
