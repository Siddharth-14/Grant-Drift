export type Mode = "legacy" | "post";
export type World = "P" | "Q" | "R";
export const WORLDS: World[] = ["P", "Q", "R"];
export type Actor = "anon" | "userA" | "userB" | "service_role";
export const ACTORS: Actor[] = ["anon", "userA", "userB", "service_role"];

export interface Project {
  id: string;
  title: string;
  blurb: string;
  baselineSql: string;
  releaseSql: string;
  seedSql: string;
}

/** allowed = insert went through (then rolled back); rls-denied = row-level security refused it;
 *  42501 = missing table privilege; other:<code> = some other error (e.g. a constraint). */
export type InsertOutcome = "allowed" | "rls-denied" | "42501" | `other:${string}`;

export interface ActorProbe {
  rowsVisible: number;
  selectError: string | null;
  insertOutcome: InsertOutcome;
}

export interface ColumnInfo {
  name: string;
  type: string;
  notNull: boolean;
  hasDefault: boolean;
}

export interface TableProbe {
  table: string;
  phase: "baseline" | "release";
  rlsEnabled: boolean;
  totalRows: number;
  columns: ColumnInfo[];
  sensitiveColumns: string[];
  actors: Record<Actor, ActorProbe>;
}

export interface WorldResult {
  world: World;
  bandAid: boolean;
  tables: TableProbe[];
}

export type Verdict =
  | "open to anon"
  | "blocked for clients"
  | "owner-scoped"
  | "breaks at cutover"
  | "locked by RLS"
  | "signed-in only";
