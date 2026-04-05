/**
 * Donorbox integration.
 *
 * Each nonprofit has their own Donorbox account.
 * We use the Donorbox REST API (Basic auth with master key) to:
 *   - Fetch campaign details for display
 *   - Record donation metadata for reconciliation
 *
 * Actual payment processing goes through Stripe (off_session charges).
 * After a successful Stripe charge we write a reconciliation record
 * and optionally call Donorbox's donation import if the plan supports it.
 */
import axios, { AxiosInstance } from 'axios';
import type { DonorboxCampaign } from '../types';

const DONORBOX_BASE = 'https://donorbox.org/api/v1';

function donorboxClient(accountEmail: string, apiKey: string): AxiosInstance {
  const credentials = Buffer.from(`${accountEmail}:${apiKey}`).toString('base64');
  return axios.create({
    baseURL: DONORBOX_BASE,
    headers: { Authorization: `Basic ${credentials}` },
  });
}

export const donorboxService = {
  /** Fetch all campaigns for a nonprofit's Donorbox account. */
  async getCampaigns(accountEmail: string, apiKey: string): Promise<DonorboxCampaign[]> {
    const client = donorboxClient(accountEmail, apiKey);
    const { data } = await client.get<DonorboxCampaign[]>('/campaigns');
    return data;
  },

  /** Fetch a single campaign. */
  async getCampaign(
    accountEmail: string,
    apiKey: string,
    campaignId: string
  ): Promise<DonorboxCampaign> {
    const client = donorboxClient(accountEmail, apiKey);
    const { data } = await client.get<DonorboxCampaign>(`/campaigns/${campaignId}`);
    return data;
  },

  /**
   * Record a reconciliation note after a Stripe charge completes.
   * Donorbox doesn't expose a public "create donation" endpoint on all plans;
   * this logs the attempt and can be extended when the nonprofit's plan supports it.
   */
  async recordDonation(params: {
    accountEmail: string;
    apiKey: string;
    campaignId: string;
    amountJpy: number;
    donorName: string;
    donorEmail: string;
    note: string;
  }): Promise<void> {
    // Attempt Donorbox donation import (available on certain plans)
    try {
      const client = donorboxClient(params.accountEmail, params.apiKey);
      await client.post('/donations', {
        campaign_id:  params.campaignId,
        amount:       params.amountJpy,
        currency:     'jpy',
        donor: {
          name:  params.donorName,
          email: params.donorEmail,
        },
        comment: params.note,
      });
    } catch (err: unknown) {
      // Log for manual reconciliation if API is unavailable on the nonprofit's plan
      console.warn('[Donorbox] Could not record donation via API; queue for reconciliation:', {
        campaign: params.campaignId,
        amount:   params.amountJpy,
        donor:    params.donorEmail,
        err:      err instanceof Error ? err.message : String(err),
      });
    }
  },
};
