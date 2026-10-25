// End-to-end tests of the signed-in dashboard, once per user type.
//
//   npm run test:e2e                 all roles (needs Playwright, see below)
//   E2E_ROLES=owner npm run test:e2e one role
//
// Runs the app in local preview mode (sample data, no real Supabase) with a
// simulated 100 ms delay on every Supabase call, so navigation speed is
// measured the way it feels on the live site. For each role it checks:
//   1. every page that role can use opens, shows its heading, and logs no errors;
//   2. pages the role may not use are refused;
//   3. the sidebar shows exactly the right links;
//   4. clicking around feels instant: a loading state appears straight away
//      and the page finishes within budget;
//   5. documents open, and the quote and invoice forms work;
//   6. the mobile menu works.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";
import { createRequire } from "node:module";
// Playwright isn't a project dependency (it would slow every deploy). To run
// these tests on your computer once: npm i --no-save playwright && npx playwright install chromium
const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = path.resolve(import.meta.dirname, "../..");
const LATENCY = Number(process.env.E2E_LATENCY_MS ?? 100);
const FEEDBACK_BUDGET = Number(process.env.E2E_FEEDBACK_MS ?? 200); // something visible changes
const CONTENT_BUDGET = Number(process.env.E2E_CONTENT_MS ?? 1200);  // the page is ready
const ROLES = (process.env.E2E_ROLES || "owner,manager,finance,junior_finance").split(",");

// who may open what (mirrors lib/permissions.js)
const PAGES = [
  { path: "/app", nav: "Dashboard", roles: "all" },
  { path: "/app/quotes", nav: "Quotes", roles: "all" },
  { path: "/app/invoices", nav: "Invoices", roles: "all" },
  { path: "/app/customers", nav: "Customers", roles: "all" },
  { path: "/app/payments", nav: "Payments & receipts", roles: "all" },
  { path: "/app/quotes/new", roles: "all" },
  { path: "/app/invoices/new", roles: "all" },
  { path: "/app/settings/costs", nav: "Cost presets", roles: ["owner", "manager", "finance"] }, // finance here can view costs
  { path: "/app/settings", nav: "Business & branding", roles: ["owner", "manager"] },
  { path: "/app/settings/documents", nav: "Documents & printing", roles: ["owner", "manager"] },
  { path: "/app/settings/payments", nav: "Payment setup", roles: ["owner", "manager"] },
  { path: "/app/settings/team", nav: /^Team/, roles: "all" },
  { path: "/app/settings/billing", nav: "Plan & billing", roles: ["owner"] },
  { path: "/app/settings/privacy", nav: "Privacy & data", roles: "all" },
];
const allowed = (p, role) => p.roles === "all" || p.roles.includes(role);
const ADMIN_PAGES = ["/admin", "/admin/businesses", "/admin/plans", "/admin/settings"];

async function startServer(role, port) {
  const env = {
    ...process.env, PAYTRAIL_PREVIEW: "1", PAYTRAIL_PREVIEW_ROLE: role, PAYTRAIL_PREVIEW_LATENCY_MS: String(LATENCY),
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:9", NEXT_PUBLIC_SUPABASE_ANON_KEY: "preview", SUPABASE_SERVICE_ROLE_KEY: "preview",
    NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`, APP_ENCRYPTION_KEY: "preview-preview-preview-preview-preview", NEXT_TELEMETRY_DISABLED: "1",
  };
  delete env.NODE_ENV;
  const child = spawn("npx", ["next", "dev", "-p", String(port)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = "";
  child.stdout.on("data", (d) => { log += d; });
  child.stderr.on("data", (d) => { log += d; });
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://localhost:${port}/login`); if (r.ok) return { child, log: () => log }; } catch {}
    await sleep(1000);
  }
  throw new Error(`server did not start:\n${log.slice(-2000)}`);
}
const stop = (child) => { try { process.kill(-child.pid, "SIGTERM"); } catch {} };

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/Failed to load resource|ERR_TUNNEL|fonts\.g|net::ERR/.test(t)) return; // offline sandbox
    errors.push(`console: ${t}`);
  });
  return errors;
}

const heading = (page) => page.locator("main h1").first();

for (const [i, role] of ROLES.entries()) {
  test(`dashboard as ${role}`, { timeout: 15 * 60_000 }, async (t) => {
    const port = 3300 + i;
    const base = `http://localhost:${port}`;
    const { child } = await startServer(role, port);
    const browser = await chromium.launch();
    t.after(async () => { await browser.close(); stop(child); });
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);

    // compile every route once (dev server) so timings measure the app, not the compiler
    for (const p of [...PAGES.map((x) => x.path), ...ADMIN_PAGES]) await page.goto(base + p, { waitUntil: "load" }).catch(() => {});
    errors.length = 0;

    await t.test("allowed pages open with a heading and no errors", async () => {
      for (const p of PAGES.filter((x) => allowed(x, role))) {
        const res = await page.goto(base + p.path, { waitUntil: "load" });
        assert.equal(res.status(), 200, `${p.path} status`);
        assert.equal(new URL(page.url()).pathname, p.path, `${p.path} was redirected to ${page.url()}`);
        await heading(page).waitFor({ timeout: 5000 });
        assert.ok((await heading(page).innerText()).trim().length > 0, `${p.path} has a heading`);
      }
      assert.deepEqual(errors, [], "browser errors");
    });

    await t.test("refused pages send the user back", async () => {
      for (const p of PAGES.filter((x) => !allowed(x, role))) {
        await page.goto(base + p.path, { waitUntil: "load" });
        // pages stream, so the redirect can land just after the first paint
        await page.waitForURL((u) => u.pathname === "/app", { timeout: 8000 }).catch(() => {});
        assert.equal(new URL(page.url()).pathname, "/app", `${p.path} should be refused for ${role}`);
      }
      const adminHome = role === "owner" ? "/admin" : "/app";
      await page.goto(base + "/admin", { waitUntil: "load" });
      await page.waitForURL((u) => u.pathname === adminHome, { timeout: 8000 }).catch(() => {});
      assert.equal(new URL(page.url()).pathname, adminHome, "platform admin access");
    });

    if (role === "owner") await t.test("platform admin pages open (owner is the platform admin here)", async () => {
      for (const p of ADMIN_PAGES) {
        const res = await page.goto(base + p, { waitUntil: "load" });
        assert.equal(res.status(), 200, `${p} status`);
        await page.locator("main h1").first().waitFor({ timeout: 8000 });
        assert.equal(new URL(page.url()).pathname, p);
      }
      assert.deepEqual(errors, [], "browser errors");
    });

    await t.test("sidebar shows exactly the right links", async () => {
      await page.goto(base + "/app", { waitUntil: "load" });
      const nav = page.getByRole("navigation", { name: "Main" });
      for (const p of PAGES.filter((x) => x.nav)) {
        const link = nav.getByRole("link", { name: p.nav, exact: typeof p.nav === "string" });
        assert.equal(await link.count() > 0, allowed(p, role), `nav "${p.nav}" for ${role}`);
      }
    });

    await t.test("navigation feels instant", async () => {
      await page.goto(base + "/app", { waitUntil: "networkidle" });
      const nav = page.getByRole("navigation", { name: "Main" });
      const rows = [];
      const targets = PAGES.filter((x) => x.nav && allowed(x, role));
      // two rounds: the second one is what a returning user feels
      for (const round of [1, 2]) {
        for (const p of [...targets.slice(1), targets[0]]) {
          const link = nav.getByRole("link", { name: p.nav, exact: typeof p.nav === "string" }).first();
          const before = await heading(page).innerText().catch(() => "");
          // time the visible response inside the browser: from the click event
          // to the first frame where the link is lit, a loading state shows, or the page changed
          await page.evaluate((href) => {
            window.__fb = null;
            addEventListener("click", () => {
              const t0 = performance.now();
              const check = () => {
                const a = document.querySelector(`nav[aria-label="Main"] a[href="${href}"]`);
                if (a?.getAttribute("aria-current") === "page" || a?.querySelector('[data-pending="true"]') || document.querySelector("[data-page-loading]") || location.pathname === href) window.__fb = performance.now() - t0;
                else requestAnimationFrame(check);
              };
              requestAnimationFrame(check);
            }, { capture: true, once: true });
          }, p.path);
          const t0 = Date.now();
          await link.click();
          await page.waitForFunction(() => window.__fb !== null, null, { timeout: 10_000, polling: 10 });
          const feedback = Math.round(await page.evaluate(() => window.__fb));
          await page.waitForFunction(({ href, before }) => {
            const h = document.querySelector("main h1");
            return location.pathname === href && !document.querySelector("[data-page-loading]") && h && (h.textContent !== before || href === "/app");
          }, { href: p.path, before }, { timeout: 10_000, polling: 10 });
          const content = Date.now() - t0;
          if (round === 2) rows.push({ page: p.path, feedback, content });
        }
      }
      console.log(`\n  ${role}: navigation timings (ms, ${LATENCY} ms simulated per Supabase call)`);
      console.table(rows);
      const slowFeedback = rows.filter((r) => r.feedback > FEEDBACK_BUDGET);
      const slowContent = rows.filter((r) => r.content > CONTENT_BUDGET);
      assert.deepEqual(slowFeedback, [], `no visible response within ${FEEDBACK_BUDGET} ms`);
      assert.deepEqual(slowContent, [], `page not ready within ${CONTENT_BUDGET} ms`);
      assert.deepEqual(errors, [], "browser errors");
    });

    await t.test("documents open and the forms work", async () => {
      await page.goto(base + "/app/quotes", { waitUntil: "load" });
      const first = page.locator('main a[href^="/app/documents/"]').first();
      await first.waitFor();
      const href = await first.getAttribute("href");
      await first.click();
      await page.waitForURL((u) => u.pathname === href, { timeout: 10_000 });
      await heading(page).waitFor();
      await page.goto(base + "/app/quotes/new", { waitUntil: "load" });
      await page.getByRole("textbox").first().waitFor();
      const costs = page.getByText(/hidden costs/i).first();
      const canSeeCosts = role !== "junior_finance";
      assert.equal(await costs.isVisible().catch(() => false), canSeeCosts, "hidden costs visible only to roles allowed to see them");
      await page.goto(base + "/app/invoices/new", { waitUntil: "load" });
      await page.getByRole("textbox").first().waitFor();
      assert.deepEqual(errors, [], "browser errors");
    });

    await t.test("mobile menu navigates", async () => {
      const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const mp = await m.newPage();
      const merr = watchErrors(mp);
      await mp.goto(base + "/app", { waitUntil: "networkidle" });
      await mp.getByRole("button", { name: /menu/i }).first().click();
      await mp.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Invoices", exact: true }).click();
      await mp.waitForURL((u) => u.pathname === "/app/invoices", { timeout: 10_000 });
      await mp.locator("main h1").first().waitFor();
      assert.equal(await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "no sideways scrolling");
      assert.deepEqual(merr, [], "browser errors");
      await m.close();
    });
  });
}
