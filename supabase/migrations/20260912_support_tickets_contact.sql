-- Website contact form support
-- Paste this entire file into the Supabase SQL editor after 20260912_admin_dashboard.sql.
--
-- Adds company_name for contact-form tickets and allows anonymous inserts
-- from the marketing site. Anon still cannot read or update tickets.

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS company_name text;

GRANT INSERT ON TABLE public.support_tickets TO anon;

DROP POLICY IF EXISTS support_tickets_contact_insert ON public.support_tickets;

CREATE POLICY support_tickets_contact_insert
ON public.support_tickets
FOR INSERT
TO anon
WITH CHECK (
  sender_email IS NOT NULL
  AND length(trim(sender_email)) BETWEEN 3 AND 320
  AND (sender_name IS NULL OR length(sender_name) <= 200)
  AND (company_name IS NULL OR length(company_name) <= 200)
  AND (body_text IS NULL OR length(body_text) <= 8000)
  AND (subject IS NULL OR length(subject) <= 300)
  AND resolved IS NOT TRUE
  AND resolved_at IS NULL
);
