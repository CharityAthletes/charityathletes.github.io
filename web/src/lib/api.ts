// API client — mirrors APIClient.swift, calls the same Railway backend
import type {
  Campaign, CampaignParticipation, CampaignUpdate, DonorPledge,
  CampaignParticipant, Nonprofit, Donation, DonationSummary,
  MeResponse, LeaderboardEntry, NonprofitProfile, NonprofitDashboard,
  FinalizeResult, AdminNonprofitRow, PlatformStats,
} from './types'

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL!

export class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401) throw new APIError(401, 'Unauthorized — please sign in again')

  if (!res.ok) {
    let msg = `Error ${res.status}`
    try { msg = (await res.json()).error ?? msg } catch {}
    throw new APIError(res.status, msg)
  }

  return res.json()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const getMe = (token: string) =>
  request<MeResponse>('/auth/me', {}, token)

export const stravaLoginURL = (token: string) =>
  request<{ url: string }>('/auth/strava/login', {}, token).then(r => r.url)

// ── Campaigns ─────────────────────────────────────────────────────────────────

export const getCampaigns = (token?: string) =>
  request<Campaign[]>('/campaigns', {}, token)

export const getCampaign = (id: string, token?: string) =>
  request<Campaign>(`/campaigns/${id}`, {}, token)

export const getMyCampaigns = (token: string) =>
  request<Campaign[]>('/campaigns/mine', {}, token)

export const getCreatedCampaigns = (token: string) =>
  request<Campaign[]>('/campaigns/created', {}, token)

export const createCampaign = (body: unknown, token: string) =>
  request<Campaign>('/campaigns', { method: 'POST', body: JSON.stringify(body) }, token)

export const updateCampaign = (id: string, body: unknown, token: string) =>
  request<Campaign>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token)

export const deleteCampaign = (id: string, token: string) =>
  request<{ ok: boolean }>(`/campaigns/${id}`, { method: 'DELETE' }, token)

export const archiveCampaign = (id: string, token: string) =>
  request<{ ok: boolean }>(`/campaigns/${id}/archive`, { method: 'PATCH' }, token)

export const finalizeCampaign = (id: string, token: string) =>
  request<FinalizeResult>(`/campaigns/${id}/finalize`, { method: 'POST', body: '{}' }, token)

export const joinCampaign = (
  id: string,
  flatEnabled: boolean,
  perKmJpy: number | null,
  token: string
) =>
  request<CampaignParticipation>(
    `/campaigns/${id}/join`,
    { method: 'POST', body: JSON.stringify({ pledgeFlatEnabled: flatEnabled, pledgePerKmJpy: perKmJpy }) },
    token
  )

export const unjoinCampaign = (id: string, token: string) =>
  request<{ ok: boolean }>(`/campaigns/${id}/join`, { method: 'DELETE' }, token)

export const getLeaderboard = (id: string, token?: string) =>
  request<LeaderboardEntry[]>(`/campaigns/${id}/leaderboard`, {}, token)

export const getCampaignPledges = (id: string, token: string) =>
  request<DonorPledge[]>(`/campaigns/${id}/pledges`, {}, token)

export const getCampaignParticipants = (id: string, token?: string) =>
  request<CampaignParticipant[]>(`/campaigns/${id}/participants`, {}, token)

export const getCampaignUpdates = (id: string, token?: string) =>
  request<CampaignUpdate[]>(`/campaigns/${id}/updates`, {}, token)

export const postCampaignUpdate = (
  id: string,
  message: string,
  photoUrl: string | null,
  token: string
) =>
  request<CampaignUpdate>(
    `/campaigns/${id}/updates`,
    { method: 'POST', body: JSON.stringify({ message, photo_url: photoUrl }) },
    token
  )

export const deleteCampaignUpdate = (id: string, updateId: string, token: string) =>
  request<{ ok: boolean }>(`/campaigns/${id}/updates/${updateId}`, { method: 'DELETE' }, token)

export const sendThankYou = (campaignId: string, message: string, token: string) =>
  request<{ ok: boolean; sentTo: number }>(
    `/campaigns/${campaignId}/thankyou`,
    { method: 'POST', body: JSON.stringify({ message }) },
    token
  )

// ── Nonprofits ────────────────────────────────────────────────────────────────

export const getNonprofits = (token?: string) =>
  request<Nonprofit[]>('/nonprofits', {}, token)

// ── Donations ─────────────────────────────────────────────────────────────────

export const getDonations = (token: string) =>
  request<Donation[]>('/donations', {}, token)

export const getDonationSummary = (token: string) =>
  request<DonationSummary>('/donations/summary', {}, token)

// ── Nonprofit ─────────────────────────────────────────────────────────────────

export const getNonprofitProfile = (token: string) =>
  request<NonprofitProfile>('/nonprofit/profile', {}, token)

export const getNonprofitDashboard = (token: string) =>
  request<NonprofitDashboard>('/nonprofit/dashboard', {}, token)

export const getNonprofitCampaigns = (token: string) =>
  request<Campaign[]>('/nonprofit/campaigns', {}, token)

// ── Admin ─────────────────────────────────────────────────────────────────────

export const getAdminStats = (token: string) =>
  request<PlatformStats>('/admin/stats', {}, token)

export const getAdminNonprofits = (token: string, status?: string) =>
  request<AdminNonprofitRow[]>(
    status ? `/admin/nonprofits?status=${status}` : '/admin/nonprofits',
    {},
    token
  )

export const approveNonprofit = (id: string, token: string) =>
  request<{ ok: boolean }>(`/admin/nonprofits/${id}/approve`, { method: 'POST', body: '{}' }, token)

export const rejectNonprofit = (id: string, reason: string, token: string) =>
  request<{ ok: boolean }>(
    `/admin/nonprofits/${id}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    token
  )
