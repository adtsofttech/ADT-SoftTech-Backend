alter table approved_portal_users
  add column if not exists access_code_expires_at timestamptz;

alter table portal_clients
  add column if not exists password_hash text not null default '',
  add column if not exists access_code_expires_at timestamptz;

alter table portal_access_requests
  add column if not exists requested_password_hash text not null default '',
  add column if not exists approval_mode text not null default 'access_code';
