-- Run this in the Supabase SQL Editor before using photo storage features.

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS sop_steps jsonb NOT NULL DEFAULT '[]';
