-- WhatsApp bot: DeepSeek's free models through OpenRouter as an AI choice.
-- Needs RUN_NEW_2026-11-15a.sql first. Safe to run more than once.
alter table public.platform_settings drop constraint if exists platform_settings_wa_ai_provider_check;
alter table public.platform_settings add constraint platform_settings_wa_ai_provider_check
  check (wa_ai_provider in ('off', 'anthropic', 'openai', 'gemini', 'groq', 'nvidia', 'openrouter'));
