import { pgTable, text, timestamp, boolean, jsonb, integer } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";
import { contentStatusSchema, robotsIndexSchema, sitemapPrioritySchema, slugSchema } from "./cms-validation";

const optionalText = (max: number, label: string) => z.string().max(max, `${label} is too long`).default("");

const optionalUrlSchema = (label: string) =>
  z
    .string()
    .max(2048, `${label} is too long`)
    .refine(
      (value) =>
        value === "" ||
        value.startsWith("/") ||
        value.startsWith("#") ||
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("mailto:") ||
        value.startsWith("tel:"),
      `${label} must be a valid URL or internal path`,
    )
    .default("");

const orderedItemSchema = z.object({
  order: z.coerce.number().int().nonnegative().default(0),
});

const serviceCardSchema = orderedItemSchema.extend({
  title: z.string().min(1, "Card title is required").max(160, "Card title is too long"),
  description: z.string().max(1200, "Card description is too long").default(""),
  iconImage: z.string().max(2048, "Icon or image URL is too long").default(""),
  ctaText: z.string().max(80, "CTA text is too long").default(""),
  ctaUrl: optionalUrlSchema("CTA URL"),
});

const industryUseCaseSchema = orderedItemSchema.extend({
  name: z.string().min(1, "Industry name is required").max(160, "Industry name is too long"),
  description: z.string().max(1200, "Industry description is too long").default(""),
  iconImage: z.string().max(2048, "Icon or image URL is too long").default(""),
  url: optionalUrlSchema("Industry URL"),
});

const technologyToolSchema = orderedItemSchema.extend({
  toolName: z.string().min(1, "Tool name is required").max(120, "Tool name is too long"),
  category: z.string().max(120, "Tool category is too long").default(""),
  iconLogo: z.string().max(2048, "Icon or logo URL is too long").default(""),
});

const processStepSchema = orderedItemSchema.extend({
  stepNumber: z.coerce.number().int().positive("Step number must be positive"),
  title: z.string().min(1, "Step title is required").max(160, "Step title is too long"),
  description: z.string().max(1200, "Step description is too long").default(""),
  iconImage: z.string().max(2048, "Icon or image URL is too long").default(""),
});

const caseStudySchema = orderedItemSchema.extend({
  title: z.string().min(1, "Case study title is required").max(180, "Case study title is too long"),
  description: z.string().max(1400, "Case study description is too long").default(""),
  image: z.string().max(2048, "Case study image URL is too long").default(""),
  technologyTags: z.array(z.string().max(80, "Technology tag is too long")).default([]),
  ctaText: z.string().max(80, "CTA text is too long").default(""),
  ctaLink: optionalUrlSchema("Case study CTA link"),
});

const relatedArticleSchema = orderedItemSchema.extend({
  articleId: z.string().max(120, "Article ID is too long").default(""),
  slug: z.string().max(180, "Article slug is too long").default(""),
  title: z.string().max(180, "Article title is too long").default(""),
});

const faqSchema = orderedItemSchema.extend({
  question: z.string().min(1, "FAQ question is required").max(240, "FAQ question is too long"),
  answer: z.string().min(1, "FAQ answer is required").max(3000, "FAQ answer is too long"),
});

const emptyCtaBlock = {
  heading: "",
  paragraph: "",
  buttonText: "",
  buttonUrl: "",
};

const ctaBlockSchema = z
  .object({
    heading: z.string().max(180, "CTA heading is too long").default(""),
    paragraph: z.string().max(1000, "CTA paragraph is too long").default(""),
    buttonText: z.string().max(80, "CTA button text is too long").default(""),
    buttonUrl: optionalUrlSchema("CTA button URL"),
  })
  .default(emptyCtaBlock);

export const serviceStructuredContentSchema = {
  subServices: z.array(serviceCardSchema).default([]),
  industryUseCases: z.array(industryUseCaseSchema).default([]),
  benefits: z.array(serviceCardSchema).default([]),
  whyChooseUs: z.array(serviceCardSchema).default([]),
  technologyStack: z.array(technologyToolSchema).default([]),
  developmentProcess: z.array(processStepSchema).default([]),
  caseStudies: z.array(caseStudySchema).default([]),
  relatedArticles: z.array(relatedArticleSchema).default([]),
  faqs: z.array(faqSchema).default([]),
  midPageCta: ctaBlockSchema,
  finalCta: ctaBlockSchema,
};

export type ServiceCard = z.infer<typeof serviceCardSchema>;
export type IndustryUseCase = z.infer<typeof industryUseCaseSchema>;
export type TechnologyTool = z.infer<typeof technologyToolSchema>;
export type ProcessStep = z.infer<typeof processStepSchema>;
export type ServiceCaseStudy = z.infer<typeof caseStudySchema>;
export type RelatedArticleReference = z.infer<typeof relatedArticleSchema>;
export type ServiceFaq = z.infer<typeof faqSchema>;
export type ServiceCtaBlock = z.infer<typeof ctaBlockSchema>;

export const servicesTable = pgTable("cms_services", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt").notNull().default(""),
  body: text("body").notNull().default(""),
  featuredImage: text("featured_image").notNull().default(""),
  galleryImages: jsonb("gallery_images").$type<string[]>().notNull().default([]),
  contentBlocks: jsonb("content_blocks").$type<Record<string, unknown>[]>().notNull().default([]),
  category: text("category").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  icon: text("icon").notNull().default(""),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  pricingNote: text("pricing_note").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  homepageTabTitle: text("homepage_tab_title").notNull().default(""),
  homepageShortDescription: text("homepage_short_description").notNull().default(""),
  businessBenefits: jsonb("business_benefits").$type<string[]>().notNull().default([]),
  showOnHomepage: boolean("show_on_homepage").notNull().default(false),
  shortHeroDescription: text("short_hero_description").notNull().default(""),
  longIntroHeading: text("long_intro_heading").notNull().default(""),
  longIntroDescription: text("long_intro_description").notNull().default(""),
  heroImage: text("hero_image").notNull().default(""),
  heroCTAButtonText: text("hero_cta_button_text").notNull().default(""),
  heroCTAButtonLink: text("hero_cta_button_link").notNull().default(""),
  secondaryCTAButtonText: text("secondary_cta_button_text").notNull().default(""),
  secondaryCTAButtonLink: text("secondary_cta_button_link").notNull().default(""),
  subServices: jsonb("sub_services").$type<ServiceCard[]>().notNull().default([]),
  industryUseCases: jsonb("industry_use_cases").$type<IndustryUseCase[]>().notNull().default([]),
  benefits: jsonb("benefits").$type<ServiceCard[]>().notNull().default([]),
  whyChooseUs: jsonb("why_choose_us").$type<ServiceCard[]>().notNull().default([]),
  technologyStack: jsonb("technology_stack").$type<TechnologyTool[]>().notNull().default([]),
  developmentProcess: jsonb("development_process").$type<ProcessStep[]>().notNull().default([]),
  caseStudies: jsonb("case_studies").$type<ServiceCaseStudy[]>().notNull().default([]),
  relatedArticles: jsonb("related_articles").$type<RelatedArticleReference[]>().notNull().default([]),
  faqs: jsonb("faqs").$type<ServiceFaq[]>().notNull().default([]),
  midPageCta: jsonb("mid_page_cta").$type<ServiceCtaBlock>().notNull().default(emptyCtaBlock),
  finalCta: jsonb("final_cta").$type<ServiceCtaBlock>().notNull().default(emptyCtaBlock),
  status: text("status").notNull().default("draft"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  seoTitle: text("seo_title").notNull().default(""),
  metaDescription: text("meta_description").notNull().default(""),
  focusKeyword: text("focus_keyword").notNull().default(""),
  canonicalUrl: text("canonical_url").notNull().default(""),
  robotsIndex: text("robots_index").notNull().default("index, follow"),
  ogTitle: text("og_title").notNull().default(""),
  ogDescription: text("og_description").notNull().default(""),
  ogImage: text("og_image").notNull().default(""),
  twitterTitle: text("twitter_title").notNull().default(""),
  twitterDescription: text("twitter_description").notNull().default(""),
  twitterImage: text("twitter_image").notNull().default(""),
  schemaType: text("schema_type").notNull().default("Service"),
  robotsFollow: boolean("robots_follow").notNull().default(true),
  sitemapEnabled: boolean("sitemap_enabled").notNull().default(true),
  sitemapPriority: text("sitemap_priority").notNull().default("0.6"),
});

export const insertServiceSchema = createInsertSchema(servicesTable, {
  title: (schema) => schema.min(1, "Title is required").max(180, "Title is too long"),
  slug: slugSchema,
  excerpt: optionalText(500, "Excerpt"),
  body: optionalText(20000, "Body content"),
  featuredImage: optionalUrlSchema("Featured image"),
  galleryImages: z.array(z.string().max(2048, "Gallery image URL is too long")).default([]),
  contentBlocks: z.array(z.record(z.string(), z.unknown())).default([]),
  category: optionalText(120, "Category"),
  tags: z.array(z.string().max(80, "Tag is too long")).default([]),
  icon: optionalText(120, "Icon"),
  features: z.array(z.string().max(240, "Feature is too long")).default([]),
  pricingNote: optionalText(500, "Pricing note"),
  homepageTabTitle: optionalText(180, "Homepage tab title"),
  homepageShortDescription: optionalText(700, "Homepage short description"),
  businessBenefits: z.array(z.string().max(280, "Business benefit is too long")).default([]),
  showOnHomepage: z.boolean().default(false),
  shortHeroDescription: optionalText(500, "Short hero description"),
  longIntroHeading: optionalText(220, "Long intro heading"),
  longIntroDescription: optionalText(3000, "Long intro description"),
  heroImage: optionalUrlSchema("Hero image"),
  heroCTAButtonText: optionalText(80, "Primary CTA text"),
  heroCTAButtonLink: optionalUrlSchema("Primary CTA URL"),
  secondaryCTAButtonText: optionalText(80, "Secondary CTA text"),
  secondaryCTAButtonLink: optionalUrlSchema("Secondary CTA URL"),
  ...serviceStructuredContentSchema,
  status: contentStatusSchema.default("draft"),
  publishedAt: z.coerce.date().nullable().optional(),
  seoTitle: optionalText(180, "SEO title"),
  metaDescription: optionalText(320, "Meta description"),
  focusKeyword: optionalText(120, "Focus keyword"),
  canonicalUrl: optionalUrlSchema("Canonical URL"),
  robotsIndex: robotsIndexSchema,
  robotsFollow: z.boolean().default(true),
  ogTitle: optionalText(180, "Open Graph title"),
  ogDescription: optionalText(320, "Open Graph description"),
  ogImage: optionalUrlSchema("Open Graph image"),
  twitterTitle: optionalText(180, "Twitter title"),
  twitterDescription: optionalText(320, "Twitter description"),
  twitterImage: optionalUrlSchema("Twitter image"),
  schemaType: optionalText(80, "Schema type"),
  sitemapEnabled: z.boolean().default(true),
  sitemapPriority: sitemapPrioritySchema.default("0.6"),
}).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });

export const updateServiceSchema = insertServiceSchema.partial();

export const selectServiceSchema = createSelectSchema(servicesTable);

export type Service = typeof servicesTable.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;
