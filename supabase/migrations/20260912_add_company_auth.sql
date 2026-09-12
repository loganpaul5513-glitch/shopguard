-- Company account credentials for supervisor signup / login
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS password text;
