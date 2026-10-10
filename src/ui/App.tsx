import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze, finish, type Analysis } from "../engine/analyze";
import { applyFixToQ, fixMigration, tablesNeedingFix, type FixOutcome } from "../engine/fix";
import { loadPgliteAssets } from "../engine/browserAssets";
import { loadProjects } from "../engine/fixtures";
import { WORLDS, type Project, type Verdict, type World } from "../engine/types";
import { BandAidToggle, ProjectPicker } from "./Controls";
import { ExportButton } from "./Export";
import { Chip, Matrix } from "./Matrix";

type VMap = Analysis["verdicts"];

function diff(prev: VMap, curr: VMap) {
  const out: { table: string; world: World; from: Verdict; to: Verdict }[] = [];
  for (const table of Object.keys(curr))
    for (const world of WORLDS)
      if (prev[table]?.[world] !== curr[table][world])
        out.push({ table, world, from: prev[table][world], to: curr[table][world] });
  return out;
}

function sentence(label: string, changes: ReturnType<typeof diff>): string {
  if (changes.length === 0) return `${label} changed no verdicts in this project.`;
  const parts = changes.map((c) => `${c.table} in ${c.world} (${c.from} → ${c.to})`);
  return `${label} changed ${changes.length} cell${changes.length === 1 ? "" : "s"}: ${parts.join("; ")}.`;
}

export function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState("p1");
  const [bandAid, setBandAid] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [base, setBase] = useState<Analysis | null>(null);
  const [fix, setFix] = useState<FixOutcome | null>(null);
  const [busy, setBusy] = useState(true);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const cache = useRef(new Map<string, Analysis>());
  const ticket = useRef(0);

  useEffect(() => {
    const assets = loadPgliteAssets();
    loadProjects().then(async (ps) => { await assets; setProjects(ps); }).catch((e) => { setError(String(e)); setBusy(false); });
  }, []);

  const project = projects.find((p) => p.id === selected);

  useEffect(() => {
    if (!project) return;
    const mine = ++ticket.current;
    setBusy(true);
    setError(null);
    setFix(null);
    const t0 = performance.now();
    (async () => {
      const baseKey = `${project.id}:false`;
      let b = cache.current.get(baseKey);
      if (!b) { b = await analyze(project); cache.current.set(baseKey, b); }
      let a = b;
      if (bandAid) {
        const key = `${project.id}:true`;
        a = cache.current.get(key) ?? (await analyze(project, { bandAid: true, reuseP: b.worlds.P }));
        cache.current.set(key, a);
      }
      if (mine !== ticket.current) return;
      setBase(b);
      setAnalysis(a);
      setMs(performance.now() - t0);
      setBusy(false);
    })().catch((e) => { if (mine === ticket.current) { setError(String(e?.message ?? e)); setBusy(false); } });
  }, [project, bandAid]);

  const displayed = useMemo(
    () => (analysis && fix ? finish(analysis.projectId, analysis.bandAid, { ...analysis.worlds, Q: fix.after }) : analysis),
    [analysis, fix],
  );

  const fixSql = useMemo(
    () => (project && analysis ? fixMigration(project, analysis.worlds.Q) : ""),
    [project, analysis],
  );

  const runFix = useCallback(async () => {
    if (!project) return;
    setFixing(true);
    try { setFix(await applyFixToQ(project, { bandAid })); }
    catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setFixing(false); }
  }, [project, bandAid]);

  const { changed, changeText } = useMemo(() => {
    const none = { changed: new Set<string>(), changeText: "" };
    if (!analysis || !displayed || !base) return none;
    let changes: ReturnType<typeof diff> = [];
    let label = "";
    if (fix) { changes = diff(analysis.verdicts, displayed.verdicts); label = "The generated fix"; }
    else if (bandAid) { changes = diff(base.verdicts, analysis.verdicts); label = "The GRANT ALL band-aid"; }
    else return none;
    return { changed: new Set(changes.map((c) => `${c.table}|${c.world}`)), changeText: sentence(label, changes) };
  }, [analysis, displayed, base, fix, bandAid]);

  const needsFix = analysis ? tablesNeedingFix(analysis.worlds.Q.tables).length > 0 : false;

  return (
    <>
      <a className="skip" href="#main">Skip to results</a>
      <header className="masthead">
        <div className="wrap">
          <p className="date">From Oct 30 2026</p>
          <h1>Grant Drift</h1>
          <p className="lede">
            Supabase stops auto-granting table access on new <code>public</code> tables from Oct 30 2026.
            This demo replays synthetic migration histories in a real Postgres running in your browser and shows
            which tables stay open to the anon role, which break, and what a <code>GRANT ALL</code> band-aid exposes again.
          </p>
        </div>
      </header>

      <main id="main" className="wrap">
        {projects.length > 0 && (
          <ProjectPicker projects={projects} selected={selected} onSelect={(id) => { setSelected(id); setBandAid(false); }} busy={busy} />
        )}

        <section className="block" aria-labelledby="legend-h">
          <h2 id="legend-h" className="eyebrow">The three worlds</h2>
          <dl className="worlds">
            <div><dt>P</dt><dd>Old defaults throughout. Where you are today.</dd></div>
            <div><dt>Q</dt><dd>Your existing project. Old tables keep their grants; tables added after the cutover get none.</dd></div>
            <div><dt>R</dt><dd>A new project. No default grants from the first migration.</dd></div>
          </dl>
        </section>

        <section className="block" aria-labelledby="matrix-h" aria-busy={busy}>
          <h2 id="matrix-h" className="eyebrow">2 · Verdicts per table</h2>
          {error && <p role="alert" className="error">Something broke: {error}</p>}
          {busy && !analysis && (
            <div className="loading" role="status">
              <div className="bar" aria-hidden="true"><i /></div>
              <p><strong>Starting Postgres in your browser…</strong> It downloads a 10 MB WebAssembly build once, then probes three databases.</p>
            </div>
          )}
          {analysis && displayed && (
            <div className={busy ? "dim" : undefined}>
              {busy && <p role="status" className="inline-status">Re-probing…</p>}
              <Matrix analysis={displayed} changed={changed} />
              <p className="legend-note">
                Open a table name for the per-actor detail. Legend:{" "}
                {(["open to anon", "breaks at cutover", "blocked for clients", "owner-scoped", "locked by RLS", "signed-in only"] as Verdict[]).map((v) => (
                  <span key={v} className="lg"><Chip verdict={v} /></span>
                ))}
              </p>
              <p aria-live="polite" className="changes">{changeText}</p>
              {ms !== null && <p className="timing">Probed in {(ms / 1000).toFixed(1)}s, entirely in this tab.</p>}
            </div>
          )}
        </section>

        {analysis && displayed && project && (
          <>
            <section className="block" aria-labelledby="band-h">
              <h2 id="band-h" className="eyebrow">3 · Try the band-aid</h2>
              <BandAidToggle bandAid={bandAid} onBandAid={setBandAid} busy={busy} />
            </section>

            <section className="block" aria-labelledby="sum-h">
              <h2 id="sum-h" className="eyebrow">In plain English</h2>
              <ul className="sums">
                {displayed.worlds.P.tables.map((t) => (
                  <li key={t.table}>{displayed.summaries[t.table]}</li>
                ))}
              </ul>
            </section>

            <section className="block" aria-labelledby="fix-h">
              <h2 id="fix-h" className="eyebrow">4 · Generated fix for world Q</h2>
              <p className="hint">Before: the SQL below revokes anon, turns on RLS and adds owner policies for every table that anon can reach and that carries a sensitive-looking column.</p>
              <pre className="code"><code>{fixSql}</code></pre>
              <div className="actions">
                <button type="button" className="btn" onClick={runFix} disabled={busy || fixing || !!fix || !needsFix}>
                  {fixing ? "Applying…" : fix ? "Fix applied" : needsFix ? "Apply generated fix and re-probe" : "Nothing to fix"}
                </button>
                <ExportButton analysis={displayed} fix={fix} />
              </div>
              {fix && (
                <div className="after" role="status">
                  <h3>After: world Q re-probed</h3>
                  <ul>
                    {fix.after.tables.map((t) => {
                      const b = analysis.verdicts[t.table].Q;
                      const a = displayed.verdicts[t.table].Q;
                      return (
                        <li key={t.table}>
                          <code>{t.table}</code>: {b === a ? <>{a}, untouched</> : <>{b} → <strong>{a}</strong></>}
                          {t.sensitiveColumns.length > 0 && a !== "open to anon" ? " (no longer reachable by anon)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="hint">The fix covers sensitive-looking column names only. A table such as <code>messages</code> can stay open if its columns look harmless.</p>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="foot">
        <div className="wrap">
          <p>Independent demo. Models behaviour described in Supabase's public changelog. Synthetic data. Not affiliated with Supabase.</p>
        </div>
      </footer>
    </>
  );
}
