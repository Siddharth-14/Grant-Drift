import { describe, expect, it } from "vitest";
import { classifyTable, sensitiveColumns } from "../src/engine/classify";
import type { ActorProbe, Actor, TableProbe } from "../src/engine/types";

const ok = (rows: number, insert: ActorProbe["insertOutcome"] = "rls-denied"): ActorProbe => ({ rowsVisible: rows, selectError: null, insertOutcome: insert });
const denied: ActorProbe = { rowsVisible: 0, selectError: "42501", insertOutcome: "42501" };

function probe(actors: Partial<Record<Actor, ActorProbe>>, total = 40): TableProbe {
  return {
    table: "t", phase: "release", rlsEnabled: true, totalRows: total, columns: [], sensitiveColumns: [],
    actors: { anon: ok(0), userA: ok(0), userB: ok(0), service_role: ok(total, "allowed"), ...actors },
  };
}

const owned = probe({ userA: ok(20, "allowed"), userB: ok(20, "allowed") });
const open = probe({ anon: ok(40, "allowed"), userA: ok(40, "allowed"), userB: ok(40, "allowed") });
const blocked = probe({ anon: denied, userA: denied, userB: denied, service_role: denied });

describe("classifyTable", () => {
  it("open to anon: anon sees rows", () => expect(classifyTable("P", open)).toBe("open to anon"));
  it("open to anon: anon can only insert", () =>
    expect(classifyTable("P", probe({ anon: ok(0, "allowed") }))).toBe("open to anon"));
  it("blocked for clients: 42501 for anon and authenticated, never worked before", () => {
    expect(classifyTable("Q", blocked, probe({ userA: ok(0) }))).toBe("blocked for clients");
    expect(classifyTable("P", blocked)).toBe("blocked for clients");
  });
  it("owner-scoped: A and B see only their own rows, anon none", () =>
    expect(classifyTable("P", owned)).toBe("owner-scoped"));
  it("breaks at cutover: worked for signed-in users in P, 42501 in Q or R", () => {
    expect(classifyTable("Q", blocked, owned)).toBe("breaks at cutover");
    expect(classifyTable("R", blocked, open)).toBe("breaks at cutover");
  });
  it("locked by RLS: grants but no policy, nothing visible", () =>
    expect(classifyTable("P", probe({}))).toBe("locked by RLS"));
  it("signed-in only: every signed-in user sees every row, anon none", () =>
    expect(classifyTable("P", probe({ userA: ok(40), userB: ok(40) }))).toBe("signed-in only"));
});

describe("sensitiveColumns", () => {
  it("flags the listed name patterns", () => {
    const cols = ["id", "email", "contact_email", "phone", "api_token", "password_hash", "client_secret", "card_last4", "ssn", "home_address", "license_plate", "title"];
    expect(sensitiveColumns(cols)).toEqual(cols.filter((c) => c !== "id" && c !== "title"));
  });
});
