-- ShopGuard: replace open "Allow all" RLS with company-scoped policies.
--
-- How this works with the anon key:
--   The browser client must send header  x-company-id: <companies.id>
--   on every request after the company is known. Policies compare row
--   company_id (or companies.id) to that header.
--
-- Important limitation:
--   Anyone who knows another company's UUID can spoof the header while
--   using the anon key. This is a hard ceiling without Supabase Auth
--   (or another signed JWT that carries company_id). These policies still
--   replace "Allow all" and block accidental cross-tenant reads/writes.
--
-- Bootstrap (no company id yet):
--   - companies INSERT is open for signup
--   - lookup_company_by_code() / company_code_taken() are SECURITY DEFINER
--   - optional register_company() creates company + first supervisor atomically

-- ---------------------------------------------------------------------------
-- Helpers: read company context from PostgREST request headers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_company_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    lower(trim(BOTH FROM COALESCE(
      current_setting('request.headers', true)::json->>'x-company-id',
      ''
    ))),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.request_company_code()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    upper(trim(BOTH FROM COALESCE(
      current_setting('request.headers', true)::json->>'x-company-code',
      ''
    ))),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.is_company_scoped(p_company_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    public.request_company_id() IS NOT NULL
    AND p_company_id IS NOT NULL
    AND lower(p_company_id) = public.request_company_id();
$$;

-- Safe company-code lookup (does not expose password)
CREATE OR REPLACE FUNCTION public.lookup_company_by_code(p_code text)
RETURNS TABLE (
  id uuid,
  name text,
  company_code text,
  safety_email text,
  active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.company_code, c.safety_email, c.active
  FROM public.companies c
  WHERE c.active IS TRUE
    AND c.company_code ILIKE trim(BOTH FROM p_code)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.company_code_taken(p_code text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.company_code ILIKE trim(BOTH FROM p_code)
  );
$$;

-- Atomic signup: company + first supervisor (no header required)
CREATE OR REPLACE FUNCTION public.register_company(
  p_name text,
  p_company_code text,
  p_email text,
  p_password_hash text,
  p_supervisor_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company public.companies%ROWTYPE;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;
  IF p_supervisor_name IS NULL OR length(trim(p_supervisor_name)) = 0 THEN
    RAISE EXCEPTION 'Supervisor name is required';
  END IF;
  IF p_email IS NULL OR p_email !~* '^[^@]+@[^@]+\.[^@]+$' THEN
    RAISE EXCEPTION 'Valid email is required';
  END IF;
  IF p_password_hash IS NULL OR length(p_password_hash) < 8 THEN
    RAISE EXCEPTION 'Password hash is required';
  END IF;
  IF public.company_code_taken(p_company_code) THEN
    RAISE EXCEPTION 'Company code already in use';
  END IF;

  INSERT INTO public.companies (name, company_code, email, password, active)
  VALUES (
    trim(p_name),
    upper(trim(p_company_code)),
    lower(trim(p_email)),
    p_password_hash,
    true
  )
  RETURNING * INTO v_company;

  INSERT INTO public.employees (company_id, company_code, name, role, active)
  VALUES (
    v_company.id::text,
    v_company.company_code,
    trim(p_supervisor_name),
    'supervisor',
    true
  );

  RETURN json_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'company_code', v_company.company_code,
    'safety_email', v_company.safety_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_company_code() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_company_scoped(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_company_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_code_taken(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_company(text, text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_company_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_company_code() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_scoped(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_company_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.company_code_taken(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_company(text, text, text, text, text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Drop existing policies on target tables (including "Allow all")
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'companies',
        'employees',
        'machines',
        'inspections',
        'incidents',
        'training_records',
        'safety_meetings'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_meetings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.machines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.training_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.safety_meetings FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- companies  (PK is id; no company_id column)
-- ---------------------------------------------------------------------------

-- Signup may insert a company before any header exists
CREATE POLICY companies_insert_signup
  ON public.companies
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Read/update only the current company (via x-company-id)
CREATE POLICY companies_select_own
  ON public.companies
  FOR SELECT
  TO anon, authenticated
  USING (public.is_company_scoped(id::text));

CREATE POLICY companies_update_own
  ON public.companies
  FOR UPDATE
  TO anon, authenticated
  USING (public.is_company_scoped(id::text))
  WITH CHECK (public.is_company_scoped(id::text));

-- Prefer not allowing anonymous deletes of company rows
CREATE POLICY companies_delete_own
  ON public.companies
  FOR DELETE
  TO anon, authenticated
  USING (public.is_company_scoped(id::text));

-- ---------------------------------------------------------------------------
-- Shared pattern for tenant tables that store company_id (text)
-- ---------------------------------------------------------------------------

-- employees
CREATE POLICY employees_select_company
  ON public.employees FOR SELECT TO anon, authenticated
  USING (
    public.is_company_scoped(company_id)
    OR (
      public.request_company_code() IS NOT NULL
      AND company_code IS NOT NULL
      AND upper(company_code) = public.request_company_code()
    )
  );

CREATE POLICY employees_insert_company
  ON public.employees FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY employees_update_company
  ON public.employees FOR UPDATE TO anon, authenticated
  USING (
    public.is_company_scoped(company_id)
    OR (
      public.request_company_code() IS NOT NULL
      AND company_code IS NOT NULL
      AND upper(company_code) = public.request_company_code()
    )
  )
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY employees_delete_company
  ON public.employees FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));

-- machines
CREATE POLICY machines_select_company
  ON public.machines FOR SELECT TO anon, authenticated
  USING (public.is_company_scoped(company_id));

CREATE POLICY machines_insert_company
  ON public.machines FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY machines_update_company
  ON public.machines FOR UPDATE TO anon, authenticated
  USING (public.is_company_scoped(company_id))
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY machines_delete_company
  ON public.machines FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));

-- inspections
CREATE POLICY inspections_select_company
  ON public.inspections FOR SELECT TO anon, authenticated
  USING (public.is_company_scoped(company_id));

CREATE POLICY inspections_insert_company
  ON public.inspections FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY inspections_update_company
  ON public.inspections FOR UPDATE TO anon, authenticated
  USING (public.is_company_scoped(company_id))
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY inspections_delete_company
  ON public.inspections FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));

-- incidents
CREATE POLICY incidents_select_company
  ON public.incidents FOR SELECT TO anon, authenticated
  USING (public.is_company_scoped(company_id));

CREATE POLICY incidents_insert_company
  ON public.incidents FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY incidents_update_company
  ON public.incidents FOR UPDATE TO anon, authenticated
  USING (public.is_company_scoped(company_id))
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY incidents_delete_company
  ON public.incidents FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));

-- training_records
CREATE POLICY training_records_select_company
  ON public.training_records FOR SELECT TO anon, authenticated
  USING (public.is_company_scoped(company_id));

CREATE POLICY training_records_insert_company
  ON public.training_records FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY training_records_update_company
  ON public.training_records FOR UPDATE TO anon, authenticated
  USING (public.is_company_scoped(company_id))
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY training_records_delete_company
  ON public.training_records FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));

-- safety_meetings
CREATE POLICY safety_meetings_select_company
  ON public.safety_meetings FOR SELECT TO anon, authenticated
  USING (public.is_company_scoped(company_id));

CREATE POLICY safety_meetings_insert_company
  ON public.safety_meetings FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY safety_meetings_update_company
  ON public.safety_meetings FOR UPDATE TO anon, authenticated
  USING (public.is_company_scoped(company_id))
  WITH CHECK (public.is_company_scoped(company_id));

CREATE POLICY safety_meetings_delete_company
  ON public.safety_meetings FOR DELETE TO anon, authenticated
  USING (public.is_company_scoped(company_id));
