import { describe, expect, it } from "vitest";
import { USER_A, USER_B } from "../src/engine/ids";
import { buildWorld } from "../src/engine/worlds";
import { ALL_IDS, loadProject } from "./helpers";
import { buildProjects } from "../scripts/seed";
import type { World } from "../src/engine/types";

describe("seed script", () => {
  it("is deterministic and matches the committed fixtures", () => {
    const fresh = buildProjects();
    for (const p of fresh) expect(p).toEqual(loadProject(p.id));
  });
});

describe.each(ALL_IDS)("fixture %s", (id) => {
  const project = loadProject(id);

  it("has the documented shape", () => {
    expect(Object.keys(project).sort()).toEqual(["baselineSql", "blurb", "id", "releaseSql", "seedSql", "title"]);
  });

  it("contains no real-looking personal data and no band-aid", () => {
    const all = project.seedSql;
    for (const m of all.matchAll(/'([^']*@[^']*)'/g)) expect(m[1]).toMatch(/^user\d+@example\.test$/);
    for (const m of all.matchAll(/'(\+[^']*)'/g)) expect(m[1]).toMatch(/^\+1-555-01\d\d$/);
    for (const m of all.matchAll(/'(tok_[^']*)'/g)) expect(m[1]).toMatch(/^tok_[0-9a-f]{24}$/);
    expect(project.releaseSql.toLowerCase()).not.toContain("grant all");
    expect(project.baselineSql.toLowerCase()).not.toContain("grant ");
  });

  for (const world of ["P", "Q", "R"] as World[]) {
    it(`applies cleanly in world ${world}; ~40 rows, unique keys, owners balanced`, async () => {
      const { db } = await buildWorld(project, world);
      try {
        const tables = (await db.query<{ relname: string }>(
          `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where nspname='public' and relkind='r'`)).rows;
        expect(tables.length).toBeGreaterThanOrEqual(3);
        for (const { relname: t } of tables) {
          const r = (await db.query<{ n: number; d: number }>(
            `select count(*)::int n, count(distinct id)::int d from public."${t}"`)).rows[0];
          expect(r.n, `${t} rows`).toBe(40);
          expect(r.d, `${t} distinct ids`).toBe(40);
          const cols = (await db.query<{ attname: string }>(
            `select attname from pg_attribute where attrelid='public."${t}"'::regclass and attnum>0`)).rows.map((x) => x.attname);
          const ownerCol = ["user_id", "actor"].find((c) => cols.includes(c));
          if (ownerCol) {
            const o = (await db.query<{ k: string; n: number }>(
              `select "${ownerCol}"::text k, count(*)::int n from public."${t}" group by 1 order by 1`)).rows;
            expect(o).toEqual([{ k: USER_A, n: 20 }, { k: USER_B, n: 20 }]);
          }
          const em = cols.filter((c) => /email/.test(c));
          for (const c of em) {
            const d = (await db.query<{ d: number }>(`select count(distinct "${c}")::int d from public."${t}"`)).rows[0].d;
            expect(d).toBe(40);
          }
        }
      } finally {
        await db.close();
      }
    });
  }
});
