import { describe, expect, it } from "vitest";
import { analyze } from "../src/engine/analyze";
import { isOpenToAnon } from "../src/engine/classify";
import { applyFixToQ, fixMigration } from "../src/engine/fix";
import { ALL_IDS, loadProject } from "./helpers";

describe("determinism", () => {
  it("p1 produces identical JSON five times", async () => {
    const p = loadProject("p1");
    const runs: string[] = [];
    for (let i = 0; i < 5; i++) runs.push(JSON.stringify(await analyze(p)));
    expect(new Set(runs).size).toBe(1);
  });
});

describe("expected verdicts", () => {
  it("p1: the agent-created invites table is open in P, breaks in Q", async () => {
    const a = await analyze(loadProject("p1"));
    expect(a.verdicts.invites).toEqual({ P: "open to anon", Q: "breaks at cutover", R: "breaks at cutover" });
    expect(a.verdicts.todos.P).toBe("owner-scoped");
    expect(a.verdicts.profiles.Q).toBe("open to anon"); // existing tables keep their grants
  });
});

describe("band-aid on p4", () => {
  it("moves exports from 42501 to anon-readable; export_jobs stays at zero rows", async () => {
    const p = loadProject("p4");
    const before = await analyze(p);
    const after = await analyze(p, { bandAid: true, reuseP: before.worlds.P });
    const get = (a: typeof before, w: "Q" | "R", t: string) => a.worlds[w].tables.find((x) => x.table === t)!;
    for (const w of ["Q", "R"] as const) {
      expect(get(before, w, "exports").actors.anon.selectError).toBe("42501");
      expect(get(after, w, "exports").actors.anon.rowsVisible).toBeGreaterThan(0);
      expect(get(after, w, "export_jobs").actors.anon).toMatchObject({ rowsVisible: 0, selectError: null });
    }
  });
});

describe.each(ALL_IDS)("generated fix on %s", (id) => {
  for (const bandAid of [false, true]) {
    it(`leaves no sensitive-looking table readable by anon (band-aid ${bandAid ? "on" : "off"})`, async () => {
      const p = loadProject(id);
      const { fixSql, after } = await applyFixToQ(p, { bandAid });
      const exposed = after.tables.filter((t) => t.sensitiveColumns.length > 0 && isOpenToAnon(t));
      expect(exposed.map((t) => t.table)).toEqual([]);
      expect(fixSql).not.toMatch(/^grant[^;]*\banon\b/im);
      // fixing is idempotent: nothing left to fix
      expect(fixMigration(p, after)).toContain("Nothing to fix");
    });
  }
});
