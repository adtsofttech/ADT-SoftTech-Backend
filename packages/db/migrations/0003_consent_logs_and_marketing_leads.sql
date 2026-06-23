-- Privacy consent logs and explicit marketing leads.

CREATE TABLE IF NOT EXISTS consent_logs (
  consent_id text PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_visitor_id text NOT NULL DEFAULT '',
  accepted_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejected_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  timestamp timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  source_page text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS consent_logs_timestamp_idx ON consent_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS consent_logs_visitor_idx ON consent_logs (anonymous_visitor_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS marketing_leads (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  source_type text NOT NULL,
  source_page text NOT NULL DEFAULT '',
  first_touch_page text NOT NULL DEFAULT '',
  latest_touch_page text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  marketing_consent boolean NOT NULL DEFAULT false,
  marketing_consent_timestamp timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lead_status text NOT NULL DEFAULT 'new',
  notes text NOT NULL DEFAULT ''
);

DO $$
BEGIN
  ALTER TABLE marketing_leads ADD CONSTRAINT marketing_leads_source_type_check CHECK (
    source_type IN ('contact_form', 'newsletter_signup', 'quote_request', 'client_portal_registration', 'approved_capture_form')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE marketing_leads ADD CONSTRAINT marketing_leads_status_check CHECK (
    lead_status IN ('new', 'contacted', 'qualified', 'closed')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS marketing_leads_created_idx ON marketing_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_leads_email_idx ON marketing_leads (email);
CREATE INDEX IF NOT EXISTS marketing_leads_source_idx ON marketing_leads (source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_leads_status_idx ON marketing_leads (lead_status, created_at DESC);
