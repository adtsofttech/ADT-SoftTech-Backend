CREATE TABLE IF NOT EXISTS support_contact_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  source_page text NOT NULL DEFAULT '',
  source_form text NOT NULL DEFAULT '',
  request_type text NOT NULL DEFAULT 'general_inquiry',
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  admin_notes text NOT NULL DEFAULT '',
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification_status text NOT NULL DEFAULT 'not_configured',
  notification_error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_contact_requests_created_at_idx
  ON support_contact_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS support_contact_requests_status_idx
  ON support_contact_requests (status);

CREATE INDEX IF NOT EXISTS support_contact_requests_request_type_idx
  ON support_contact_requests (request_type);
