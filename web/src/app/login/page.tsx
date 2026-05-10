'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

const BRAND_GRADIENT = 'linear-gradient(135deg, #0D2659, #054738)'
const BRAND_GREEN    = '#1A9966'

export default function LoginPage() {
  const { session } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState<'google' | 'strava' | 'magic' | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (session) router.replace('/dashboard')
  }, [session, router])

  const handleGoogle = async () => {
    setLoading('google'); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setLoading(null) }
  }

  const handleStrava = async () => {
    setLoading('strava'); setError('')
    try {
      const callbackUrl = encodeURIComponent(`${window.location.origin}/auth/strava-callback`)
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/auth/strava/login?web_redirect=${callbackUrl}`)
      if (!res.ok) throw new Error('Failed to start Strava login')
      const { url } = await res.json()
      window.location.href = url
    } catch (e: any) { setError(e.message); setLoading(null) }
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('magic'); setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(null)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8 py-8 rounded-2xl" style={{ background: BRAND_GRADIENT }}>
          <img src="/icon-1024.png" alt="Charity Athletes" className="w-20 h-20 mx-auto rounded-2xl shadow-lg" />
          <h1 className="text-2xl font-bold mt-3 text-white">Charity Athletes</h1>
          <p className="text-white/70 text-sm mt-1">サインインしてください</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-3">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📧</div>
              <p className="font-semibold text-gray-800">メールを確認してください</p>
              <p className="text-sm text-gray-500 mt-1">{email} にサインインリンクを送りました。</p>
            </div>
          ) : (
            <>
              {/* Strava */}
              <button
                onClick={handleStrava}
                disabled={!!loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg font-semibold text-white disabled:opacity-60 transition hover:opacity-90"
                style={{ backgroundColor: '#FC4C02' }}
              >
                {loading === 'strava' ? <span className="text-sm">接続中...</span> : <><StravaIcon /><span className="text-sm">Stravaでサインイン</span></>}
              </button>

              {/* Google */}
              <button
                onClick={handleGoogle}
                disabled={!!loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 disabled:opacity-60 transition"
              >
                {loading === 'google' ? <span className="text-sm">接続中...</span> : <><GoogleIcon /><span className="text-sm">Googleでサインイン</span></>}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400">または</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Magic link */}
              <form onSubmit={handleMagicLink} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="メールアドレス"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
                />
                <button
                  type="submit"
                  disabled={!!loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  style={{ background: BRAND_GRADIENT }}
                >
                  {loading === 'magic' ? '送信中...' : 'メールでサインイン'}
                </button>
              </form>

              {error && <p className="text-red-500 text-xs text-center">{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function StravaIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 0 9.871h4.172" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}
