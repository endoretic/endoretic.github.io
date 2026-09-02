import { getCollection, type CollectionEntry } from "astro:content";

const includeVisibleEntry = (entry: { data: { draft: boolean } }) =>
  import.meta.env.DEV || !entry.data.draft;

export async function getVisibleProjects(): Promise<
  CollectionEntry<"projects">[]
> {
  const projects = await getCollection("projects", includeVisibleEntry);

  return projects.sort((left, right) =>
    left.data.title.localeCompare(right.data.title, "en"),
  );
}

export async function getVisibleNotes(): Promise<CollectionEntry<"notes">[]> {
  const notes = await getCollection("notes", includeVisibleEntry);

  return notes.sort((left, right) => {
    const leftDate = left.data.publishedAt?.getTime() ?? 0;
    const rightDate = right.data.publishedAt?.getTime() ?? 0;

    return (
      rightDate - leftDate ||
      left.data.title.localeCompare(right.data.title, left.data.lang)
    );
  });
}
