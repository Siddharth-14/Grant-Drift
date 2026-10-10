import type { Analysis } from "../engine/analyze";
import type { FixOutcome } from "../engine/fix";

export function ExportButton({ analysis, fix }: { analysis: Analysis; fix: FixOutcome | null }) {
  const download = () => {
    const payload = {
      note: "Synthetic data produced by Grant Drift, an independent demo. Not affiliated with Supabase.",
      project: analysis.projectId,
      bandAid: analysis.bandAid,
      fixApplied: !!fix,
      fixSql: fix?.fixSql ?? null,
      verdicts: analysis.verdicts,
      summaries: analysis.summaries,
      worlds: analysis.worlds,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `grant-drift-${analysis.projectId}${analysis.bandAid ? "-bandaid" : ""}${fix ? "-fixed" : ""}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button type="button" className="btn ghost" onClick={download}>
      Download probe JSON
    </button>
  );
}
