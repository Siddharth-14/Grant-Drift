import type { PGlite } from "@electric-sql/pglite";
import { applySql, newDb } from "./db";
import { probeDb } from "./probe";
import type { Mode, Project, World, WorldResult } from "./types";

/** P = old defaults throughout. Q = existing project, release lands after the cutover. R = new project, post-cutover from day one. */
export const WORLD_MODES: Record<World, [baseline: Mode, release: Mode]> = {
  P: ["legacy", "legacy"],
  Q: ["legacy", "post"],
  R: ["post", "post"],
};

export const BAND_AID_SQL = "grant all on all tables in schema public to anon, authenticated, service_role;";

export interface WorldOptions { bandAid?: boolean }

export function releaseWithBandAid(project: Project, world: World, bandAid: boolean): string {
  return bandAid && world !== "P" ? `${project.releaseSql}\n\n-- the band-aid\n${BAND_AID_SQL}\n` : project.releaseSql;
}

async function tableNames(db: PGlite): Promise<Set<string>> {
  const r = await db.query<{ relname: string }>(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'`,
  );
  return new Set(r.rows.map((x) => x.relname));
}

export interface BuiltWorld { db: PGlite; baselineTables: Set<string> }

/** Build a fresh database for one world: baseline, release (plus optional band-aid), then seed rows. */
export async function buildWorld(project: Project, world: World, opts: WorldOptions = {}): Promise<BuiltWorld> {
  const [baseMode, relMode] = WORLD_MODES[world];
  const db = await newDb(baseMode);
  await applySql(db, project.baselineSql, baseMode);
  const baselineTables = await tableNames(db);
  await applySql(db, releaseWithBandAid(project, world, !!opts.bandAid), relMode);
  await db.exec(project.seedSql);
  return { db, baselineTables };
}

export async function runWorld(project: Project, world: World, opts: WorldOptions = {}): Promise<WorldResult> {
  const { db, baselineTables } = await buildWorld(project, world, opts);
  try {
    return { world, bandAid: !!opts.bandAid && world !== "P", tables: await probeDb(db, baselineTables) };
  } finally {
    await db.close();
  }
}
