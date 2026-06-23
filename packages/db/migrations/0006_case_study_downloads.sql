ALTER TABLE cms_portfolio
  ADD COLUMN IF NOT EXISTS downloadable_pdf_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS downloadable_pdf_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_download_button_text text NOT NULL DEFAULT 'Download PDF',
  ADD COLUMN IF NOT EXISTS gated_download_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS final_cta_heading text NOT NULL DEFAULT 'Have a similar project in mind?',
  ADD COLUMN IF NOT EXISTS final_cta_paragraph text NOT NULL DEFAULT 'Tell us what you want to build and we will help shape the right plan.',
  ADD COLUMN IF NOT EXISTS final_cta_button_text text NOT NULL DEFAULT 'Discuss a Similar Project',
  ADD COLUMN IF NOT EXISTS final_cta_button_url text NOT NULL DEFAULT '/contact';

CREATE TABLE IF NOT EXISTS case_study_download_leads (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  case_study_id text NOT NULL,
  case_study_slug text NOT NULL DEFAULT '',
  case_study_title text NOT NULL DEFAULT '',
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  job_title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  marketing_consent boolean NOT NULL DEFAULT false,
  privacy_accepted boolean NOT NULL DEFAULT false,
  download_granted boolean NOT NULL DEFAULT false,
  downloaded_at timestamptz,
  source_page text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  anonymous_visitor_id text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS case_study_download_leads_case_study_idx
  ON case_study_download_leads (case_study_id, created_at DESC);

CREATE INDEX IF NOT EXISTS case_study_download_leads_email_idx
  ON case_study_download_leads (email);

CREATE INDEX IF NOT EXISTS case_study_download_leads_downloaded_idx
  ON case_study_download_leads (download_granted, downloaded_at DESC);
