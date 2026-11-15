-- RUN IN SUPABASE -> SQL EDITOR (2026-11-15b): DeepSeek (free, via OpenRouter) for the WhatsApp bot.
alter table public.platform_settings drop constraint if exists platform_settings_wa_ai_provider_check;
alter table public.platform_settings add constraint platform_settings_wa_ai_provider_check
  check (wa_ai_provider in ('off', 'anthropic', 'openai', 'gemini', 'groq', 'nvidia', 'openrouter'));
