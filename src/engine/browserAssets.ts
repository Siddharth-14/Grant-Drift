import { setSharedAssets, setTemplate } from "./db";

const wasmUrl = new URL("../../node_modules/@electric-sql/pglite/dist/pglite.wasm", import.meta.url).href;
const dataUrl = new URL("../../node_modules/@electric-sql/pglite/dist/pglite.data", import.meta.url).href;

/** Fetch and compile PGlite's own files (served by this site) once, so each of the three worlds starts faster. */
export async function loadPgliteAssets(): Promise<void> {
  const [pgliteWasmModule, fsBundle, tpl] = await Promise.all([
    WebAssembly.compileStreaming(fetch(wasmUrl)),
    fetch(dataUrl).then((r) => r.blob()),
    fetch(`${import.meta.env.BASE_URL}pg-template.tar.gz`).then((r) => (r.ok ? r.blob() : null)),
  ]);
  setSharedAssets({ pgliteWasmModule, fsBundle });
  if (tpl) setTemplate(tpl);
}
