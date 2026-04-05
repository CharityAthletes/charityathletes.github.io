import axios from 'axios';
import { db } from '../config/supabase';
import type { StravaDetailedActivity, StravaTokenResponse } from '../types';

const API = 'https://www.strava.com/api/v3';
const TOKEN_URL = 'https://www.strava.com/oauth/token';

export const stravaService = {
  // ── OAuth ────────────────────────────────────────────────────────────────

  authorizationUrl(state: string): string {
    const p = new URLSearchParams({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      redirect_uri:  process.env.STRAVA_REDIRECT_URI!,
      response_type: 'code',
      approval_prompt: 'auto',
      scope:         'read,activity:read_all',
      state,
    });
    return `https://www.strava.com/oauth/authorize?${p}`;
  },

  async exchangeCode(code: string): Promise<StravaTokenResponse> {
    const { data } = await axios.post<StravaTokenResponse>(TOKEN_URL, {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });
    return data;
  },

  async refreshToken(refreshToken: string): Promise<Pick<StravaTokenResponse, 'access_token' | 'refresh_token' | 'expires_at'>> {
    const { data } = await axios.post(TOKEN_URL, {
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    });
    return data;
  },

  // ── Token management ──────────────────────────────────────────────────────

  async getValidAccessToken(userId: string): Promise<string> {
    const { data: t, error } = await db
      .from('strava_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !t) throw new Error(`No Strava token for user ${userId}`);

    if (t.expires_at - Math.floor(Date.now() / 1000) < 300) {
      const refreshed = await this.refreshToken(t.refresh_token);
      await db.from('strava_tokens').update({
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at:    refreshed.expires_at,
        updated_at:    new Date().toISOString(),
      }).eq('user_id', userId);
      return refreshed.access_token;
    }
    return t.access_token;
  },

  // ── Activity sync ─────────────────────────────────────────────────────────

  /** Fetch one activity from Strava and upsert it; returns the local activity id. */
  async syncActivity(athleteId: number, stravaActivityId: number): Promise<{ activityId: string; userId: string } | null> {
    const { data: tokenRow } = await db
      .from('strava_tokens')
      .select('user_id')
      .eq('athlete_id', athleteId)
      .single();

    if (!tokenRow) {
      console.warn(`[Strava] No user found for athlete ${athleteId}`);
      return null;
    }

    const userId = tokenRow.user_id as string;
    const accessToken = await this.getValidAccessToken(userId);

    const { data: raw } = await axios.get<StravaDetailedActivity>(
      `${API}/activities/${stravaActivityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const { data, error } = await db
      .from('activities')
      .upsert({
        user_id:             userId,
        strava_activity_id:  stravaActivityId.toString(),
        name:                raw.name,
        sport_type:          raw.sport_type,
        distance_meters:     raw.distance,
        moving_time_seconds: raw.moving_time,
        elapsed_time_seconds: raw.elapsed_time,
        total_elevation_gain: raw.total_elevation_gain,
        start_date:          raw.start_date,
        map_polyline:        raw.map?.summary_polyline ?? null,
        average_speed_mps:   raw.average_speed,
        max_speed_mps:       raw.max_speed,
        average_heartrate:   raw.average_heartrate ?? null,
        is_processed:        false,
      }, { onConflict: 'strava_activity_id' })
      .select('id')
      .single();

    if (error) throw error;
    return { activityId: data.id, userId };
  },

  /** Soft-delete a Strava activity (delete event). */
  async markActivityDeleted(stravaActivityId: number): Promise<void> {
    await db
      .from('activities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('strava_activity_id', stravaActivityId.toString());
  },
};
