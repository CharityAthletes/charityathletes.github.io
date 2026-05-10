'use client'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

export default function Navbar() {
  const { me, loading, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  return (
    <nav className="sticky top-0 z-50 text-white" style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}>
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-white tracking-tight">
            Charity Athletes
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {!loading && (
            <>
              {me ? (
                <>
                  {me.role === 'admin' && (
                    <Link href="/admin" className="text-sm text-white/80 hover:text-white">
                      Admin
                    </Link>
                  )}
                  {me.role === 'nonprofit' && (
                    <Link href="/nonprofit" className="text-sm text-white/80 hover:text-white">
                      Dashboard
                    </Link>
                  )}
                  {me.role === 'athlete' && (
                    <Link href="/dashboard" className="text-sm text-white/80 hover:text-white">
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-white/60 hover:text-white"
                  >
                    Sign out
                  </button>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: '#1A9966' }}>
                    {(me.displayName ?? me.email)[0].toUpperCase()}
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-1.5 rounded-full text-sm font-semibold text-white border border-white/40 hover:bg-white/10 transition"
                >
                  Sign in
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
