-- Team (naira): ₦7,500 a month / ₦75,000 a year (was ₦10,000 / ₦100,000).
-- Keeps the step up from Solo at about 2.5×. Only the standard prices are
-- changed, so a price already edited in Admin → Plans is left alone.
-- New payments and renewals use the new price; Founding (₦60,000 a year) stays.
update public.plans set price_minor = 750000, updated_at = now()
  where name = 'Team' and currency = 'NGN' and billing_interval = 'month' and price_minor = 1000000;
update public.plans set price_minor = 7500000, updated_at = now()
  where name = 'Team' and currency = 'NGN' and billing_interval = 'year' and price_minor = 10000000;
