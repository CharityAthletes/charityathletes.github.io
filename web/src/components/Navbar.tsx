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
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold bg-gradient-to-r from-orange-500 to-red-500 bg-clip-text text-transparent">
            Charity Athletes
          </span>
        </Link>

        <div className="flex items-center gap-4">
          {!loading && (
            <>
              {me ? (
                <>
                  {me.role === 'admin' && (
                    <Link href="/admin" className="text-sm text-gray-600 hover:text-orange-500">
                      Admin
                    </Link>
                  )}
                  {me.role === 'nonprofit' && (
                    <Link href="/nonprofit" className="text-sm text-gray-600 hover:text-orange-500">
                      Dashboard
                    </Link>
                  )}
                  {me.role === 'athlete' && (
                    <Link href="/dashboard" className="text-sm text-gray-600 hover:text-orange-500">
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="text-sm text-gray-500 hover:text-red-500"
                  >
                    Sign out
                  </button>
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                    {(me.displayName ?? me.email)[0].toUpperCase()}
                  </div>
                </>
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-r from-orange-500 to-red-500 text-white hover:opacity-90 transition-opacity"
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
