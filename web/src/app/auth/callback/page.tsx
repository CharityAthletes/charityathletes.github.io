'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function CallbackPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    // With implicit flow, Supabase puts tokens in the URL hash.
    // getSession() automatically parses them and establishes the session.
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setError(error.message)
      } else if (session) {
        router.replace('/dashboard')
      } else {
        // Short delay then retry once — hash may not be parsed yet
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.replace('/dashboard')
            else setError('セッションを確立できませんでした。もう一度お試しください。')
          })
        }, 500)
      }
    })
  }, [router])

  if (error) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-800">サインインに失敗しました</p>
          <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">{error}</p>
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
