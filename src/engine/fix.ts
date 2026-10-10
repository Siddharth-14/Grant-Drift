import { isOpenToAnon } from "./classify";
import { probeDb } from "./probe";
import { buildWorld, runWorld } from "./worlds";
import type { Project, TableProbe, WorldResult } from "./types";

export { BAND_AID_SQL } from "./worlds";

/** Append the GRANT ALL band-aid to the release SQL (Q and R) and re-probe. */
export async function bandAid(project: Project, world: "Q" | "R"): Promise<WorldResult> {
  return runWorld(project, world, { bandAid: true });
}

/** Tables a human would worry about: reachable by anon and carrying a sensitive-looking column. */
export function tablesNeedingFix(tables: TableProbe[]): TableProbe[] {
  return tables.filter((t) => isOpenToAnon(t) && t.sensitiveColumns.length > 0);
}

export function fixMigration(project: Pick<Project, "id" | "title">, result: Pick<WorldResult, "tables">): string {
  const flagged = tablesNeedingFix(result.tables);
  const head = `-- Generated fix for "${project.title}" (synthetic demo)\n`;
  if (flagged.length === 0) return `${head}-- Nothing to fix: no table is open to anon with a sensitive-looking column.\n`;
  const blocks = flagged.map((t) => {
    const n = t.table;
    const hasUser = t.columns.some((c) => c.name === "user_id");
    const lines = [
      `-- ${n}: open to anon, sensitive columns: ${t.sensitiveColumns.join(", ")}`,
      `revoke all on public.${n} from anon;`,
      `alter table public.${n} enable row level security;`,
    ];
    if (hasUser) {
      lines.push(
        `drop policy if exists owner_${n} on public.${n};`,
        `create policy owner_${n} on public.${n} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);`,
        `grant select, insert, update, delete on public.${n} to authenticated, service_role;`,
      );
    } else {
      lines.push(
        `revoke all on public.${n} from authenticated;`,
        `grant select, insert, update, delete on public.${n} to service_role;`,
      );
    }
    return lines.join("\n");
  });
  return `${head}\n${blocks.join("\n\n")}\n`;
}

export interface FixOutcome { fixSql: string; before: WorldResult; after: WorldResult }

/** Build world Q (optionally with the band-aid), generate the fix from its probe, apply it to that same database, re-probe. */
export async function applyFixToQ(project: Project, opts: { bandAid?: boolean } = {}): Promise<FixOutcome> {
  const { db, baselineTables } = await buildWorld(project, "Q", opts);
  try {
    const bandAidOn = !!opts.bandAid;
    const before: WorldResult = { world: "Q", bandAid: bandAidOn, tables: await probeDb(db, baselineTables) };
    const fixSql = fixMigration(project, before);
    await db.exec(fixSql);
    const after: WorldResult = { world: "Q", bandAid: bandAidOn, tables: await probeDb(db, baselineTables) };
    return { fixSql, before, after };
  } finally {
    await db.close();
  }
}
