# Grant Drift

A static demo that replays synthetic Supabase-style migration histories inside a real Postgres (PGlite, Postgres compiled to WebAssembly) running in your browser. It shows which tables stay open to the `anon` role, which ones break, and what a `GRANT ALL` band-aid exposes again.

Everything is synthetic. No backend, no account, no analytics, no LLM calls, no runtime network request except loading the app's own files. There is no input for a project URL or key, and no code contacts any Supabase project.

> Independent demo. Models behaviour described in Supabase's public changelog. Synthetic data. Not affiliated with Supabase.

## Browser spike (step 1): passed

Before building anything I ran PGlite 0.5.8 in headless Chromium and confirmed it can `create role anon nologin`, `authenticated nologin` and `service_role nologin bypassrls`; create tables; `grant`; `enable row level security`; `create policy`; `set role anon`; and that a denied read returns SQLSTATE `42501`. The engine is real, not faked.

## The context

From **Oct 30 2026** Supabase stops auto-granting `select/insert/update/delete` on new `public` tables to `anon`, `authenticated` and `service_role` for existing projects (new projects since May 30 2026). Existing tables keep their grants.
Sources: [changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [discussion](https://github.com/orgs/supabase/discussions/45329).

## How it models the cutover

Each project has a `baselineSql` (tables that already exist), a `releaseSql` (tables added in a later release) and `seedSql` (40 fake rows per table). Each is replayed in three worlds, each a fresh PGlite instance:

| World | Baseline | Release | Meaning |
|---|---|---|---|
| P | old defaults | old defaults | where you are today |
| Q | old defaults | new defaults | your existing project, release lands after Oct 30 |
| R | new defaults | new defaults | a brand-new project |

"Old defaults" means `alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role`. "New defaults" means no such grant (`applySql` issues the matching `revoke` when switching mode, so already-created tables keep their grants).

Every table is then probed as `anon`, user A, user B and `service_role` (`set local role` plus a `request.jwt.claim.sub` setting that backs a small `auth.uid()` shim). Each probe records rows visible, the SELECT SQLSTATE, and whether a rolled-back INSERT is allowed, denied by RLS, or denied by privilege (`42501`).

Verdicts, one per table per world: **open to anon**, **blocked for clients**, **owner-scoped**, **breaks at cutover** (worked for signed-in users in P, `42501` in Q or R). I added two more so every table gets a verdict: **locked by RLS** (granted, but RLS hides every row) and **signed-in only**. A name-based heuristic flags sensitive columns (email, phone, token, password, secret, card, ssn, address, plate).

The **band-aid** appends `grant all on all tables in schema public to anon, authenticated, service_role;` to the release SQL in Q and R. The **generated fix** targets tables that are open to anon and carry a sensitive-looking column: revoke from anon, enable RLS, add an owner policy when the table has `user_id`, and grant to `authenticated` and `service_role` (owner tables) or `service_role` only (others; I also revoke `authenticated` there).

## What this is not

I did not have the PRD text, so these are taken from the brief's hard rules. Replace with the PRD wording if it differs.

- Not a scanner. It never connects to a real Supabase project, and there is no field for a URL or anon key.
- Not an audit of your database, and not security advice. Its data and schemas are invented.
- Not a prediction of Supabase's exact implementation; it models the behaviour the public changelog describes.
- Not a complete policy checker. The sensitive-column heuristic works on column names only, so a table like `messages` (public-read policy, harmless-looking columns) stays open after the generated fix.
- Not affiliated with Supabase, and it uses no Supabase branding.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (about 30 s: it boots many PGlite instances)
npm run build      # type-check + static build into dist/
```

## Regenerate fixtures and the template

```bash
npm run seed                          # scripts/seed.ts (mulberry32, fixed seeds) -> public/fixtures/p1..p4.json
npx tsx scripts/make-template.ts      # public/pg-template.tar.gz, only after upgrading @electric-sql/pglite
```

`pg-template.tar.gz` (4.5 MB) is an initdb'd data directory with the roles and `auth.uid()` shim already created. Shipping it saves about 4 s of initdb per visit. Each world is cloned from it into its own instance. Tests fall back to running initdb themselves.

## Deploy (Cloudflare Pages)

I could not deploy from the build environment (no Cloudflare credentials, no route to their API), so **the deploy is still to do**:

1. Cloudflare dashboard → Workers & Pages → Create → Pages → connect this repo.
2. Build command `npm run build`, output directory `dist`, Node 20+.
3. Check the current per-file limit first. The largest file is `pglite.wasm` at about 10.1 MB; at the time of writing Pages documents 25 MiB per file. If it fails, import the repo into Vercel's Hobby tier with the same build settings.

Then open the URL at desktop and 375 px width and confirm project 1's matrix appears with no interaction. I ran that check against the production build served locally (Chromium via Playwright): the matrix appeared after about 4 s at both widths, and the page made requests only to its own origin. Real network latency on about 20 MB of first-visit downloads will add to that.

## Deviations from the brief

- The `frontend-design` and `chrome-browser` skills were not available here. I applied the same standard by hand and drove Chromium with Playwright instead.
- Row-level expand (all three worlds at once) rather than per-cell expand.
- Worlds start from a cloned template rather than a bare `new PGlite()` each, for speed (see above).
- UI polish cut: no dark mode.
