-- Normalize legacy demo-company rows to the canonical companies.id UUID.

UPDATE machines m
SET company_id = c.id::text
FROM companies c
JOIN employees e ON e.company_code = c.company_code
WHERE m.company_id = 'demo-company'
  AND e.company_id = 'demo-company';

UPDATE employees e
SET company_id = c.id::text
FROM companies c
WHERE e.company_id = 'demo-company'
  AND e.company_code = c.company_code;

UPDATE incidents i
SET company_id = c.id::text
FROM companies c
JOIN employees e ON e.company_code = c.company_code
WHERE i.company_id = 'demo-company'
  AND e.company_id = c.id::text;
