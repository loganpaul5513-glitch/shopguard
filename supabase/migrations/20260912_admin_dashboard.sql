-- ShopGuard owner admin dashboard
-- Paste this entire file into the Supabase SQL editor (or run as a migration).
--
-- Creates:
--   1. support_tickets  — inbound mail to support@shopguardapp.com
--   2. companies.created_at / subscription_status / trial_ends_at
--   3. admin_company_overview() — service-role-only company stats
--
-- After running this:
--   • Set ADMIN_PASSWORD and SUPABASE_SERVICE_ROLE_KEY on the host
--   • In Resend: enable Receiving on shopguardapp.com, add webhook
--     POST https://<your-domain>/api/inboundEmail  (event: email.received)
--   • Point the webhook signing secret at RESEND_WEBHOOK_SECRET

-- ---------------------------------------------------------------------------
-- support_tickets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id text UNIQUE,
  sender_email text NOT NULL,
  sender_name text,
  subject text,
  body_text text,
  body_html text,
  to_email text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_received_at_idx
  ON public.support_tickets (received_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_resolved_idx
  ON public.support_tickets (resolved, received_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets FORCE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.support_tickets TO service_role;

-- No anon/authenticated policies: only the service role (admin API) can read/write.

-- ---------------------------------------------------------------------------
-- Company trial / signup metadata
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.companies ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS subscription_status text;
ALTER TABLE public.companies ALTER COLUMN subscription_status SET DEFAULT 'trial';

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE public.companies ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

UPDATE public.companies
SET subscription_status = CASE
  WHEN created_at IS NOT NULL AND created_at > now() - interval '14 days' THEN 'trial'
  ELSE 'active'
END
WHERE subscription_status IS NULL;

UPDATE public.companies
SET trial_ends_at = created_at + interval '14 days'
WHERE trial_ends_at IS NULL
  AND created_at IS NOT NULL
  AND subscription_status = 'trial';

-- ---------------------------------------------------------------------------
-- Owner-only company overview (service_role only — never grant to anon)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_company_overview()
RETURNS TABLE (
  id uuid,
  name text,
  company_code text,
  email text,
  created_at timestamptz,
  account_active boolean,
  subscription_status text,
  trial_ends_at timestamptz,
  employee_count integer,
  machine_count integer,
  last_activity_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.company_code,
    c.email,
    c.created_at,
    c.active AS account_active,
    COALESCE(c.subscription_status, 'trial') AS subscription_status,
    c.trial_ends_at,
    (
      SELECT count(*)::int
      FROM public.employees e
      WHERE e.company_id = c.id::text
         OR e.company_id = c.company_code
         OR e.company_code = c.company_code
    ) AS employee_count,
    (
      SELECT count(*)::int
      FROM public.machines m
      WHERE m.company_id = c.id::text
         OR m.company_id = c.company_code
    ) AS machine_count,
    GREATEST(
      c.created_at,
      (
        SELECT max(ts)
        FROM (
          SELECT i.created_at AS ts FROM public.inspections i
            WHERE i.company_id = c.id::text OR i.company_id = c.company_code
          UNION ALL
          SELECT inc.created_at FROM public.incidents inc
            WHERE inc.company_id = c.id::text OR inc.company_id = c.company_code
          UNION ALL
          SELECT t.created_at FROM public.training_records t
            WHERE t.company_id = c.id::text OR t.company_id = c.company_code
          UNION ALL
          SELECT sm.created_at FROM public.safety_meetings sm
            WHERE sm.company_id = c.id::text OR sm.company_id = c.company_code
        ) activity
      )
    ) AS last_activity_at
  FROM public.companies c
  ORDER BY c.created_at DESC NULLS LAST, c.name ASC;
$$;

REVOKE ALL ON FUNCTION public.admin_company_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_company_overview() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_company_overview() TO service_role;
