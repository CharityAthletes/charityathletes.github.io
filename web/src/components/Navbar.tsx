'use client'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import Link from 'next/link'

export default function Navbar() {
  const { me, loading } = useAuth()
  const { lang, toggle, t } = useLang()

  return (
    <nav className="sticky top-0 z-50 text-white" style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
      <div className="max-w-lg mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="text-base font-bold text-white tracking-tight">
          Charity Athletes
        </Link>

        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <button
            onClick={toggle}
            className="px-3 py-1 rounded-full text-xs font-semibold border border-white/30 text-white bg-white/10 hover:bg-white/20 transition"
          >
            {lang === 'ja' ? 'English' : '日本語'}
          </button>

          {/* Admin badge */}
          {!loading && me?.role === 'admin' && (
            <Link href="/admin" className="text-xs text-white/70 hover:text-white">Admin</Link>
          )}
        </div>
      </div>
    </nav>
  )
}
