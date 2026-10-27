#!/usr/bin/env bash
# Start Usetally locally with built-in sample data (no Supabase, no real money,
# no emails). Used by the QA agent (.claude/agents/usetally-qa.md) and by people.
#   bash scripts/preview.sh [port=3100] [role=owner|manager|finance|junior_finance]
# Extra switches, set before the command:
#   PAYTRAIL_PREVIEW_TRIAL=1        business on free trial
#   PAYTRAIL_PREVIEW_FREE=1         trial ended → Free plan (5 docs/month)
#   PAYTRAIL_PREVIEW_GIFT=1         free access just given (celebration pop-up)
#   PAYTRAIL_PREVIEW_COUNTRY="United Kingdom"   non-Nigerian business
#   PAYTRAIL_PREVIEW_EMPTY=1        brand-new account, no documents
#   PAYTRAIL_PREVIEW_ONBOARDING=1   not finished sign-up yet
#   PAYTRAIL_PREVIEW_TOUR=1         first-time tour not done
#   PAYTRAIL_PREVIEW_LATENCY_MS=800 slow network
#   POSTCODE_API_KEY / POSTCODE_API_URL  point postcode checks at a stand-in
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${1:-3100}; ROLE=${2:-owner}
fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
export PAYTRAIL_PREVIEW=1 PAYTRAIL_PREVIEW_ROLE="$ROLE" PAYTRAIL_PREVIEW_LOGO="http://localhost:$PORT/sample-logo.png"
export NEXT_PUBLIC_SUPABASE_URL=http://localhost:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=preview SUPABASE_SERVICE_ROLE_KEY=preview
export NEXT_PUBLIC_SITE_URL="http://localhost:$PORT" APP_ENCRYPTION_KEY=preview-preview-preview-preview-preview NEXT_TELEMETRY_DISABLED=1
nohup npx next dev -p "$PORT" > ".preview-$PORT.log" 2>&1 &
for _ in $(seq 1 120); do curl -s -m 5 -o /dev/null "http://localhost:$PORT/login" && { echo "Preview on http://localhost:$PORT (log: .preview-$PORT.log)"; exit 0; }; sleep 1; done
echo "Preview didn't start; see .preview-$PORT.log" >&2; exit 1
