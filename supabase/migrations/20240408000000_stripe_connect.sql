-- Add Stripe Connect account ID to nonprofits
ALTER TABLE public.nonprofits ADD COLUMN IF NOT EXISTS stripe_account_id text;
