import type { TableProbe, Verdict, World, WorldResult } from "./types";

const SENSITIVE = /email|phone|token|password|secret|card|ssn|address|plate/i;

export function sensitiveColumns(columns: string[]): string[] {
  return columns.filter((c) => SENSITIVE.test(c));
}

const anonCanTouch = (t: TableProbe) =>
  t.actors.anon.rowsVisible > 0 || t.actors.anon.insertOutcome === "allowed";

/** A signed-in user could actually use the table (read rows or insert). */
export function worksForSignedIn(t: TableProbe): boolean {
  const a = t.actors.userA;
  return a.selectError === null && (a.rowsVisible > 0 || a.insertOutcome === "allowed");
}

/**
 * One verdict per table per world. `inP` is the same table probed in world P;
 * it lets us tell "breaks at cutover" (worked before, 42501 now) from "blocked for clients" (never worked).
 */
export function classifyTable(world: World, t: TableProbe, inP?: TableProbe): Verdict {
  const { anon, userA, userB } = t.actors;
  if (anonCanTouch(t)) return "open to anon";
  if (anon.selectError === "42501" && userA.selectError === "42501") {
    return world !== "P" && inP && worksForSignedIn(inP) ? "breaks at cutover" : "blocked for clients";
  }
  if (
    userA.rowsVisible > 0 && userB.rowsVisible > 0 &&
    userA.rowsVisible < t.totalRows && userB.rowsVisible < t.totalRows
  ) return "owner-scoped";
  if (userA.rowsVisible >= t.totalRows && t.totalRows > 0 && anon.rowsVisible === 0) return "signed-in only";
  return "locked by RLS";
}

export type VerdictMap = Record<string, Record<World, Verdict>>;

export function classifyProject(worlds: Record<World, WorldResult>): VerdictMap {
  const out: VerdictMap = {};
  const pBy = new Map(worlds.P.tables.map((t) => [t.table, t]));
  for (const t of worlds.P.tables) {
    out[t.table] = {} as Record<World, Verdict>;
    for (const w of ["P", "Q", "R"] as World[]) {
      const probe = worlds[w].tables.find((x) => x.table === t.table)!;
      out[t.table][w] = classifyTable(w, probe, pBy.get(t.table));
    }
  }
  return out;
}

export const isOpenToAnon = anonCanTouch;
