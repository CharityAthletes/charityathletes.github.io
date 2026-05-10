import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth-context'
import { LangProvider } from '@/lib/lang-context'
import Navbar from '@/components/Navbar'
import TabBar from '@/components/TabBar'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Charity Athletes',
  description: 'Run for a cause — チャリティのために走ろう',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png',   sizes: '192x192', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" style={{ colorScheme: 'light' }}>
      <body className={`${geist.className} bg-gray-50 min-h-screen`}>
        <AuthProvider>
          <LangProvider>
            <Navbar />
            {/* pb-20 keeps content above the fixed tab bar */}
            <main className="pb-20">{children}</main>
            <TabBar />
          </LangProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
