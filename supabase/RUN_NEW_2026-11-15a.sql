-- RUN IN SUPABASE -> SQL EDITOR (2026-11-15a): free AI choices for the WhatsApp bot.
-- WhatsApp bot: Google Gemini, Groq and NVIDIA (all with free tiers) join Claude and
-- OpenAI as AI choices in Admin -> Integrations -> WhatsApp.
-- Needs RUN_NEW_2026-11-14a.sql first. Safe to run more than once.
alter table public.platform_settings drop constraint if exists platform_settings_wa_ai_provider_check;
alter table public.platform_settings add constraint platform_settings_wa_ai_provider_check
  check (wa_ai_provider in ('off', 'anthropic', 'openai', 'gemini', 'groq', 'nvidia'));
