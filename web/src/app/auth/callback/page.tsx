'use client'
// Handles the OAuth redirect back from Supabase (Google etc.)
// Runs entirely in the browser so it can read the PKCE verifier and set the session.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function CallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const code = new URLSearchParams(window.location.search).get('code')

    if (!code) {
      // No code — check if there's already a valid session (e.g. magic link clicked)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) router.replace('/dashboard')
        else { setError('No auth code found.'); }
      })
      return
    }

    supabase.auth.exchangeCodeForSession(code).then(({ data, error }) => {
      if (error) {
        console.error('Auth exchange error:', error)
        setError(error.message)
      } else if (data.session) {
        router.replace('/dashboard')
      } else {
        setError('Session could not be established.')
      }
    })
  }, [router])

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-800">サインインに失敗しました</p>
          <p className="text-sm text-gray-500 mt-1">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, #0D2659, #054738)' }}
          >
            ログインページに戻る
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">🏃</div>
        <p className="text-gray-500 text-sm">サインイン中...</p>
      </div>
    </div>
  )
}
