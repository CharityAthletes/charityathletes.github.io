'use client'
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from './supabase'
import { getMe } from './api'
import type { MeResponse } from './types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  me: MeResponse | null
  token: string | null
  loading: boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null, user: null, me: null, token: null, loading: true,
  signOut: async () => {}, refresh: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(async (s: Session | null) => {
    if (!s) { setMe(null); return }
    try { setMe(await getMe(s.access_token)) } catch { setMe(null) }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      loadMe(s).finally(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      loadMe(s)
    })
    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    await supabase.auth.signOut()
    setSession(null); setMe(null)
  }

  const refresh = async () => {
    const { data: { session: s } } = await supabase.auth.getSession()
    setSession(s)
    await loadMe(s)
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, me,
      token: session?.access_token ?? null,
      loading, signOut, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
