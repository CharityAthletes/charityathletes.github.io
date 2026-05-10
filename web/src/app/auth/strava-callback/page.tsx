'use client'
// Handles the redirect back from the backend after Strava OAuth.
// The backend appends ?access_token=...&refresh_token=... to this URL.
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Suspense } from 'react'

function StravaCallbackInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const error = params.get('error')

    if (error) {
      setErrorMsg(`Strava login failed: ${error}`)
      setStatus('error')
      return
    }

    if (!accessToken || !refreshToken) {
      setErrorMsg('Missing session tokens from Strava login.')
      setStatus('error')
      return
    }

    const supabase = createClient()
    supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) { setErrorMsg(error.message); setStatus('error') }
        else router.replace('/dashboard')
      })
  }, [params, router])

  if (status === 'error') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-800">サインインに失敗しました</p>
          <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
          <button
            onClick={() => router.push('/login')}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-orange-500 to-red-500"
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
        <p className="text-gray-500 text-sm">Stravaでサインイン中...</p>
      </div>
    </div>
  )
}

export default function StravaCallbackPage() {
  return (
    <Suspense>
      <StravaCallbackInner />
    </Suspense>
  )
}
