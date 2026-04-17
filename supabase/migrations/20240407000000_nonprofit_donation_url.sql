-- Add external donation URL field to nonprofits
-- When set, the donor page shows a direct link instead of the Stripe form
ALTER TABLE public.nonprofits ADD COLUMN IF NOT EXISTS donation_url text;

-- Set Mirai no Mori's direct donation URL
UPDATE public.nonprofits
SET donation_url = 'https://congrant.com/project/mirainomori/'
WHERE name_en = 'Mirai no Mori';
