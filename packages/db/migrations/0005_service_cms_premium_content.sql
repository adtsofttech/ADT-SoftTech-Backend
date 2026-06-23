ALTER TABLE cms_services
  ADD COLUMN IF NOT EXISTS short_hero_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS long_intro_heading text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS long_intro_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_image text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_cta_button_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_cta_button_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_cta_button_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS secondary_cta_button_link text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sub_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS industry_use_cases jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS why_choose_us jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS technology_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS development_process jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS case_studies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_articles jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mid_page_cta jsonb NOT NULL DEFAULT '{"heading":"","paragraph":"","buttonText":"","buttonUrl":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS final_cta jsonb NOT NULL DEFAULT '{"heading":"","paragraph":"","buttonText":"","buttonUrl":""}'::jsonb,
  ADD COLUMN IF NOT EXISTS robots_follow boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS cms_services_status_updated_idx
  ON cms_services (status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cms_services_published_idx
  ON cms_services (published_at DESC)
  WHERE status = 'published' AND deleted_at IS NULL;
