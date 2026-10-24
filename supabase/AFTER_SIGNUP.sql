-- ================================================================
-- Run AFTER you have signed up on the live site (and confirmed your
-- email). Replace the email below with the one you signed up with.
-- ================================================================

-- 1) Make yourself the platform admin (unlocks /admin)
insert into public.platform_admins (user_id)
select id from auth.users where email = lower('YOUR_EMAIL@example.com')
on conflict do nothing;

-- 2) Check it worked: should return one row with your email
select u.email from public.platform_admins a join auth.users u on u.id = a.user_id;

-- 3) Quick health check: should show 13 plans (12 public + hidden Founding)
select name, currency, price_minor / 100 as price, billing_interval, active
from public.plans order by currency, price_minor;

-- Founding customer (₦60,000/yr): do it in the app, not SQL.
-- After they sign up: /admin/businesses → Manage → choose "Founding" → Save.
