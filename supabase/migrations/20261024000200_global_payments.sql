-- Adds Stripe (US, UK, EU and 40+ countries) and Paystack (Nigeria, Ghana,
-- Kenya, South Africa, Côte d'Ivoire) alongside Bachs and Flutterwave.
-- Safe to run more than once.

alter table public.payment_connections drop constraint if exists payment_connections_provider_check;
alter table public.payment_connections add constraint payment_connections_provider_check
  check (provider in ('bachs','flutterwave','stripe','paystack'));

alter table public.payment_attempts drop constraint if exists payment_attempts_provider_check;
alter table public.payment_attempts add constraint payment_attempts_provider_check
  check (provider in ('bachs','flutterwave','stripe','paystack'));

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('bachs','flutterwave','stripe','paystack','bank_transfer','cash','pos','other'));

alter table public.platform_settings drop constraint if exists platform_settings_billing_provider_check;
alter table public.platform_settings add constraint platform_settings_billing_provider_check
  check (billing_provider in ('manual','bachs','flutterwave','stripe','paystack'));
