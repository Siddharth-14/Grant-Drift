import { BAND_AID_SQL } from "../engine/worlds";
import type { Project } from "../engine/types";

interface Props {
  projects: Project[];
  selected: string;
  onSelect: (id: string) => void;
  bandAid: boolean;
  onBandAid: (on: boolean) => void;
  busy: boolean;
}

export function ProjectPicker({ projects, selected, onSelect, busy }: Pick<Props, "projects" | "selected" | "onSelect" | "busy">) {
  const current = projects.find((p) => p.id === selected);
  return (
    <section aria-labelledby="pick-h" className="block">
      <h2 id="pick-h" className="eyebrow">1 · Pick a synthetic project</h2>
      <div className="picker" role="radiogroup" aria-labelledby="pick-h">
        {projects.map((p, i) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={p.id === selected}
            className="pick"
            disabled={busy && p.id !== selected}
            onClick={() => onSelect(p.id)}
          >
            <span className="pick-n">{i + 1}</span>
            <span>{p.title}</span>
          </button>
        ))}
      </div>
      {current && <p className="blurb">{current.blurb}</p>}
    </section>
  );
}

export function BandAidToggle({ bandAid, onBandAid, busy }: Pick<Props, "bandAid" | "onBandAid" | "busy">) {
  return (
    <div className="toggle-wrap">
      <label className="toggle">
        <input type="checkbox" checked={bandAid} disabled={busy} onChange={(e) => onBandAid(e.target.checked)} />
        <span className="toggle-box" aria-hidden="true" />
        <span>Add the GRANT ALL band-aid</span>
      </label>
      <p className="hint">
        The panicked fix for “permission denied”. It appends this line to the release SQL in worlds Q and R:
      </p>
      <pre className="code small"><code>{BAND_AID_SQL}</code></pre>
    </div>
  );
}
