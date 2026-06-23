alter table support_contact_requests
  add column if not exists whatsapp_number text not null default '',
  add column if not exists company text not null default '',
  add column if not exists unread_by_admin boolean not null default true;

create table if not exists support_contact_conversations (
  id text primary key default gen_random_uuid(),
  request_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists support_contact_messages (
  id text primary key default gen_random_uuid(),
  conversation_id text not null,
  request_id text not null,
  author text not null,
  kind text not null,
  channel text not null default 'internal',
  message text not null default '',
  delivery_status text not null default 'not_configured',
  delivery_error text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists notification_settings (
  id text primary key default 'default',
  email_enabled boolean not null default false,
  email_recipients text not null default '',
  whatsapp_enabled boolean not null default false,
  whatsapp_admin_number text not null default '',
  webhook_enabled boolean not null default false,
  webhook_url text not null default '',
  webhook_secret text not null default '',
  portal_approval_flow text not null default 'access_code',
  updated_at timestamptz not null default now()
);

create table if not exists notification_logs (
  id text primary key default gen_random_uuid(),
  event_type text not null default '',
  channel text not null default '',
  status text not null default 'pending',
  recipient text not null default '',
  related_id text not null default '',
  error text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists client_access_requests (
  id text primary key default gen_random_uuid(),
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  company text not null default '',
  project_reference text not null default '',
  message text not null default '',
  requested_password_hash text not null default '',
  status text not null default 'pending',
  approval_mode text not null default 'access_code',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text not null default '',
  created_client_id text not null default ''
);

create table if not exists approved_portal_users (
  id text primary key default gen_random_uuid(),
  email text not null default '',
  name text not null default '',
  phone text not null default '',
  company text not null default '',
  account_status text not null default 'active',
  password_hash text not null default '',
  access_code_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists access_code_logs (
  id text primary key default gen_random_uuid(),
  user_id text not null default '',
  request_id text not null default '',
  action text not null default '',
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
