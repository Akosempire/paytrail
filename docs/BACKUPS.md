# Backups

Usetally's database (businesses, customers, quotes, invoices, receipts,
payments, users) is copied **every night at 03:17 Lagos time**, encrypted, and
kept for **30 days** in your Cloudflare R2 bucket (plus 7 days in GitHub).
It's free: GitHub Actions and R2 both have free allowances far above this.

Admin → Health shows **Daily backup** with when the last one ran. If a backup
fails, or none has landed for 30 hours, you get the usual alert (webhook +
email).

Files (logos, signatures, attachments) already live in Cloudflare R2, which
keeps its own copies, so they aren't part of this backup.

---

## One-time setup (about 10 minutes)

### 1. Get the database address from Supabase
Supabase → your project → **Connect** (top bar) → **Session pooler** → copy
the URI. It looks like:

    postgresql://postgres.abcd1234:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres

Put your database password in place of `[YOUR-PASSWORD]`. (Forgot it?
Supabase → Project Settings → Database → Reset database password. Nothing
else in Usetally uses it.)

Use the **Session pooler** one: GitHub can't reach the "Direct connection".

### 2. Make a backup passphrase
Any long sentence only you know, e.g. four random words and a number. Every
backup is locked with it. **Keep it in your password manager: without it the
backups can't be opened, by anyone, including you.**

### 3. Add the secrets in GitHub
GitHub → your Paytrail repository → **Settings → Secrets and variables →
Actions → New repository secret**. Add:

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the address from step 1 |
| `BACKUP_PASSPHRASE` | the passphrase from step 2 |
| `R2_ACCOUNT_ID` | same as in Vercel |
| `R2_BUCKET` | same as in Vercel |
| `R2_ACCESS_KEY_ID` | same as in Vercel |
| `R2_SECRET_ACCESS_KEY` | same as in Vercel |
| `CRON_SECRET` | same as in Vercel (lets the backup report to Admin → Health) |

Without the R2 ones, backups are still made but only kept 7 days in GitHub.

### 4. Run the first backup now
GitHub → **Actions → Database backup → Run workflow**. It takes about two
minutes. When it's green, Admin → Health shows **Daily backup: Working**.

---

## Restoring

Always restore into a **new** Supabase project, never over the live one.
Check the new project has your data, then point Usetally at it.

1. Supabase → **New project** (the free plan allows two). Copy its Session
   pooler address as in step 1.
2. GitHub → Settings → Secrets → add `RESTORE_DB_URL` with that address.
3. GitHub → **Actions → Restore backup → Run workflow**. Leave the file empty
   for the newest backup (or paste a name from R2 → `backups/db/`), type
   `RESTORE`, run. The last step prints how many businesses, documents and
   users came back.
4. To switch over: in Vercel, change `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the new
   project's (Supabase → Project Settings → API), copy over your Auth email
   settings, then redeploy.

**Do a practice restore once**, right after setup, so you know it works before
you ever need it. Then delete the practice project.

### Opening a backup on your computer
Backups are `.tar.gz.gpg` files. With Git for Windows installed, in Git Bash:

    gpg -d usetally-db-2026-10-28-0217.tar.gz.gpg | tar -xz

You get `roles.sql`, `schema.sql` and `data.sql`.
