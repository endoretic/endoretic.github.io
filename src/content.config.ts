import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const language = z.enum(["en", "zh-CN"]);
const commonFields = {
  title: z.string().min(1),
  lang: language,
  draft: z.boolean().default(true),
  tags: z.array(z.string().min(1)).default([]),
};

const projects = defineCollection({
  loader: glob({
    base: "./src/content/projects",
    pattern: "*.{md,mdx}",
  }),
  schema: z.object({
    ...commonFields,
    summary: z.string().min(1),
    placeholder: z.boolean().default(false),
    featured: z.boolean().default(false),
    status: z.enum(["concept", "active", "maintenance", "archived"]).optional(),
    year: z.number().int().min(1900).optional(),
    repo: z.url().optional(),
    demo: z.url().optional(),
    coverAssetId: z.string().min(1).optional(),
    // Optional override for the painted vignette on the record card.
    // Omitted, the scene is derived deterministically from the slug.
    coverScene: z.enum(["relay", "console", "hall", "coast"]).optional(),
  }),
});

const notes = defineCollection({
  loader: glob({
    base: "./src/content/notes",
    pattern: "*.{md,mdx}",
  }),
  schema: z
    .object({
      ...commonFields,
      description: z.string().min(1),
      publishedAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),
      coverAssetId: z.string().min(1).optional(),
      readingMode: z.enum(["paper", "dark"]).default("paper"),
      fictionalized: z.boolean().default(false),
    })
    .superRefine((entry, context) => {
      if (!entry.draft && !entry.publishedAt) {
        context.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message: "Published notes require publishedAt.",
        });
      }

      if (!entry.draft && !entry.updatedAt) {
        context.addIssue({
          code: "custom",
          path: ["updatedAt"],
          message: "Published notes require updatedAt.",
        });
      }
    }),
});

export const collections = { projects, notes };
