-- CMS Phase 1: align content status with draft/published/unpublished and add soft delete.

ALTER TABLE cms_articles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cms_services ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cms_projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cms_portfolio ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cms_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE cms_articles SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');
UPDATE cms_services SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');
UPDATE cms_projects SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');
UPDATE cms_portfolio SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');
UPDATE cms_products SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');
UPDATE cms_pages SET status = 'unpublished' WHERE status = 'archived' OR status NOT IN ('draft', 'published', 'unpublished');

DO $$
BEGIN
  ALTER TABLE cms_articles ADD CONSTRAINT cms_articles_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE cms_services ADD CONSTRAINT cms_services_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE cms_projects ADD CONSTRAINT cms_projects_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE cms_portfolio ADD CONSTRAINT cms_portfolio_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE cms_products ADD CONSTRAINT cms_products_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE cms_pages ADD CONSTRAINT cms_pages_status_check CHECK (status IN ('draft', 'published', 'unpublished'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS cms_articles_public_lookup_idx ON cms_articles (slug) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_services_public_lookup_idx ON cms_services (slug) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_projects_public_lookup_idx ON cms_projects (slug) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_portfolio_public_lookup_idx ON cms_portfolio (slug) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_products_public_lookup_idx ON cms_products (slug) WHERE status = 'published' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS cms_pages_public_lookup_idx ON cms_pages (slug) WHERE status = 'published' AND deleted_at IS NULL;
