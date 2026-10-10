import { Fragment, useState } from "react";
import { WORLDS, type TableProbe, type Verdict, type World } from "../engine/types";
import type { Analysis } from "../engine/analyze";
import { TableCard } from "./TableCard";

const GLYPH: Record<Verdict, string> = {
  "open to anon": "!",
  "blocked for clients": "×",
  "owner-scoped": "✓",
  "breaks at cutover": "↯",
  "locked by RLS": "–",
  "signed-in only": "○",
};
const CLASS: Record<Verdict, string> = {
  "open to anon": "open",
  "blocked for clients": "blocked",
  "owner-scoped": "owner",
  "breaks at cutover": "breaks",
  "locked by RLS": "locked",
  "signed-in only": "signed",
};

export function Chip({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`chip ${CLASS[verdict]}`}>
      <span aria-hidden="true" className="glyph">{GLYPH[verdict]}</span>
      {verdict}
    </span>
  );
}

const WORLD_HEAD: Record<World, [string, string]> = {
  P: ["P", "old defaults"],
  Q: ["Q", "existing project, release after Oct 30"],
  R: ["R", "new project, new defaults"],
};

interface Props {
  analysis: Analysis;
  changed: Set<string>; // `${table}|${world}`
}

export function Matrix({ analysis, changed }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const tables = analysis.worlds.P.tables;
  const probesFor = (t: string) =>
    Object.fromEntries(WORLDS.map((w) => [w, analysis.worlds[w].tables.find((x) => x.table === t) as TableProbe])) as Record<World, TableProbe>;

  return (
    <div className="scroll">
      <table className="matrix">
        <caption className="sr-only">Verdict per table in each world</caption>
        <thead>
          <tr>
            <th scope="col">Table</th>
            {WORLDS.map((w) => (
              <th scope="col" key={w}>
                <span className="wl">{WORLD_HEAD[w][0]}</span>
                <span className="ws">{WORLD_HEAD[w][1]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => {
            const probes = probesFor(t.table);
            const isOpen = !!open[t.table];
            return (
              <Fragment key={t.table}>
                <tr>
                  <th scope="row">
                    <button
                      type="button"
                      className="rowbtn"
                      aria-expanded={isOpen}
                      aria-controls={`detail-${t.table}`}
                      onClick={() => setOpen({ ...open, [t.table]: !isOpen })}
                    >
                      <span className="caret" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                      <code>{t.table}</code>
                    </button>
                    <span className="phase">{t.phase === "release" ? "added in release" : "already existed"}</span>
                    {t.sensitiveColumns.length > 0 && (
                      <span className="badge" title="Column names that look sensitive">
                        sensitive: {t.sensitiveColumns.join(", ")}
                      </span>
                    )}
                  </th>
                  {WORLDS.map((w) => {
                    const isChanged = changed.has(`${t.table}|${w}`);
                    return (
                      <td key={w} className={isChanged ? "changed" : undefined}>
                        <Chip verdict={analysis.verdicts[t.table][w]} />
                        {isChanged && <span className="flag">changed</span>}
                      </td>
                    );
                  })}
                </tr>
                {isOpen && (
                  <tr className="expand" id={`detail-${t.table}`}>
                    <td colSpan={4}>
                      <TableCard summary={analysis.summaries[t.table]} probes={probes} verdicts={analysis.verdicts[t.table]} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
