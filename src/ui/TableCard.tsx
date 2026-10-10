import { ACTORS, WORLDS, type Actor, type ActorProbe, type TableProbe, type Verdict, type World } from "../engine/types";

const ACTOR_LABEL: Record<Actor, string> = {
  anon: "anon (no login)",
  userA: "signed-in user A",
  userB: "signed-in user B",
  service_role: "service_role",
};

function describe(a: ActorProbe): string {
  const read = a.selectError ? `read: ${a.selectError}` : `read: ${a.rowsVisible} row${a.rowsVisible === 1 ? "" : "s"}`;
  return `${read} · insert: ${a.insertOutcome}`;
}

interface Props {
  summary: string;
  probes: Record<World, TableProbe>;
  verdicts: Record<World, Verdict>;
}

export function TableCard({ summary, probes, verdicts }: Props) {
  const p = probes.P;
  return (
    <div className="card">
      <p className="summary-line">{summary}</p>
      <p className="meta">
        RLS {p.rlsEnabled ? "on" : "off"} · {p.totalRows} rows · columns:{" "}
        {p.columns.map((c, i) => (
          <span key={c.name}>
            {i > 0 && ", "}
            <code className={p.sensitiveColumns.includes(c.name) ? "col-sens" : undefined}>{c.name}</code>
          </span>
        ))}
      </p>
      <div className="scroll">
        <table className="detail">
          <thead>
            <tr>
              <th scope="col">Actor</th>
              {WORLDS.map((w) => (
                <th scope="col" key={w}>World {w} <span className="v">{verdicts[w]}</span></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACTORS.map((a) => (
              <tr key={a}>
                <th scope="row">{ACTOR_LABEL[a]}</th>
                {WORLDS.map((w) => (
                  <td key={w}>{describe(probes[w].actors[a])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
