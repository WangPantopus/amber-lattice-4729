-- Backwards compatible: yes. Adds six nullable columns to "HomeOccupancy" (with a check on one and a partial unique
-- index), one nullable column to "HomePostcardCode" and six "FeatureFlag" rows, all off. No new table, function,
-- trigger, policy or grant, and no existing function is replaced. Deployed apps and the current backend never read or
-- write any of it.
--
-- Faster home verification (FASTVERIFY; the founder approved the design and its nine decisions on 2026-11-17).
-- A fast check is a mark on a claimed occupancy (verification_source 'claim'), not a new proof source: every claim
-- rule keeps applying, and the mail-level gate (isVerifiedResident in backend/utils/homePermissions.js) is unchanged.
-- The backend writes these columns; the database only keeps them.
--   fast_check_kind            phone | location | document: which check marked the claim
--   fast_check_at              when it last passed
--   fast_check_expires_at      when it ends (a year; a location match near or after the end renews it)
--   fast_check_recheck_due_at  location only: a second match on another day is due by then (14 days)
--   fast_check_confirmed_at    location only: when that second match came
--   fast_check_ref_hash        phone only: a keyed hash of the number, never the number in clear
-- One number marks one account: the hash is unique among active occupancies.
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public."HomeOccupancy"
  ADD COLUMN IF NOT EXISTS fast_check_kind text,
  ADD COLUMN IF NOT EXISTS fast_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS fast_check_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS fast_check_recheck_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS fast_check_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fast_check_ref_hash text;

ALTER TABLE public."HomeOccupancy" DROP CONSTRAINT IF EXISTS "HomeOccupancy_fast_check_kind_check";
ALTER TABLE public."HomeOccupancy" ADD CONSTRAINT "HomeOccupancy_fast_check_kind_check"
  CHECK (fast_check_kind IS NULL OR fast_check_kind IN ('phone','location','document')) NOT VALID;
ALTER TABLE public."HomeOccupancy" VALIDATE CONSTRAINT "HomeOccupancy_fast_check_kind_check";

CREATE UNIQUE INDEX IF NOT EXISTS "HomeOccupancy_fast_check_ref_hash_active"
  ON public."HomeOccupancy" (fast_check_ref_hash)
  WHERE fast_check_ref_hash IS NOT NULL AND is_active IS TRUE;

COMMENT ON COLUMN public."HomeOccupancy".fast_check_kind IS
  'Fast check that marks a claimed occupancy as Verified (phone, location, document). Not address proof: mail-level gates ignore it.';
COMMENT ON COLUMN public."HomeOccupancy".fast_check_ref_hash IS
  'Phone fast check only: a keyed hash of the number (FAST_CHECK_PHONE_HASH_KEY). Never the number in clear.';

-- "This wasn't me": when the person at the address reported a mailed code they did not ask for.
ALTER TABLE public."HomePostcardCode" ADD COLUMN IF NOT EXISTS reported_at timestamptz;

-- Off until the founder turns each on (POST /api/admin/feature-flags/<name>). Read live by the backend.
INSERT INTO public."FeatureFlag" (flag_name, enabled_globally, enabled_for_internal_team, beta_user_ids, description)
VALUES
  ('home_fast_verify', false, false, ARRAY[]::uuid[],
    'Faster home verification: the Verified level from a fast check, GET /api/homes/:id/verify-options and the new verify sheet rows. Off by default.'),
  ('home_fast_verify_phone', false, false, ARRAY[]::uuid[],
    'Fast check by phone number (Twilio Verify and Lookup Identity Match). Needs home_fast_verify. Off by default.'),
  ('home_fast_verify_location', false, false, ARRAY[]::uuid[],
    'Fast check by the phone''s location at home, with an App Attest or Play Integrity proof. Needs home_fast_verify. Off by default.'),
  ('home_fast_verify_document', false, false, ARRAY[]::uuid[],
    'Fast check by a bill read at once on the residency document upload. Needs home_fast_verify. Off by default.'),
  ('home_short_add', false, false, ARRAY[]::uuid[],
    'Add Home in two steps; the home''s type, size and year built come from the county record afterwards. Off by default.'),
  ('home_postcard_scan', false, false, ARRAY[]::uuid[],
    'The verify postcard prints a QR picture of its link and a "This wasn''t me" line; the public report route answers. Off by default.')
ON CONFLICT (flag_name) DO NOTHING;

COMMIT;
