// ─── Database row shapes ──────────────────────────────────────────────────────

export interface DbUserProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  preferred_language: 'ja' | 'en';
  strava_athlete_id: number | null;
  stripe_customer_id: string | null;
  total_distance_km: number;
  total_donated_jpy: number;
}

export interface DbStravaToken {
  id: string;
  user_id: string;
  athlete_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
}

export interface DbActivity {
  id: string;
  user_id: string;
  strava_activity_id: string;
  name: string;
  sport_type: string;
  distance_meters: number;
  moving_time_seconds: number;
  start_date: string;
  is_processed: boolean;
}

export interface DbCampaign {
  id: string;
  nonprofit_id: string;
  title_ja: string;
  title_en: string;
  sport_types: string[];
  flat_amount_jpy: number | null;
  per_km_rate_jpy: number | null;
  suggested_per_km_jpy: number[];
  donorbox_campaign_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export interface DbCampaignParticipation {
  id: string;
  campaign_id: string;
  user_id: string;
  pledge_flat_enabled: boolean;
  pledge_per_km_jpy: number | null;
  total_distance_km: number;
  total_donated_jpy: number;
  stripe_customer_id: string | null;
}

export interface DbDonation {
  id: string;
  user_id: string;
  campaign_id: string;
  participation_id: string;
  activity_id: string | null;
  flat_amount_jpy: number;
  per_km_amount_jpy: number;
  distance_km: number | null;
  stripe_payment_intent_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
}

// ─── Strava API shapes ────────────────────────────────────────────────────────

export interface StravaWebhookEvent {
  aspect_type: 'create' | 'update' | 'delete';
  event_time: number;
  object_id: number;
  object_type: 'activity' | 'athlete';
  owner_id: number;
  subscription_id: number;
  updates?: Record<string, string>;
}

export interface StravaDetailedActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  distance: number;         // meters
  moving_time: number;      // seconds
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;       // ISO8601
  map: { summary_polyline: string | null };
  average_speed: number;    // m/s
  max_speed: number;
  average_heartrate?: number;
}

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
    profile: string;
  };
}

// ─── Donorbox API shapes ─────────────────────────────────────────────────────

export interface DonorboxCampaign {
  id: number;
  name: string;
  goal: number;
  total_raised: number;
  donations_count: number;
  currency: string;
  url: string;
}

// ─── Express augmentation ────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}
