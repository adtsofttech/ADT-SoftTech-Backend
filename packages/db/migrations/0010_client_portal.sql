CREATE TABLE IF NOT EXISTS portal_access_requests (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  project_reference text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  admin_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text NOT NULL DEFAULT '',
  created_client_id text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS portal_clients (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  account_status text NOT NULL DEFAULT 'active',
  access_code_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_projects (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  project_name text NOT NULL DEFAULT '',
  project_description text NOT NULL DEFAULT '',
  overall_status text NOT NULL DEFAULT 'in_progress',
  progress_percent integer NOT NULL DEFAULT 0,
  next_task text NOT NULL DEFAULT '',
  start_date text NOT NULL DEFAULT '',
  due_date text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_milestones (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  progress integer NOT NULL DEFAULT 0,
  due_date text NOT NULL DEFAULT '',
  completed_at text NOT NULL DEFAULT '',
  requires_client_approval boolean NOT NULL DEFAULT false,
  client_approval_status text NOT NULL DEFAULT 'not_requested',
  client_visible_notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS portal_messages (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  project_id text NOT NULL DEFAULT '',
  sender_role text NOT NULL,
  sender_id text NOT NULL DEFAULT '',
  text text NOT NULL DEFAULT '',
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_read_by_admin boolean NOT NULL DEFAULT false,
  is_read_by_client boolean NOT NULL DEFAULT false,
  internal_only boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_files (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  project_id text NOT NULL DEFAULT '',
  uploaded_by_role text NOT NULL,
  uploaded_by_id text NOT NULL DEFAULT '',
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT '',
  file_size integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL DEFAULT '',
  secure_download_reference text NOT NULL DEFAULT gen_random_uuid(),
  related_message_id text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_internal_notes (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  project_id text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portal_notifications (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL DEFAULT '',
  role text NOT NULL,
  type text NOT NULL DEFAULT 'system',
  title text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_access_requests_status_idx ON portal_access_requests(status);
CREATE INDEX IF NOT EXISTS portal_clients_email_idx ON portal_clients(email);
CREATE INDEX IF NOT EXISTS client_projects_client_id_idx ON client_projects(client_id);
CREATE INDEX IF NOT EXISTS project_milestones_project_id_idx ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS portal_messages_client_id_idx ON portal_messages(client_id);
CREATE INDEX IF NOT EXISTS portal_files_client_id_idx ON portal_files(client_id);
