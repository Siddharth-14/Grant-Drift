import type { Verdict, World } from "./types";
import type { TableProbe } from "./types";

function phrase(v: Verdict, t: TableProbe): string {
  switch (v) {
    case "open to anon":
      return t.actors.anon.rowsVisible > 0
        ? "readable by anyone with the anon key"
        : "writable by anyone with the anon key";
    case "blocked for clients":
      return "refused to every API client (permission denied, 42501)";
    case "owner-scoped":
      return "each signed-in user sees only their own rows";
    case "breaks at cutover":
      return "signed-in users get permission denied (42501), so the app breaks";
    case "locked by RLS":
      return "reachable, but row-level security hides every row from clients";
    case "signed-in only":
      return "every signed-in user sees every row";
  }
}

/** One plain-English line per table. Leads with today's behaviour (world P), then what changes after Oct 30 for the same project (world Q). */
export function summaryLine(t: TableProbe, verdicts: Record<World, Verdict>, probes: Record<World, TableProbe>): string {
  const p = phrase(verdicts.P, probes.P);
  const sens = verdicts.P === "open to anon" && t.sensitiveColumns.length ? ` (exposes ${t.sensitiveColumns.join(", ")})` : "";
  let line = `${t.table}: ${p}${sens}.`;
  if (verdicts.Q !== verdicts.P) {
    const qs = verdicts.Q === "open to anon" && probes.Q.sensitiveColumns.length ? ` (exposes ${probes.Q.sensitiveColumns.join(", ")})` : "";
    line += ` After the cutover (same project): ${phrase(verdicts.Q, probes.Q)}${qs}.`;
  }
  return line;
}
