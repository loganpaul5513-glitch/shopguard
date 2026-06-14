-- Run this in the Supabase SQL Editor before logging safety meetings.

CREATE TABLE IF NOT EXISTS safety_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  company_id text NOT NULL,
  meeting_date timestamptz NOT NULL DEFAULT now(),
  topic text NOT NULL,
  notes text NOT NULL DEFAULT '',
  led_by text NOT NULL,
  attendees text[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS safety_meetings_company_id_idx ON safety_meetings (company_id);
