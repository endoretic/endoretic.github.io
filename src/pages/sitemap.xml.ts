import { getVisibleNotes, getVisibleProjects } from "../lib/content";
import { SITE } from "../data/site";

const staticPaths = [
  "/",
  "/about/",
  "/credits/",
  "/notes/",
  "/works/",
  "/pjsk-tier-maker/",
  "/score-calculator/",
];

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );

export async function GET() {
  const [projects, notes] = await Promise.all([
    getVisibleProjects(),
    getVisibleNotes(),
  ]);
  const paths = [
    ...staticPaths,
    ...projects.map((project) => `/works/${project.id}/`),
    ...notes.map((note) => `/notes/${note.id}/`),
  ];
  const urls = [...new Set(paths)]
    .sort()
    .map((path) => `  <url><loc>${escapeXml(new URL(path, SITE.url).href)}</loc></url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
}
