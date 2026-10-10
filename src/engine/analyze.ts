import { classifyProject, type VerdictMap } from "./classify";
import { runWorld } from "./worlds";
import { summaryLine } from "./summary";
import { WORLDS, type Project, type World, type WorldResult } from "./types";

export interface Analysis {
  projectId: string;
  bandAid: boolean;
  worlds: Record<World, WorldResult>;
  verdicts: VerdictMap;
  summaries: Record<string, string>;
}

export function summarize(worlds: Record<World, WorldResult>, verdicts: VerdictMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of worlds.P.tables) {
    const probes = Object.fromEntries(
      WORLDS.map((w) => [w, worlds[w].tables.find((x) => x.table === t.table)!]),
    ) as Record<World, (typeof t)>;
    out[t.table] = summaryLine(t, verdicts[t.table], probes);
  }
  return out;
}

/** Probe all three worlds. Pass `reuseP` to skip rebuilding P, which the band-aid never changes. */
export async function analyze(project: Project, opts: { bandAid?: boolean; reuseP?: WorldResult } = {}): Promise<Analysis> {
  const bandAid = !!opts.bandAid;
  const [P, Q, R] = await Promise.all([
    opts.reuseP ? Promise.resolve(opts.reuseP) : runWorld(project, "P"),
    runWorld(project, "Q", { bandAid }),
    runWorld(project, "R", { bandAid }),
  ]);
  return finish(project.id, bandAid, { P, Q, R });
}

export function finish(projectId: string, bandAid: boolean, worlds: Record<World, WorldResult>): Analysis {
  const verdicts = classifyProject(worlds);
  return { projectId, bandAid, worlds, verdicts, summaries: summarize(worlds, verdicts) };
}
