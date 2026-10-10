import { readFileSync } from "node:fs";
import type { Project } from "../src/engine/types";

export function loadProject(id: string): Project {
  return JSON.parse(readFileSync(new URL(`../public/fixtures/${id}.json`, import.meta.url), "utf8")) as Project;
}
export const ALL_IDS = ["p1", "p2", "p3", "p4"];
