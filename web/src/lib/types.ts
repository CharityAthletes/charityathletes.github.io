// Mirrors Models.swift — keep in sync with backend responses

export interface Campaign {
  id: string
  titleJa: string
  titleEn: string
  descriptionJa: string
  descriptionEn: string
  goalKm: number
  goalAmountJpy?: number
  maxDistanceKm?: number
  startDate: string
  endDate: string
  status: 'active' | 'archived' | 'completed'
  createdBy: string
  nonprofitId: string
  totalKm?: number
  totalRaisedJpy?: number
  participantCount?: number
  nonprofitName?: string
  nonprofitLogoUrl?: string
  coverImageUrl?: string
  pledgeFlatEnabled?: boolean
  hasFlatDonation?: boolean
  hasPerKmDonation?: boolean
  pledgePerKmJpy?: number
  suggestedPerKmJpy?: number
  isPublic?: boolean
}

export interface CampaignParticipation {
  id: string
  campaignId: string
  userId: string
  pledgeFlatEnabled: boolean
  pledgePerKmJpy?: number
  totalKm: number
  joinedAt: string
}

export interface LeaderboardEntry {
  userId: string
  displayName: string
  avatarUrl?: string
  totalKm: number
  rank: number
}

export interface CampaignUpdate {
  id: string
  campaignId?: string
  userId?: string
  message: string
  photoUrl?: string
  createdAt: string
  userProfiles?: { displayName: string; avatarUrl?: string } | null
}

export interface DonorPledge {
  id: string
  donorName: string
  isAnonymous: boolean
  perKmRateJpy: number
  createdAt: string
}

export interface CampaignParticipant {
  userId: string
  displayName: string
  avatarUrl?: string
  totalKm: number
  pledgePerKmJpy?: number
}

export interface Nonprofit {
  id: string
  nameJa: string
  nameEn: string
  descriptionJa?: string
  descriptionEn?: string
  logoUrl?: string
  websiteUrl?: string
}

export interface Charity {
  id: string
  nameJa: string
  nameEn: string
  descriptionJa?: string
  descriptionEn?: string
  logoUrl?: string
  websiteUrl?: string
  category?: string
  isFeatured?: boolean
  donorboxCampaignId?: string
  isActive?: boolean
}

export interface Donation {
  id: string
  campaignTitleJa: string
  campaignTitleEn: string
  amountJpy: number
  flatAmountJpy?: number | null
  perKmAmountJpy?: number | null
  distanceKm?: number | null
  triggerType?: string | null
  status: string
  createdAt: string
}

export interface DonationSummary {
  totalJpy: number
  donationCount: number
  totalDistanceKm?: number
}

export interface MeResponse {
  id: string
  email: string
  role: 'athlete' | 'nonprofit' | 'admin'
  displayName?: string
  avatarUrl?: string
  stravaConnected: boolean
}

export interface NonprofitProfile {
  id: string
  nameJa: string
  nameEn: string
  descriptionJa?: string
  descriptionEn?: string
  logoUrl?: string
  websiteUrl?: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface NonprofitDashboard {
  totalRaisedJpy: number
  activeCampaigns: number
  totalDonors: number
  recentDonations: Donation[]
}

export interface FinalizeResult {
  totalKm: number
  totalRaisedJpy: number
  donorCount: number
}

export interface AdminNonprofitRow {
  id: string
  nameJa: string
  nameEn: string
  email: string
  status: string
  createdAt: string
}

export interface Activity {
  id: string
  name: string
  sportType: string
  distanceMeters: number
  movingTimeSeconds: number
  totalElevationGain?: number
  averageHeartrate?: number
  startDate: string
  stravaActivityId?: number
}

export interface PlatformStats {
  totalUsers: number
  totalCampaigns: number
  totalRaisedJpy: number
  totalKm: number
}
