-- Octopus Sports Academy - PostgreSQL schema (PostgreSQL 13+; gen_random_uuid is built in)

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  phone           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','coach','admin')),
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time tokens for email verification and password reset (only hashes are stored)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     TEXT NOT NULL CHECK (purpose IN ('verify','reset')),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON auth_tokens(user_id, purpose);

-- Family members managed by a parent/owner account (e.g. kids, relatives)
CREATE TABLE IF NOT EXISTS family_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  age         INT  NOT NULL CHECK (age BETWEEN 1 AND 120),
  skill_level TEXT NOT NULL CHECK (skill_level IN ('beginner','intermediate','professional','champion')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_owner_idx ON family_members(owner_id);

CREATE TABLE IF NOT EXISTS condos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  address     TEXT,
  image_url   TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS condos_name_idx ON condos (lower(name));

CREATE TABLE IF NOT EXISTS classes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condo_id     UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  coach_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  class_type   TEXT NOT NULL CHECK (class_type IN ('one_to_one','group')),
  skill_level  TEXT NOT NULL CHECK (skill_level IN ('beginner','intermediate','professional','champion')),
  min_age      INT NOT NULL DEFAULT 0,
  max_age      INT NOT NULL DEFAULT 120,
  capacity     INT NOT NULL DEFAULT 10 CHECK (capacity > 0),
  price_cents  INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  duration_min INT NOT NULL DEFAULT 60,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS classes_condo_idx ON classes(condo_id);
CREATE INDEX IF NOT EXISTS classes_coach_idx ON classes(coach_id);

-- A concrete scheduled lesson of a class
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  starts_at    TIMESTAMPTZ NOT NULL,
  ends_at      TIMESTAMPTZ NOT NULL,
  qr_token     TEXT,            -- rotating check-in token shown by the coach as QR
  qr_expires   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS sessions_class_time_idx ON sessions(class_id, starts_at);
CREATE INDEX IF NOT EXISTS sessions_time_idx ON sessions(starts_at);

-- Who is enrolled in a class (a user, optionally on behalf of a family member)
CREATE TABLE IF NOT EXISTS enrollments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id           UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_member_id   UUID REFERENCES family_members(id) ON DELETE CASCADE,
  participant_name   TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (class_id, user_id, participant_name)
);
CREATE INDEX IF NOT EXISTS enrollments_user_idx ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS enrollments_class_idx ON enrollments(class_id);

-- Attendance per session per participant
CREATE TABLE IF NOT EXISTS attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  enrollment_id   UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('on_time','late','absent')),
  method          TEXT NOT NULL CHECK (method IN ('qr','manual')),
  checked_in_at   TIMESTAMPTZ,
  marked_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  UNIQUE (session_id, enrollment_id)
);

-- Coach rating of a student after a session (reason required below 3 stars)
CREATE TABLE IF NOT EXISTS ratings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  coach_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stars         INT  NOT NULL CHECK (stars BETWEEN 1 AND 5),
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, enrollment_id),
  CHECK (stars >= 3 OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);

-- "Create a class" requests from people whose profile is not eligible for an existing class
CREATE TABLE IF NOT EXISTS class_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condo_id    UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  details     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Package plans from the academy price list (price per person, in cents)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS day_group TEXT CHECK (day_group IN ('weekdays','weekends'));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS classes_per_month INT CHECK (classes_per_month IN (4,8));
ALTER TABLE classes ADD COLUMN IF NOT EXISTS schedule_text TEXT;
-- 'mixed' = weekday and weekend days together (price is the average of both packages)
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_day_group_check;
ALTER TABLE classes ADD CONSTRAINT classes_day_group_check CHECK (day_group IN ('weekdays','weekends','mixed'));

CREATE TABLE IF NOT EXISTS price_plans (
  day_group         TEXT NOT NULL CHECK (day_group IN ('weekdays','weekends')),
  classes_per_month INT  NOT NULL CHECK (classes_per_month IN (4,8)),
  group_tier        TEXT NOT NULL CHECK (group_tier IN ('1','2','3','4-6')),
  price_cents       INT  NOT NULL CHECK (price_cents >= 0),
  PRIMARY KEY (day_group, classes_per_month, group_tier)
);

-- Date of birth for family members (age is calculated from it)
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Unit number for coach registration at the condo gate as visitors
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS unit_number TEXT;

-- Condos added by students stay hidden until the academy approves them
ALTER TABLE condos ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE;

-- Class requests: 'rejected' status and the date the status last changed (used for the wait-after-rejection rule)
ALTER TABLE class_requests DROP CONSTRAINT IF EXISTS class_requests_status_check;
ALTER TABLE class_requests ADD CONSTRAINT class_requests_status_check
  CHECK (status IN ('new','in_progress','done','rejected'));
ALTER TABLE class_requests ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- Class status: forming (red, below the minimum size) -> payment (orange, waiting for payments) -> active (green).
-- Filled only once for existing rows (IS NULL), so re-running the migration keeps the current status.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS status TEXT;
UPDATE classes SET status = CASE WHEN class_type = 'group' THEN 'forming' ELSE 'active' END WHERE status IS NULL;
ALTER TABLE classes ALTER COLUMN status SET NOT NULL;
-- New rows start as forming; the app recalculates the real status right after every insert (refreshClassStatus)
ALTER TABLE classes ALTER COLUMN status SET DEFAULT 'forming';
ALTER TABLE classes DROP CONSTRAINT IF EXISTS classes_status_check;
ALTER TABLE classes ADD CONSTRAINT classes_status_check CHECK (status IN ('forming','payment','active'));

-- One check-in QR per class. It does not change and does not expire; it works for any session of the class
-- while that session's check-in window is open.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS qr_token TEXT UNIQUE;

-- Whether this participant has paid (set by the admin until online payment is connected)
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT FALSE;

-- Invite a friend: each enrolment in a group class can share an invite code.
-- referred_by points to the inviter's enrolment (the invited person must be new, see the enrol route).
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES enrollments(id) ON DELETE SET NULL;

-- "Will you attend this session?" answers, one per participant per session
CREATE TABLE IF NOT EXISTS session_rsvps (
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  will_attend   BOOLEAN NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, enrollment_id)
);

-- Small key/value settings editable by the admin (e.g. chat_retention_days)
CREATE TABLE IF NOT EXISTS app_settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('chat_retention_days', '15') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('class_request_limit', '2') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('class_request_wait_days', '15') ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('class_min_size', '4') ON CONFLICT (key) DO NOTHING;

-- Per-condo chat. Old messages are deleted automatically after chat_retention_days.
CREATE TABLE IF NOT EXISTS condo_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condo_id    UUID NOT NULL REFERENCES condos(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS condo_messages_condo_idx ON condo_messages(condo_id, created_at);

-- Rejected class requests are deleted with all their details. Only who was declined and when is kept,
-- for the "wait N days after a decline" rule.
CREATE TABLE IF NOT EXISTS class_request_rejections (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rejected_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_request_rejections_user_idx ON class_request_rejections(user_id, rejected_at);
-- Move requests that were already rejected: keep the decline date, then delete the request
INSERT INTO class_request_rejections (user_id, rejected_at)
  SELECT user_id, COALESCE(status_changed_at, created_at) FROM class_requests
  WHERE status = 'rejected' AND details->>'kind' = 'new_class';
DELETE FROM class_requests WHERE status = 'rejected';
-- A condo a student added that never got a class and has no request left is removed too
DELETE FROM condos c WHERE c.is_published = FALSE
  AND NOT EXISTS (SELECT 1 FROM classes cl WHERE cl.condo_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM class_requests r WHERE r.condo_id = c.id);

-- Optional reason a student gives when they answer "No, I will not attend"
ALTER TABLE session_rsvps ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE session_rsvps DROP CONSTRAINT IF EXISTS session_rsvps_reason_check;
ALTER TABLE session_rsvps ADD CONSTRAINT session_rsvps_reason_check CHECK (reason IS NULL OR length(reason) <= 300);

-- Session version: every login cookie carries the version it was made with. Logging out or changing the
-- password adds 1, so every older cookie (on any device, or copied by someone) stops working at once.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 0;

-- A group class is confirmed only when class_min_size people join, so it needs at least that many seats.
-- Older group classes made with fewer seats are raised to the minimum (safe to run again: changes nothing then).
UPDATE classes SET capacity = (SELECT COALESCE(NULLIF(value, '')::int, 4) FROM app_settings WHERE key = 'class_min_size')
WHERE class_type = 'group'
  AND capacity < (SELECT COALESCE(NULLIF(value, '')::int, 4) FROM app_settings WHERE key = 'class_min_size');
