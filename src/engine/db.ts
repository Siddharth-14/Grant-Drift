import { PGlite, type PGliteOptions } from "@electric-sql/pglite";
import type { Mode } from "./types";

const CLIENT_ROLES = "anon, authenticated, service_role";
const TABLE_PRIVS = "select, insert, update, delete";

/** Toggles the default grants Postgres hands to new tables created by `postgres` in public. */
export async function setDefaultPrivileges(db: PGlite, mode: Mode): Promise<void> {
  const base = "alter default privileges for role postgres in schema public";
  await db.exec(
    mode === "legacy"
      ? `${base} grant ${TABLE_PRIVS} on tables to ${CLIENT_ROLES};`
      : `${base} revoke ${TABLE_PRIVS} on tables from ${CLIENT_ROLES};`,
  );
}

/** Browser only: compile the 10 MB wasm and fetch its data bundle once, then share them across every instance. */
type SharedAssets = Pick<PGliteOptions, "pgliteWasmModule" | "initdbWasmModule" | "fsBundle">;
let shared: SharedAssets = {};
export function setSharedAssets(a: SharedAssets): void {
  shared = a;
}

const SETUP_SQL = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to ${CLIENT_ROLES};
  create schema auth;
  grant usage on schema auth to ${CLIENT_ROLES};
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

// initdb costs ~4s, so run it once: set up roles and the auth shim, dump the data dir, clone it for every world.
// Each world is still its own PGlite instance with its own data directory.
let template: Promise<Blob | File> | undefined;

/** Use a prebuilt template (the browser fetches public/pg-template.tar.gz) instead of running initdb. */
export function setTemplate(t: Blob | File): void {
  template = Promise.resolve(t);
}

export async function buildTemplate(): Promise<Blob | File> {
  const seed = new PGlite({ ...shared });
  await seed.waitReady;
  await seed.exec(SETUP_SQL);
  const dump = await seed.dumpDataDir("gzip");
  await seed.close();
  return dump;
}

function getTemplate(): Promise<Blob | File> {
  template ??= buildTemplate();
  return template;
}

/** Fresh in-memory Postgres with the three API roles, an auth.uid() shim and the chosen default grants. */
export async function newDb(mode: Mode): Promise<PGlite> {
  const db = new PGlite({ ...shared, loadDataDir: await getTemplate() });
  await db.waitReady;
  if (mode === "legacy") await setDefaultPrivileges(db, "legacy");
  return db;
}

/** Switch default-privilege mode, then run SQL. Existing tables keep whatever grants they already have. */
export async function applySql(db: PGlite, sql: string, mode: Mode): Promise<void> {
  await setDefaultPrivileges(db, mode);
  await db.exec(sql);
}
