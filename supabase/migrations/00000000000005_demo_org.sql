-- ============================================================================
-- EasySpace — Demo organization + invite link
-- Lets you test the internal portal end-to-end:
--   1. open  /book/easyspace-demo
--   2. register as a member (any email since email_domains is empty)
--   3. land on /app and create bookings
--
-- Safe to re-run — ON CONFLICT clauses keep it idempotent.
-- ============================================================================

-- Demo organization
insert into organizations (
  id, name, short_name, floor, industry, brand_color, status, email_domains, tags
)
values (
  '22222222-2222-2222-2222-222222222222',
  'EasySpace Demo Company',
  'Demo',
  '5',
  'Technology',
  '#2D4EF5',
  'active',
  '{}',           -- empty = no domain restriction
  '{"Demo","Showcase"}'
)
on conflict (id) do update set
  name        = excluded.name,
  short_name  = excluded.short_name,
  status      = excluded.status;

-- Demo invite link
insert into invite_links (
  id, org_id, code, link_type, enabled
)
values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'easyspace-demo',
  'public',
  true
)
on conflict (id) do update set
  org_id    = excluded.org_id,
  code      = excluded.code,
  enabled   = excluded.enabled;
