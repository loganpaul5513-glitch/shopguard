-- Run this in the Supabase SQL Editor to support drag-and-drop machine reordering.

ALTER TABLE machines ADD COLUMN IF NOT EXISTS display_order integer;
CREATE INDEX IF NOT EXISTS machines_display_order_idx ON machines (display_order);
