import type { Project } from "./types";

export const PROJECT_IDS = ["p1", "p2", "p3", "p4"] as const;

/** Browser-side loader: fetches the app's own committed fixture files. */
export async function loadProjects(base = import.meta.env.BASE_URL): Promise<Project[]> {
  return Promise.all(
    PROJECT_IDS.map(async (id) => {
      const res = await fetch(`${base}fixtures/${id}.json`);
      if (!res.ok) throw new Error(`Could not load fixture ${id}`);
      return (await res.json()) as Project;
    }),
  );
}
