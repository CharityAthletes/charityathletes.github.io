'use client'
import { useEffect, useState } from 'react'
import { getAdminStats, getAdminNonprofits, approveNonprofit, rejectNonprofit } from '@/lib/api'
import type { PlatformStats, AdminNonprofitRow } from '@/lib/types'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

function fmt(n: number) { return n.toLocaleString('ja-JP') }

export default function AdminPage() {
  const { token, me, loading: authLoading } = useAuth()
  const router = useRouter()

  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [nonprofits, setNonprofits] = useState<AdminNonprofitRow[]>([])
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (me && me.role !== 'admin') { router.replace('/'); return }
  }, [me, authLoading, router])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    Promise.all([
      getAdminStats(token),
      getAdminNonprofits(token, statusFilter),
    ]).then(([s, n]) => { setStats(s); setNonprofits(n) })
      .catch(console.error).finally(() => setLoading(false))
  }, [token, statusFilter])

  const handleApprove = async (id: string) => {
    if (!token) return
    setActionId(id)
    try { await approveNonprofit(id, token); setNonprofits(n => n.filter(r => r.id !== id)) }
    catch (e: any) { alert(e.message) }
    setActionId(null)
  }

  const handleReject = async (id: string) => {
    const reason = prompt('却下理由を入力してください:')
    if (!reason || !token) return
    setActionId(id)
    try { await rejectNonprofit(id, reason, token); setNonprofits(n => n.filter(r => r.id !== id)) }
    catch (e: any) { alert(e.message) }
    setActionId(null)
  }

  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-xl font-bold text-gray-900">管理者ダッシュボード</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'ユーザー数', value: fmt(stats?.totalUsers ?? 0) },
          { label: 'キャンペーン数', value: fmt(stats?.totalCampaigns ?? 0) },
          { label: '合計距離', value: `${fmt(stats?.totalKm ?? 0)} km` },
          { label: '合計寄付額', value: `¥${fmt(stats?.totalRaisedJpy ?? 0)}` },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className="text-lg font-bold text-orange-500">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Nonprofits */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-800">団体一覧</h2>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            <option value="pending">審査中</option>
            <option value="approved">承認済み</option>
            <option value="rejected">却下</option>
          </select>
        </div>

        {nonprofits.length === 0 ? (
          <p className="text-sm text-gray-400">該当する団体はありません。</p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50">
            {nonprofits.map(n => (
              <div key={n.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{n.nameJa}</p>
                  <p className="text-xs text-gray-400">{n.email}</p>
                </div>
                {statusFilter === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleApprove(n.id)}
                      disabled={actionId === n.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-green-500 hover:bg-green-600 disabled:opacity-50 transition"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleReject(n.id)}
                      disabled={actionId === n.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-50 transition"
                    >
                      却下
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
