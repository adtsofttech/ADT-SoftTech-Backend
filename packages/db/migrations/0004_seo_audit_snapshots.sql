-- SEO Intelligence, URL Inspection, and PageSpeed snapshot storage.

CREATE TABLE IF NOT EXISTS url_inspection_snapshots (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source text NOT NULL DEFAULT 'google_search_console_url_inspection',
  indexed_status text NOT NULL DEFAULT '',
  verdict text NOT NULL DEFAULT '',
  last_crawl_time text NOT NULL DEFAULT '',
  google_canonical text NOT NULL DEFAULT '',
  user_canonical text NOT NULL DEFAULT '',
  sitemap_presence text NOT NULL DEFAULT '',
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  inspected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS url_inspection_snapshots_url_idx ON url_inspection_snapshots (url, inspected_at DESC);

CREATE TABLE IF NOT EXISTS pagespeed_audit_snapshots (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  strategy text NOT NULL,
  source text NOT NULL DEFAULT 'google_pagespeed_insights',
  performance_score text NOT NULL DEFAULT '',
  seo_score text NOT NULL DEFAULT '',
  accessibility_score text NOT NULL DEFAULT '',
  best_practices_score text NOT NULL DEFAULT '',
  lcp text NOT NULL DEFAULT '',
  inp text NOT NULL DEFAULT '',
  cls text NOT NULL DEFAULT '',
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  audited_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE pagespeed_audit_snapshots ADD CONSTRAINT pagespeed_audit_strategy_check CHECK (strategy IN ('mobile', 'desktop'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS pagespeed_audit_snapshots_url_idx ON pagespeed_audit_snapshots (url, strategy, audited_at DESC);
