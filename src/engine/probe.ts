import type { PGlite } from "@electric-sql/pglite";
import { USER_A, USER_B } from "./ids";
import { sensitiveColumns } from "./classify";
import { ACTORS, type Actor, type ActorProbe, type ColumnInfo, type InsertOutcome, type TableProbe } from "./types";

const ACTOR_CTX: Record<Actor, { role: string; sub: string }> = {
  anon: { role: "anon", sub: "" },
  userA: { role: "authenticated", sub: USER_A },
  userB: { role: "authenticated", sub: USER_B },
  service_role: { role: "service_role", sub: "" },
};

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
export const OWNER_COLUMNS = ["user_id", "actor"];

export function ownerColumn(columns: ColumnInfo[]): string | undefined {
  return OWNER_COLUMNS.find((n) => columns.some((c) => c.name === n && c.type === "uuid"));
}

function literalFor(col: ColumnInfo, sub: string, owner: string | undefined): string {
  if (col.name === owner) return `'${sub || USER_A}'::uuid`;
  const t = col.type;
  if (t === "uuid") return "gen_random_uuid()";
  if (/^(integer|bigint|smallint|numeric|real|double)/.test(t)) return "0";
  if (t === "boolean") return "false";
  if (t.startsWith("timestamp") || t === "date") return "now()";
  return "'probe'";
}

function insertSql(table: string, columns: ColumnInfo[], sub: string): string {
  const owner = ownerColumn(columns);
  const cols = columns.filter((c) => (c.notNull && !c.hasDefault) || c.name === owner);
  if (cols.length === 0) return `insert into public.${q(table)} default values`;
  return `insert into public.${q(table)} (${cols.map((c) => q(c.name)).join(", ")}) values (${cols
    .map((c) => literalFor(c, sub, owner))
    .join(", ")})`;
}

interface DbError { code?: string; message?: string }

async function probeActor(db: PGlite, table: string, columns: ColumnInfo[], actor: Actor): Promise<ActorProbe> {
  const { role, sub } = ACTOR_CTX[actor];
  await db.exec("begin");
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);

    let rowsVisible = 0;
    let selectError: string | null = null;
    await db.exec("savepoint s_sel");
    try {
      const r = await db.query<{ c: number }>(`select count(*)::int as c from public.${q(table)}`);
      rowsVisible = r.rows[0].c;
    } catch (e) {
      selectError = (e as DbError).code ?? "unknown";
      await db.exec("rollback to savepoint s_sel");
    }

    let insertOutcome: InsertOutcome = "allowed";
    await db.exec("savepoint s_ins");
    try {
      await db.exec(insertSql(table, columns, sub));
    } catch (e) {
      const { code = "unknown", message = "" } = e as DbError;
      insertOutcome =
        code === "42501" ? (/row-level security/i.test(message) ? "rls-denied" : "42501") : `other:${code}`;
    }
    await db.exec("rollback to savepoint s_ins");
    return { rowsVisible, selectError, insertOutcome };
  } finally {
    await db.exec("rollback");
  }
}

/** Probe every table in `public` as anon, user A, user B and service_role. Nothing is persisted. */
export async function probeDb(db: PGlite, baselineTables: ReadonlySet<string>): Promise<TableProbe[]> {
  const meta = await db.query<{
    t: string; rls: boolean; attname: string; type: string; attnotnull: boolean; atthasdef: boolean;
  }>(`select c.relname as t, c.relrowsecurity as rls, a.attname, format_type(a.atttypid, a.atttypmod) as type,
             a.attnotnull, a.atthasdef
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid
       where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
       order by c.oid, a.attnum`);

  const byTable = new Map<string, { rls: boolean; columns: ColumnInfo[] }>();
  for (const r of meta.rows) {
    const e = byTable.get(r.t) ?? { rls: r.rls, columns: [] };
    e.columns.push({ name: r.attname, type: r.type, notNull: r.attnotnull, hasDefault: r.atthasdef });
    byTable.set(r.t, e);
  }

  const out: TableProbe[] = [];
  for (const [table, { rls, columns }] of byTable) {
    const total = await db.query<{ c: number }>(`select count(*)::int as c from public.${q(table)}`);
    const actors = {} as Record<Actor, ActorProbe>;
    for (const a of ACTORS) actors[a] = await probeActor(db, table, columns, a);
    out.push({
      table,
      phase: baselineTables.has(table) ? "baseline" : "release",
      rlsEnabled: rls,
      totalRows: total.rows[0].c,
      columns,
      sensitiveColumns: sensitiveColumns(columns.map((c) => c.name)),
      actors,
    });
  }
  return out;
}
