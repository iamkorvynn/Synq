create table if not exists synq_users (
  id text primary key,
  name text not null,
  handle text not null unique,
  role text not null,
  bio text not null,
  trust_state text not null,
  ai_policy text not null,
  ghost_mode boolean not null default false,
  onboarding_complete boolean not null default false,
  linked_phone text,
  linked_email text
);

create table if not exists synq_devices (
  id text primary key,
  user_id text not null references synq_users (id),
  label text not null,
  public_key text not null,
  passkey_enabled boolean not null default true,
  trust_state text not null,
  approved_at timestamptz,
  last_seen_at timestamptz not null,
  revoked_at timestamptz,
  credential_id text,
  fingerprint text not null
);

create table if not exists synq_sessions (
  id text primary key,
  user_id text not null references synq_users (id),
  device_id text not null references synq_devices (id),
  scope text not null,
  access_token text not null unique,
  refresh_token text not null unique,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  pending_approval boolean not null default false
);

create table if not exists synq_device_approvals (
  id text primary key,
  user_id text not null references synq_users (id),
  device_id text not null references synq_devices (id),
  status text not null,
  requested_at timestamptz not null,
  approved_at timestamptz,
  approved_by_device_id text
);

create table if not exists synq_workspace_policies (
  id text primary key,
  workspace_id text not null unique,
  ai_policy text not null,
  invite_only boolean not null default true,
  retention_days integer not null
);

create table if not exists synq_attachment_objects (
  id text primary key,
  owner_user_id text not null references synq_users (id),
  key_id text not null unique,
  status text not null,
  upload_url text not null,
  encrypted_url text,
  created_at timestamptz not null,
  committed_at timestamptz
);

create table if not exists synq_audit_events (
  id text primary key,
  type text not null,
  user_id text,
  device_id text,
  conversation_id text,
  created_at timestamptz not null,
  details jsonb not null default '{}'::jsonb
);

create table if not exists synq_disappearing_message_jobs (
  id text primary key,
  message_id text not null,
  conversation_id text not null,
  delete_at timestamptz not null,
  status text not null
);

create table if not exists synq_runtime_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
