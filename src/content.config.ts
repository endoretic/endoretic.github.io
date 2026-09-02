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
    })
    .superRefine((entry, context) => {
      if (!entry.draft && !entry.publishedAt) {
        context.addIssue({
          code: "custom",
          path: ["publishedAt"],
          message: "Published notes require publishedAt.",
        });
      }
    }),
});

export const collections = { projects, notes };
