import { z } from "zod/v4";

export const contentStatusSchema = z.enum(["draft", "published", "unpublished"]);

export const slugSchema = z
  .string()
  .min(1, "Slug is required")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only");

export const pageSlugSchema = z
  .string()
  .min(1, "Slug is required")
  .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, hyphens, or slashes");

export const sitemapPrioritySchema = z
  .string()
  .regex(/^(0(\.\d)?|1(\.0)?)$/, "Priority must be between 0 and 1");

export const robotsIndexSchema = z
  .enum(["index, follow", "index, nofollow", "noindex, follow", "noindex, nofollow"])
  .default("index, follow");
