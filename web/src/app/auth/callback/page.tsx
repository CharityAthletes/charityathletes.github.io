'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function CallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')

  useEffect(() => {
    const supabase = createClient()

    // onAuthStateChange fires as soon as the implicit-flow hash is parsed.
    // This is more reliable than getSession() which may run before parsing.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.replace('/dashboard')
      }
    })

    // Also check immediately — handles the case where session already exists
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
    })

    // Timeout fallback — if nothing happens in 5s, show error
    const timeout = setTimeout(() => setStatus('error'), 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [router])

  if (status === 'error') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="font-semibold text-gray-800">サインインに失敗しました</p>
          <p className="text-sm text-gray-500 mt-2">もう一度お試しください。</p>
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
        <img src="/icon-1024.png" alt="Charity Athletes" className="w-20 h-20 mx-auto rounded-2xl shadow-lg mb-3 animate-pulse" />
        <p className="text-gray-500 text-sm">サインイン中...</p>
      </div>
    </div>
  )
}
