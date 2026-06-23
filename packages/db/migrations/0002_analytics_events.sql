-- Analytics Phase 4: first-party event tracking foundation.

CREATE TABLE IF NOT EXISTS analytics_events (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  timestamp timestamptz NOT NULL,
  anonymous_visitor_id text NOT NULL,
  session_id text NOT NULL,
  page_url text NOT NULL,
  page_title text NOT NULL DEFAULT '',
  referrer text NOT NULL DEFAULT '',
  utm_source text NOT NULL DEFAULT '',
  utm_medium text NOT NULL DEFAULT '',
  utm_campaign text NOT NULL DEFAULT '',
  target_label text NOT NULL DEFAULT '',
  content_type text NOT NULL DEFAULT '',
  content_id text NOT NULL DEFAULT '',
  product_id text NOT NULL DEFAULT '',
  device text NOT NULL DEFAULT '',
  browser text NOT NULL DEFAULT '',
  consent_state text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_name_check CHECK (
    event_name IN (
      'page_view',
      'session_start',
      'cta_click',
      'product_click',
      'outbound_link_click',
      'portal_click',
      'form_open',
      'form_submit',
      'newsletter_submit',
      'scroll_25',
      'scroll_50',
      'scroll_75',
      'scroll_100'
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_consent_state_check CHECK (
    consent_state IN ('pending', 'granted', 'denied', 'essential_only')
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS analytics_events_event_time_idx ON analytics_events (event_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON analytics_events (anonymous_visitor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS analytics_events_page_idx ON analytics_events (page_url, timestamp DESC);
