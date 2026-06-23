import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

// ─── File upload setup ────────────────────────────────────────────────────────
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureDir(UPLOADS_DIR);
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, "_");
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|svg|ico|pdf)$/i;
    cb(null, allowed.test(file.originalname));
  },
});

router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded or invalid file type" });
    return;
  }
  const url = `/api/cms/uploads/${req.file.filename}`;
  res.json({ ok: true, url, filename: req.file.filename });
});

router.get("/uploads/:filename", (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.sendFile(filePath);
});

// ─── Generic page CMS factory ─────────────────────────────────────────────────
function readJson(filePath: string) {
  try {
    if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch { /* ignore */ }
  return null;
}

function writeJson(filePath: string, data: unknown) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function createPageRouter(pageKey: string, defaultContent: Record<string, unknown>) {
  const pr = Router();
  const DRAFT_FILE = path.join(DATA_DIR, `${pageKey}.draft.json`);
  const PUBLISHED_FILE = path.join(DATA_DIR, `${pageKey}.published.json`);
  const withDefaults = (value: Record<string, unknown> | null) => ({ ...defaultContent, ...(value || {}) });

  function getDraft() {
    const draft = readJson(DRAFT_FILE);
    return draft
      ? withDefaults(draft)
      : { ...defaultContent, _meta: { ...(defaultContent._meta as object || {}), status: "draft" } };
  }
  function getPublished() {
    return withDefaults(readJson(PUBLISHED_FILE));
  }

  pr.get("/", (_req, res) => res.json(getPublished()));
  pr.get("/draft", (_req, res) => res.json(getDraft()));

  pr.put("/draft", (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object") { res.status(400).json({ error: "Invalid body" }); return; }
    const now = new Date().toISOString();
    const draft = { ...body, _meta: { ...(body._meta || {}), status: "draft", lastSavedAt: now } };
    writeJson(DRAFT_FILE, draft);
    res.json({ ok: true, savedAt: now, content: draft });
  });

  pr.post("/publish", (_req, res) => {
    const draft = getDraft();
    const now = new Date().toISOString();
    const draftMeta = draft._meta && typeof draft._meta === "object" ? draft._meta as Record<string, unknown> : {};
    const published = { ...draft, _meta: { ...draftMeta, status: "published", publishedAt: now, lastSavedAt: now } };
    writeJson(PUBLISHED_FILE, published);
    writeJson(DRAFT_FILE, published);
    res.json({ ok: true, publishedAt: now, content: published });
  });

  pr.post("/unpublish", (_req, res) => {
    const published = getPublished();
    const now = new Date().toISOString();
    const publishedMeta = published._meta && typeof published._meta === "object" ? published._meta as Record<string, unknown> : {};
    const draft = { ...published, _meta: { ...publishedMeta, status: "draft", lastSavedAt: now } };
    writeJson(DRAFT_FILE, draft);
    res.json({ ok: true, savedAt: now, content: draft });
  });

  pr.post("/reset", (_req, res) => {
    const now = new Date().toISOString();
    const reset = { ...defaultContent, _meta: { status: "published", lastSavedAt: now, publishedAt: now } };
    writeJson(PUBLISHED_FILE, reset);
    writeJson(DRAFT_FILE, reset);
    res.json({ ok: true, content: reset });
  });

  return pr;
}

// ─── HOME page defaults ───────────────────────────────────────────────────────
const HOME_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  homepageLayout: [
    { id: "hero", label: "Hero Section", visible: true, order: 0 },
    { id: "trust", label: "Business Intelligence / Hero Visual Block", visible: true, order: 1 },
    { id: "about", label: "About / Intro Section", visible: true, order: 2 },
    { id: "services", label: "Services Showcase Section", visible: true, order: 3 },
    { id: "products", label: "Products Showcase Section", visible: true, order: 4 },
    { id: "industries", label: "Industries Showcase Section", visible: true, order: 5 },
    { id: "portfolio", label: "Portfolio / Case Studies Showcase Section", visible: true, order: 6 },
    { id: "whyChoose", label: "Why ADT Section", visible: true, order: 7 },
    { id: "metrics", label: "Metrics / Stats Section", visible: true, order: 8 },
    { id: "process", label: "Methodology Section", visible: true, order: 9 },
    { id: "technology", label: "Technology Section", visible: false, order: 10 },
    { id: "values", label: "Values Section", visible: true, order: 11 },
    { id: "freeValue", label: "Free Value Section", visible: true, order: 12 },
    { id: "testimonials", label: "Testimonials Section", visible: false, order: 13 },
    { id: "insights", label: "Insights / Articles Preview Section", visible: false, order: 14 },
    { id: "faq", label: "FAQ Section", visible: false, order: 15 },
    { id: "finalCta", label: "Final CTA Section", visible: true, order: 16 },
  ],
  homeCardSections: {
    topFeatures: {
      visible: true,
      animationEnabled: true,
      animationPreset: "fade-up",
      hoverEnabled: true,
      cards: [
        { id: "a1", title: "Turn Data into Decisions", desc: "Transform raw business data into dashboards, KPIs, and executive-ready insights.", icon: "analytics", visible: true, order: 0 },
        { id: "a2", title: "Automate Repetitive Workflows", desc: "Reduce manual handoffs with AI agents, workflow automation, and integrated systems.", icon: "automation", visible: true, order: 1 },
        { id: "a3", title: "Build Future-Ready Digital Products", desc: "Launch scalable web, mobile, and SaaS platforms designed for growth.", icon: "web", visible: true, order: 2 },
      ],
    },
    capabilities: {
      visible: true,
      animationEnabled: true,
      animationPreset: "fade-up",
      hoverEnabled: true,
      cards: [
        { id: "t1", title: "AI Agents", desc: "Chatbots, support assistants, and workflow copilots.", icon: "ai", visible: true, order: 0 },
        { id: "t2", title: "BI Dashboards", desc: "Power BI, KPI reporting, and decision intelligence.", icon: "analytics", visible: true, order: 1 },
        { id: "t3", title: "Web & Mobile Apps", desc: "Scalable digital products for real business workflows.", icon: "mobile", visible: true, order: 2 },
        { id: "t4", title: "Workflow Automation", desc: "N8N, Make.com, Zapier, and custom automation.", icon: "automation", visible: true, order: 3 },
        { id: "t5", title: "Predictive Analytics", desc: "Forecasting, segmentation, and smarter planning.", icon: "database", visible: true, order: 4 },
        { id: "t6", title: "Custom Software", desc: "Business systems built around your operations.", icon: "web", visible: true, order: 5 },
      ],
    },
  },
  whyAdtSection: {
    sectionKey: "whyAdt",
    badgeText: "Why ADT",
    heading: "Why Choose ADT SoftTech?",
    subtitle: "A practical delivery partner for AI, analytics, automation, mobile, and software engineering.",
    backgroundType: "gradient",
    backgroundColor: "#020617",
    backgroundGradient: "linear-gradient(135deg, #020617 0%, #07111f 48%, #111827 100%)",
    backgroundMediaUrl: "",
    backgroundOverlayColor: "#020617",
    backgroundOverlayOpacity: 68,
    backgroundPosition: "center",
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    sectionPadding: "py-24 lg:py-28",
    sectionMinHeight: "",
    textColor: "#ffffff",
    headingColor: "#ffffff",
    subtitleColor: "#cbd5e1",
    cardBackgroundColor: "rgba(15, 23, 42, 0.72)",
    cardBorderColor: "rgba(148, 163, 184, 0.18)",
    cardGlowColor: "rgba(34, 211, 238, 0.28)",
    cards: [
      { id: "why-proven-track-record", title: "Proven Track Record", description: "We focus on solving practical business challenges through measurable digital solutions.", icon: "values", isVisible: true, isPublished: true, sortOrder: 0, accentColor: "#22d3ee", styleVariant: "glass" },
      { id: "why-industry-expertise", title: "Industry-Specific Expertise", description: "We design solutions around the real workflows, standards, and requirements of your industry.", icon: "process", isVisible: true, isPublished: true, sortOrder: 1, accentColor: "#60a5fa", styleVariant: "glass" },
      { id: "why-multidisciplinary-team", title: "Skilled Multidisciplinary Team", description: "We combine analytics, AI, automation, mobile, and software engineering under one strategy.", icon: "users", isVisible: true, isPublished: true, sortOrder: 2, accentColor: "#a78bfa", styleVariant: "glass" },
      { id: "why-global-expansion", title: "Global Expansion", description: "Professional connections across Canada, KSA, UAE, and Pakistan support agile global collaboration.", icon: "network", isVisible: true, isPublished: true, sortOrder: 3, accentColor: "#22d3ee", styleVariant: "glass" },
      { id: "why-on-time-delivery", title: "On-Time Delivery", description: "Clear scoping, milestone-driven execution, and reliable delivery timelines.", icon: "process", isVisible: true, isPublished: true, sortOrder: 4, accentColor: "#38bdf8", styleVariant: "glass" },
      { id: "why-premium-value", title: "Premium Value", description: "Flexible engagement options including fixed-price work, hourly support, and dedicated delivery models.", icon: "sparkles", isVisible: true, isPublished: true, sortOrder: 5, accentColor: "#c084fc", styleVariant: "glass" },
    ],
  },
  hero: {
    visible: true,
    badge: "Best AI & Data Solutions Company",
    heading: "AI-Driven Solutions for Enterprise Efficiency",
    description: "We build intelligent software systems using AI, data analytics, and automation to help businesses scale and innovate.",
    backgroundImage: "/hero-bg.webp",
    backgroundOpacity: 20,
    buttons: [
      { id: "b1", text: "Explore Services", link: "/services", variant: "primary", visible: true },
      { id: "b2", text: "Start Your Project", link: "/contact", variant: "outline", visible: true },
      { id: "b3", text: "Free Consultation", link: "/free-services", variant: "glass", icon: "Gift", visible: true },
    ],
  },
  stats: {
    visible: true,
    items: [
      { id: "s1", value: "50+", label: "Projects Delivered", icon: "Briefcase", visible: true, order: 0 },
      { id: "s2", value: "30+", label: "Happy Clients", icon: "Users", visible: true, order: 1 },
      { id: "s3", value: "5+", label: "AI Products", icon: "Package", visible: true, order: 2 },
      { id: "s4", value: "99%", label: "Client Satisfaction", icon: "Star", visible: true, order: 3 },
    ],
  },
  showcase: {
    visible: true,
    sectionTitle: "Showcasing Our",
    sectionTitleHighlight: "Best Work",
    sectionSubtitle: "Discover the transformative solutions we've built. From predictive analytics to autonomous agents.",
    viewAllText: "View All Products",
    viewAllLink: "/products",
    items: [
      { id: "sw1", tag: "Featured Service", title: "Enterprise AI Agents", desc: "Custom trained LLMs that automate customer support and internal HR workflows.", color: "from-blue-500 to-cyan-400", icon: "Bot", visible: true, order: 0 },
      { id: "sw2", tag: "Featured Product", title: "E-Commerce BI Dashboard", desc: "Real-time analytics platform providing predictive insights for retail.", color: "from-purple-500 to-indigo-400", icon: "BarChart3", visible: true, order: 1 },
      { id: "sw3", tag: "Recent Work", title: "N8N Workflow Automation", desc: "Saved 40 hrs/week for a logistics company by connecting 15+ disconnected APIs.", color: "from-emerald-400 to-teal-500", icon: "Zap", visible: true, order: 2 },
    ],
  },
  freeServices: {
    visible: true,
    badge: "100% Free — No Strings Attached",
    heading: "Kickstart Your Project",
    headingHighlight: "For Free",
    description: "Get a free consultation, problem analysis, solution roadmap, and more. We invest in your success before you invest in us.",
    primaryButtonText: "Claim Your Free Services",
    primaryButtonLink: "/free-services",
    secondaryButtonText: "Email Us Directly",
    secondaryButtonEmail: "adtsofttech@gmail.com",
    items: [
      { id: "fs1", title: "Free Consultation", desc: "30-min strategy call.", visible: true, order: 0 },
      { id: "fs2", title: "Problem Analysis", desc: "We identify workflow bottlenecks.", visible: true, order: 1 },
      { id: "fs3", title: "Solution Suggestions", desc: "High-level architecture roadmap.", visible: true, order: 2 },
      { id: "fs4", title: "Startup Guidance", desc: "Tech-stack advice for founders.", visible: true, order: 3 },
      { id: "fs5", title: "Free Templates", desc: "Starter code & Notion docs.", visible: true, order: 4 },
      { id: "fs6", title: "Free Courses", desc: "Basic AI & Data training.", visible: true, order: 5 },
    ],
  },
  testimonials: {
    visible: true,
    sectionTitle: "What Our Clients Say",
    sectionSubtitle: "Real feedback from real businesses we've helped transform.",
    items: [
      { id: "t1", name: "Sarah Mitchell", role: "CTO, FinEdge Solutions", text: "ADT SoftTech delivered an AI agent that reduced our support tickets by 70%. Their technical depth is unmatched.", visible: true, order: 0 },
      { id: "t2", name: "James Rodriguez", role: "Operations Director, LogiTrack", text: "The N8N automation they built saved our team 40 hours per week. Incredible ROI within the first month.", visible: true, order: 1 },
      { id: "t3", name: "Amara Okafor", role: "CEO, DataPulse Analytics", text: "Their Power BI dashboards transformed how we make decisions. Real-time insights that actually drive action.", visible: true, order: 2 },
      { id: "t4", name: "David Chen", role: "VP Engineering, CloudStack", text: "Working with ADT SoftTech felt like having an extension of our own engineering team. Highly professional.", visible: true, order: 3 },
      { id: "t5", name: "Priya Sharma", role: "Founder, EduNest", text: "They built our entire learning platform from scratch — mobile app, backend, analytics. Flawless execution.", visible: true, order: 4 },
      { id: "t6", name: "Marcus Weber", role: "Head of Digital, RetailMax", text: "Our e-commerce analytics dashboard reduced stockouts by 45%. The data visibility is transformative.", visible: true, order: 5 },
      { id: "t7", name: "Fatima Al-Hassan", role: "Director, HealthBridge AI", text: "The AI chatbot they deployed handles patient queries 24/7. Our staff can now focus on critical cases.", visible: true, order: 6 },
      { id: "t8", name: "Thomas Erikson", role: "CIO, Nordic Finance Group", text: "Enterprise-grade quality at startup speed. Their team understood our compliance needs from day one.", visible: true, order: 7 },
      { id: "t9", name: "Lisa Park", role: "Product Manager, AppForge", text: "The Flutter app they built launched on both platforms in 3 months. 10K downloads in the first week.", visible: true, order: 8 },
      { id: "t10", name: "Ahmed Khalil", role: "Managing Director, Gulf Ventures", text: "Their strategic consulting helped us identify $2M in automation savings. ADT SoftTech is a true partner.", visible: true, order: 9 },
      { id: "t11", name: "Rebecca Torres", role: "HR Director, TalentSphere", text: "The HR screening agent cut our hiring process time by 60%. The AI interview system is brilliant.", visible: true, order: 10 },
      { id: "t12", name: "Michael Foster", role: "CEO, GreenTech Innovations", text: "From consultation to deployment, ADT SoftTech exceeded every expectation. World-class engineering team.", visible: true, order: 11 },
      { id: "t13", name: "Nina Petrov", role: "Data Lead, MarketView", text: "Their predictive analytics model improved our forecast accuracy by 27%. Data-driven decisions made easy.", visible: true, order: 12 },
      { id: "t14", name: "Carlos Mendez", role: "Founder, QuickShip Logistics", text: "The workflow automation eliminated all manual data entry. Our error rate dropped to nearly zero.", visible: true, order: 13 },
      { id: "t15", name: "Emily Watson", role: "COO, PixelCraft Studios", text: "ADT SoftTech's free consultation alone gave us a roadmap worth thousands. Their generosity is genuine.", visible: true, order: 14 },
    ],
  },
  industries: {
    visible: true,
    sectionTitle: "Industries We Empower",
    items: [
      { id: "i1", name: "Healthcare", visible: true, order: 0 },
      { id: "i2", name: "Finance", visible: true, order: 1 },
      { id: "i3", name: "Retail", visible: true, order: 2 },
      { id: "i4", name: "E-commerce", visible: true, order: 3 },
      { id: "i5", name: "Education", visible: true, order: 4 },
      { id: "i6", name: "Tech Startups", visible: true, order: 5 },
      { id: "i7", name: "Logistics", visible: true, order: 6 },
    ],
  },
  branding: {
    faviconUrl: "/favicon.png",
    appleTouchIconUrl: "/logo-square.png",
  },
  navbar: {
    brandName: "ADT SoftTech",
    logoUrl: "/brand-logo.gif",
    links: [
      { id: "n1", name: "Home", path: "/", visible: true, order: 0, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 0, sortOrderFooter: 0, sortOrderMobile: 0 },
      { id: "n2", name: "About", path: "/about", visible: true, order: 1, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 1, sortOrderFooter: 1, sortOrderMobile: 1 },
      { id: "n3", name: "Services", path: "/services", visible: true, order: 2, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 2, sortOrderFooter: 2, sortOrderMobile: 2 },
      { id: "n4", name: "Products", path: "/products", visible: true, order: 3, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 3, sortOrderFooter: 3, sortOrderMobile: 3 },
      { id: "n5", name: "Portfolio", path: "/portfolio", visible: true, order: 4, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 4, sortOrderFooter: 4, sortOrderMobile: 4 },
      { id: "n6", name: "Articles", path: "/articles", visible: true, order: 5, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 5, sortOrderFooter: 5, sortOrderMobile: 5 },
      { id: "n7", name: "Free Services", path: "/free-services", visible: true, order: 6, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 6, sortOrderFooter: 6, sortOrderMobile: 6 },
      { id: "n8", name: "Support", path: "/support", visible: true, order: 7, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 7, sortOrderFooter: 7, sortOrderMobile: 7 },
      { id: "n9", name: "Contact", path: "/contact", visible: true, order: 8, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 8, sortOrderFooter: 8, sortOrderMobile: 8 },
      { id: "n10", name: "Client Portal", path: "/portal", visible: true, order: 9, showInHeaderNav: true, showInFooterNav: true, showInMobileNav: true, sortOrderHeader: 9, sortOrderFooter: 9, sortOrderMobile: 9 },
      { id: "n11", name: "Privacy Policy", path: "/privacy", visible: true, order: 10, showInHeaderNav: false, showInFooterNav: true, showInMobileNav: false, sortOrderHeader: 10, sortOrderFooter: 10, sortOrderMobile: 10 },
      { id: "n12", name: "Terms of Service", path: "/terms", visible: true, order: 11, showInHeaderNav: false, showInFooterNav: true, showInMobileNav: false, sortOrderHeader: 11, sortOrderFooter: 11, sortOrderMobile: 11 },
    ],
  },
  footer: {
    brandName: "ADT SoftTech",
    logoUrl: "/brand-logo.gif",
    description: "Best AI & Data Solutions Company. We build intelligent software systems, AI agents, analytics dashboards, and automation to help businesses scale.",
    email: "adtsofttech@gmail.com",
    phone: "+92 331 720 3878",
    whatsappLink: "https://wa.me/923317203878",
    copyright: "© {year} ADT SoftTech. All rights reserved.",
    socialLinks: [
      { id: "sl1", name: "LinkedIn (Tehseen)", url: "https://www.linkedin.com/in/rm-tehseen-dataanalyst/", visible: true },
      { id: "sl2", name: "LinkedIn (Saim)", url: "https://www.linkedin.com/in/allah-ditta-saim-flutter-developer/", visible: true },
    ],
    showPrivacyPolicy: true,
    showTerms: true,
    background: {
      type: "default",
      color: "#020617",
      gradient: "linear-gradient(135deg, #020617 0%, #0f172a 55%, #111827 100%)",
      mediaUrl: "",
      position: "center",
      size: "cover",
      repeat: "no-repeat",
      overlayColor: "#020617",
      overlayOpacity: 35,
      textColor: "",
      linkColor: "",
    },
  },
};

// ─── ABOUT page defaults ──────────────────────────────────────────────────────
const ABOUT_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: {
    visible: true,
    badge: "About Us",
    heading: "Driving the",
    headingHighlight: "AI Revolution",
    headingSuffix: "Forward",
    description: "ADT SoftTech (Analytics · Development · Transformation) was founded on a simple premise: businesses need intelligent, scalable, and automated systems to thrive in the modern era. We bridge the gap between complex data science and practical business applications.",
    image: "/images/about-vision.png",
    buttons: [
      { id: "b1", text: "Our Services", link: "/services", variant: "primary", visible: true },
      { id: "b2", text: "Contact Us", link: "/contact", variant: "outline", visible: true },
    ],
  },
  missionVision: {
    visible: true,
    items: [
      { id: "mv1", title: "Our Mission", description: "To democratize access to enterprise-grade AI, analytics, and software solutions for businesses of all sizes.", icon: "Target", borderColor: "border-l-primary", visible: true, order: 0 },
      { id: "mv2", title: "Our Vision", description: "A future where seamless automation and predictive insights are the standard, not the exception.", icon: "Zap", borderColor: "border-l-secondary", visible: true, order: 1 },
    ],
  },
  founders: {
    visible: true,
    sectionTitle: "Meet the Founders",
    sectionSubtitle: "The technical minds behind ADT SoftTech.",
    items: [
      { id: "f1", name: "Rana Muhammad Tehseen", role: "Founder & CEO", subtitle: "Data Analyst | AI Builder | Automation Expert", photo: "/team-tehseen.png", initials: "RT", description: "Expert in data science, predictive modeling, and building scalable AI architectures that solve real business bottlenecks. Leads company vision and client strategy.", linkedinUrl: "https://www.linkedin.com/in/rm-tehseen-dataanalyst/", portraitGradient: "from-blue-500 via-cyan-400 to-indigo-600", visible: true, order: 0 },
      { id: "f2", name: "Allah Ditta Saim", role: "Co-Founder & CTO", subtitle: "Flutter Developer | Web/Mobile | AI Integration", photo: "/team-saim.jpeg", initials: "AS", description: "Specializes in Flutter, web, and mobile development, integrating complex AI models into seamless user experiences. Leads all technical architecture and engineering.", linkedinUrl: "https://www.linkedin.com/in/allah-ditta-saim-flutter-developer/", portraitGradient: "from-purple-500 via-pink-400 to-orange-500", visible: true, order: 1 },
    ],
  },
  team: {
    visible: false,
    sectionTitle: "Our Team",
    items: [],
  },
  stats: {
    visible: true,
    sectionTitle: "By the Numbers",
    items: [
      { id: "as1", value: "50+", label: "Projects Delivered", icon: "Briefcase", visible: true, order: 0 },
      { id: "as2", value: "30+", label: "Happy Clients", icon: "Users", visible: true, order: 1 },
      { id: "as3", value: "5+", label: "AI Products", icon: "Package", visible: true, order: 2 },
      { id: "as4", value: "99%", label: "Client Satisfaction", icon: "Star", visible: true, order: 3 },
    ],
  },
  values: {
    visible: true,
    sectionTitle: "Core Values",
    items: [
      { id: "v1", title: "Innovation First", visible: true, order: 0 },
      { id: "v2", title: "Data-Driven Decisions", visible: true, order: 1 },
      { id: "v3", title: "Uncompromising Quality", visible: true, order: 2 },
      { id: "v4", title: "Transparent Communication", visible: true, order: 3 },
      { id: "v5", title: "Scalable Architecture", visible: true, order: 4 },
      { id: "v6", title: "Client Empowerment", visible: true, order: 5 },
    ],
  },
};

// ─── SERVICES page defaults ───────────────────────────────────────────────────
const SERVICES_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, heading: "Our", headingHighlight: "Services", description: "Comprehensive technology solutions designed to scale, automate, and analyze." },
  services: {
    visible: true,
    items: [
      { id: "sv1", title: "AI Solutions", icon: "Bot", description: "Custom AI Chatbots, Intelligent Agents, and Workflow Automation tailored to your data.", features: [{ id: "sv1f1", text: "LLM Fine-tuning", visible: true }, { id: "sv1f2", text: "RAG Systems", visible: true }, { id: "sv1f3", text: "24/7 Support Bots", visible: true }], ctaText: "Get This Service", ctaEmail: "adtsofttech@gmail.com", category: "AI", visible: true, order: 0 },
      { id: "sv2", title: "Data Analytics", icon: "BarChart", description: "Transform raw data into strategic assets with interactive dashboards and predictive models.", features: [{ id: "sv2f1", text: "Power BI Dashboards", visible: true }, { id: "sv2f2", text: "Predictive Analytics", visible: true }, { id: "sv2f3", text: "Data Pipeline ETL", visible: true }], ctaText: "Get This Service", ctaEmail: "adtsofttech@gmail.com", category: "Analytics", visible: true, order: 1 },
      { id: "sv3", title: "Web Development", icon: "Code", description: "High-performance, scalable web applications and SaaS platforms built with modern stacks.", features: [{ id: "sv3f1", text: "React/Next.js Apps", visible: true }, { id: "sv3f2", text: "Custom Business Portals", visible: true }, { id: "sv3f3", text: "API Development", visible: true }], ctaText: "Get This Service", ctaEmail: "adtsofttech@gmail.com", category: "Development", visible: true, order: 2 },
      { id: "sv4", title: "Mobile Development", icon: "Smartphone", description: "Cross-platform mobile experiences that feel native and integrate seamlessly with your backend.", features: [{ id: "sv4f1", text: "Flutter Development", visible: true }, { id: "sv4f2", text: "iOS & Android", visible: true }, { id: "sv4f3", text: "Mobile UI/UX Design", visible: true }], ctaText: "Get This Service", ctaEmail: "adtsofttech@gmail.com", category: "Development", visible: true, order: 3 },
      { id: "sv5", title: "Workflow Automation", icon: "Zap", description: "Eliminate manual tasks by connecting your tools and APIs into intelligent autonomous flows.", features: [{ id: "sv5f1", text: "N8N Pipelines", visible: true }, { id: "sv5f2", text: "Make.com & Zapier", visible: true }, { id: "sv5f3", text: "AI Agent Handoffs", visible: true }], ctaText: "Get This Service", ctaEmail: "adtsofttech@gmail.com", category: "Automation", visible: true, order: 4 },
    ],
  },
  pricing: {
    visible: true,
    sectionTitle: "Transparent Pricing",
    sectionSubtitle: "Tailored plans based on your specific requirements.",
    plans: [
      { id: "p1", name: "Starter Plan", description: "Perfect for small businesses starting their digital transformation.", price: "Custom", popular: false, features: [{ id: "p1f1", text: "Basic Web Development", visible: true }, { id: "p1f2", text: "Simple Analytics Dashboard", visible: true }, { id: "p1f3", text: "Standard Support Setup", visible: true }, { id: "p1f4", text: "Email Support", visible: true }], ctaText: "Request Quote", ctaEmail: "adtsofttech@gmail.com", visible: true, order: 0 },
      { id: "p2", name: "Professional Plan", description: "Comprehensive solutions for growing companies needing scale.", price: "Custom", popular: true, features: [{ id: "p2f1", text: "Advanced Web/Mobile Apps", visible: true }, { id: "p2f2", text: "Custom AI Chatbot Integration", visible: true }, { id: "p2f3", text: "Predictive Analytics Models", visible: true }, { id: "p2f4", text: "Priority Support", visible: true }, { id: "p2f5", text: "Basic Workflow Automation", visible: true }], ctaText: "Request Quote", ctaEmail: "adtsofttech@gmail.com", visible: true, order: 1 },
      { id: "p3", name: "Enterprise Plan", description: "Full-scale dedicated architecture and AI engineering.", price: "Custom", popular: false, features: [{ id: "p3f1", text: "Full Ecosystem Development", visible: true }, { id: "p3f2", text: "Dedicated Autonomous AI Agents", visible: true }, { id: "p3f3", text: "Complex N8N Automations", visible: true }, { id: "p3f4", text: "24/7 Dedicated Support", visible: true }, { id: "p3f5", text: "On-premise deployment options", visible: true }], ctaText: "Request Quote", ctaEmail: "adtsofttech@gmail.com", visible: true, order: 2 },
    ],
  },
  cta: { visible: true, heading: "Ready to Transform Your Business?", description: "Schedule a free consultation with our team and get started today.", buttonText: "Start Free Consultation", buttonLink: "/free-services" },
};

// ─── PRODUCTS page defaults ───────────────────────────────────────────────────
const PRODUCTS_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, heading: "Ready-to-Deploy", headingHighlight: "AI Products", description: "Accelerate your operations with our pre-built intelligent agents, customizable to your exact data and brand." },
  liveProducts: {
    visible: true,
    sectionTitle: "Live Products",
    items: [
      { id: "lp1", title: "Support AI Agent", icon: "Headphones", image: "", description: "An intelligent L1 support agent that resolves 80% of customer queries instantly using your knowledge base.", features: [{ id: "lp1f1", text: "Multi-channel integration", visible: true }, { id: "lp1f2", text: "Human handoff routing", visible: true }, { id: "lp1f3", text: "Sentiment analysis", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: Support AI Agent", status: "live", visible: true, order: 0 },
      { id: "lp2", title: "NewsifyX", icon: "Youtube", image: "", description: "AI-powered YouTube video summarizer that converts long videos into concise, actionable summaries.", features: [{ id: "lp2f1", text: "YouTube video summarization", visible: true }, { id: "lp2f2", text: "Key insights extraction", visible: true }, { id: "lp2f3", text: "Multi-language support", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: NewsifyX", status: "live", visible: true, order: 1 },
      { id: "lp3", title: "Business Analytics Agent", icon: "LineChart", image: "", description: "Chat with your database. Ask questions in plain English and receive instant charts and actionable insights.", features: [{ id: "lp3f1", text: "SQL Generation", visible: true }, { id: "lp3f2", text: "Real-time visual plotting", visible: true }, { id: "lp3f3", text: "Exportable reports", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: Business Analytics Agent", status: "live", visible: true, order: 2 },
      { id: "lp4", title: "HR Screening Agent", icon: "FileSearch", image: "", description: "Automate initial candidate screening. The agent conducts text/voice interviews and scores candidates.", features: [{ id: "lp4f1", text: "Resume parsing", visible: true }, { id: "lp4f2", text: "Automated scheduling", visible: true }, { id: "lp4f3", text: "Bias mitigation", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: HR Screening Agent", status: "live", visible: true, order: 3 },
      { id: "lp5", title: "Automation Assistant", icon: "Workflow", image: "", description: "A co-pilot that watches your digital tasks and suggests/builds automated workflows via N8N.", features: [{ id: "lp5f1", text: "Activity monitoring", visible: true }, { id: "lp5f2", text: "No-code script generation", visible: true }, { id: "lp5f3", text: "Error handling", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: Automation Assistant", status: "live", visible: true, order: 4 },
      { id: "lp6", title: "AI Knowledge Bot", icon: "BookOpen", image: "", description: "Internal company brain. Connects to Notion, Slack, Drive, and answers team questions instantly.", features: [{ id: "lp6f1", text: "Secure RAG architecture", visible: true }, { id: "lp6f2", text: "Access control", visible: true }, { id: "lp6f3", text: "Citation links", visible: true }], ctaText: "View Product Details", ctaLink: "mailto:adtsofttech@gmail.com?subject=Product Inquiry: AI Knowledge Bot", status: "live", visible: true, order: 5 },
    ],
  },
  portfolioProducts: {
    visible: true,
    sectionTitle: "Portfolio Products",
    items: [],
  },
};

// ─── ARTICLES page defaults ───────────────────────────────────────────────────
const ARTICLES_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, badge: "Engineering Insights", heading: "Latest", headingHighlight: "Insights", subheading: "Thoughts, guides, and engineering logs from our team." },
  items: [],
  seo: { metaTitle: "Articles — ADT SoftTech", metaDescription: "Engineering insights, AI tutorials, and tech guides from the ADT SoftTech team.", keywords: "AI articles, data analytics blog, software engineering", canonical: "", robots: "index, follow", ogTitle: "", ogDescription: "", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

// ─── PORTFOLIO (Case Studies) page defaults ───────────────────────────────────
const PORTFOLIO_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, badge: "Our Work", heading: "Our", headingHighlight: "Case Studies", subheading: "Real-world problems solved with elegant engineering." },
  categories: [],
  items: [],
  seo: { metaTitle: "Case Studies — ADT SoftTech", metaDescription: "Real-world AI, data analytics, and automation projects delivered by ADT SoftTech.", keywords: "case studies, AI projects, data analytics portfolio", canonical: "", robots: "index, follow", ogTitle: "", ogDescription: "", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

// ─── SUPPORT page defaults ────────────────────────────────────────────────────
const SUPPORT_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, badge: "Help Center", heading: "How can we", headingHighlight: "help you?", subheading: "Browse our FAQ, submit a ticket, or reach out directly." },
  faqs: [
    { id: "faq1", question: "What is the typical timeline for an AI integration project?", answer: "Most standard integrations take 4-8 weeks. Complex enterprise deployments can take 3-6 months depending on data readiness.", visible: true, order: 0 },
    { id: "faq2", question: "Do you offer post-launch support?", answer: "Yes, all our Professional and Enterprise plans include dedicated SLA support and maintenance.", visible: true, order: 1 },
    { id: "faq3", question: "Can you work with our existing legacy databases?", answer: "Absolutely. We specialize in building ETL pipelines that connect modern AI and BI tools to legacy systems.", visible: true, order: 2 },
    { id: "faq4", question: "Is our data secure with your AI models?", answer: "Data security is paramount. We deploy models within your cloud environment (Azure, AWS, GCP) so data never leaves your perimeter.", visible: true, order: 3 },
    { id: "faq5", question: "Do you provide source code access?", answer: "Yes, upon project completion and full payment, clients receive full ownership and source code.", visible: true, order: 4 },
    { id: "faq6", question: "How do you charge for projects?", answer: "We offer both fixed-price milestone billing for defined scopes and time/materials for exploratory AI R&D.", visible: true, order: 5 },
    { id: "faq-home-1", question: "What does ADT SoftTech specialize in?", answer: "ADT SoftTech specializes in AI systems, data analytics, automation, web development, mobile apps, and business intelligence solutions.", visible: true, order: 6 },
    { id: "faq-home-2", question: "Can ADT SoftTech build AI chatbots and AI agents?", answer: "Yes. We build AI chatbots, AI agents, LLM integrations, RAG systems, and automation bots for support, knowledge, operations, and internal workflows.", visible: true, order: 7 },
    { id: "faq-home-3", question: "Do you provide data analytics dashboards for businesses?", answer: "Yes. We design Power BI dashboards, KPI reporting systems, predictive analytics workflows, and business intelligence dashboards.", visible: true, order: 8 },
    { id: "faq-home-4", question: "Can you develop web and mobile applications?", answer: "Yes. We build business websites, SaaS platforms, custom web applications, Flutter apps, Android/iOS apps, APIs, and maintenance systems.", visible: true, order: 9 },
    { id: "faq-home-5", question: "Do you offer automation using N8N, Make.com, or Zapier?", answer: "Yes. We create N8N automations, Make.com workflows, Zapier integrations, and custom AI workflow automation.", visible: true, order: 10 },
    { id: "faq-home-6", question: "Which industries do you work with?", answer: "We work with healthcare, finance, retail, e-commerce, education, technology startups, logistics, HR Tech, and data-driven organizations.", visible: true, order: 11 },
    { id: "faq-home-7", question: "How can I start a project with ADT SoftTech?", answer: "You can start by booking a free consultation through the website or contacting us on WhatsApp at +92 331 720 3878.", visible: true, order: 12 },
    { id: "faq-home-8", question: "Do you offer free consultation or startup guidance?", answer: "Yes. ADT SoftTech offers free consultation, problem analysis, solution suggestions, startup guidance, templates, and learning resources.", visible: true, order: 13 },
  ],
  seo: { metaTitle: "Support & FAQ — ADT SoftTech", metaDescription: "Get help from the ADT SoftTech team. Browse our FAQ or submit a support ticket.", keywords: "support, FAQ, technical help, ADT SoftTech", canonical: "", robots: "index, follow", ogTitle: "", ogDescription: "", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

// ─── FREE SERVICES page defaults ─────────────────────────────────────────────
const FREE_SERVICES_LEGACY_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, badge: "100% Free — No Strings Attached", heading: "Free", headingHighlight: "Services", subheading: "We believe in giving back to the community. These services are completely free for startups, students, and businesses." },
  items: [],
  cta: { visible: true, heading: "Need Something Custom?", description: "Our paid services start with flexible pricing designed for businesses of every size." },
  seo: { metaTitle: "Free Services — ADT SoftTech", metaDescription: "Free AI consultations, startup guidance, code templates, and tools from ADT SoftTech.", keywords: "free AI consultation, startup guidance, free code templates", canonical: "", robots: "index, follow", ogTitle: "", ogDescription: "", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

// ─── CONTACT page defaults ────────────────────────────────────────────────────
const FREE_SERVICES_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, badge: "Digital Products Marketplace", heading: "Get Ready-to-Use", headingHighlight: "Digital Assets", subheading: "Browse free and paid templates, datasets, courses, tools, themes, and business-ready products built by ADT SoftTech." },
  items: [
    { id: "fsi1", title: "Startup Project Planner Template", desc: "A free planning template for MVP scope, milestones, tech stack, launch tasks, and project priorities.", icon: "FileText", thumbnail: "", productKind: "template", pricingType: "free", price: "Free", badge: "Free Template", primaryCtaText: "Get Free Template", secondaryCtaText: "Ask for Help", secondaryCtaUrl: "/contact?inquiryType=Template%20Support", deliveryUrl: "", visible: true, order: 0 },
    { id: "fsi2", title: "Business Dashboard KPI Dataset", desc: "Sample dataset for sales, revenue, customers, regions, and KPIs that helps you practice dashboard building.", icon: "Database", thumbnail: "", productKind: "dataset", pricingType: "free", price: "Free", badge: "Free Dataset", primaryCtaText: "Get Dataset", secondaryCtaText: "Need Dashboard?", secondaryCtaUrl: "/contact?inquiryType=Dashboard%20Inquiry", deliveryUrl: "", visible: true, order: 1 },
    { id: "fsi3", title: "AI Automation Ideas Mini Course", desc: "A practical starter course for business owners who want to identify automation opportunities quickly.", icon: "GraduationCap", thumbnail: "", productKind: "course", pricingType: "free", price: "Free", badge: "Free Course", primaryCtaText: "Start Free Course", secondaryCtaText: "Request Roadmap", secondaryCtaUrl: "/contact?inquiryType=Automation%20Roadmap", deliveryUrl: "", visible: true, order: 2 },
    { id: "fsi4", title: "Free Consultation & Problem Audit", desc: "Book a short discovery audit so our team can review your workflow, data, website, or product idea.", icon: "MessageSquare", thumbnail: "", productKind: "service", pricingType: "free", price: "Free", badge: "Free Audit", primaryCtaText: "Claim Free Audit", secondaryCtaText: "WhatsApp Us", secondaryCtaUrl: "https://wa.me/923317203878", deliveryUrl: "", visible: true, order: 3 },
    { id: "fsi5", title: "Power BI Sales Dashboard Pack", desc: "A ready dashboard starter pack for sales tracking, filters, KPIs, charts, and monthly performance views.", icon: "BarChart3", thumbnail: "", productKind: "template", pricingType: "paid", price: "$29", badge: "Paid Template", primaryCtaText: "Purchase Template", secondaryCtaText: "Preview Request", secondaryCtaUrl: "/contact?inquiryType=Power%20BI%20Preview", deliveryUrl: "", visible: true, order: 4 },
    { id: "fsi6", title: "SaaS Landing Page Theme", desc: "A polished website theme structure for SaaS, tools, services, and AI product landing pages.", icon: "Palette", thumbnail: "", productKind: "theme", pricingType: "paid", price: "$39", badge: "Paid Theme", primaryCtaText: "Buy Theme", secondaryCtaText: "Customize It", secondaryCtaUrl: "/contact?inquiryType=Theme%20Customization", deliveryUrl: "", visible: true, order: 5 },
    { id: "fsi7", title: "Lead Capture Automation Kit", desc: "A workflow kit for capturing leads, tagging sources, notifying admin, and organizing follow-up tasks.", icon: "Workflow", thumbnail: "", productKind: "tool", pricingType: "paid", price: "$49", badge: "Paid Tool", primaryCtaText: "Buy Automation Kit", secondaryCtaText: "Need Setup?", secondaryCtaUrl: "/contact?inquiryType=Automation%20Setup", deliveryUrl: "", visible: true, order: 6 },
    { id: "fsi8", title: "E-commerce Analytics Dataset Bundle", desc: "A business-friendly dataset bundle for orders, products, customers, marketing channels, and revenue analysis.", icon: "Database", thumbnail: "", productKind: "dataset", pricingType: "paid", price: "$19", badge: "Paid Dataset", primaryCtaText: "Buy Dataset", secondaryCtaText: "Request Dashboard", secondaryCtaUrl: "/contact?inquiryType=Ecommerce%20Dashboard", deliveryUrl: "", visible: true, order: 7 },
  ],
  cta: { visible: true, heading: "Need a custom digital asset?", description: "Tell us what you need and our team can create a custom template, dataset, dashboard, automation, course, or tool for your business.", buttonText: "Request Custom Product", buttonLink: "/contact" },
  seo: { metaTitle: "Digital Products, Templates, Datasets & Free Tools - ADT SoftTech", metaDescription: "Browse free and paid digital products from ADT SoftTech including templates, datasets, dashboards, courses, tools, and themes for business growth.", keywords: "digital products, free templates, paid dashboards, datasets, AI tools, business templates, ADT SoftTech marketplace", canonical: "", robots: "index, follow", ogTitle: "Digital Products Marketplace - ADT SoftTech", ogDescription: "Get free resources or buy ready-to-use templates, tools, datasets, courses, and dashboards from ADT SoftTech.", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

const CONTACT_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  hero: { visible: true, heading: "Let's Build Something", headingHighlight: "Extraordinary", subheading: "Reach out to discuss your project, request a quote, or schedule a free consultation." },
  email: "adtsofttech@gmail.com",
  whatsapp: "https://wa.me/923317203878",
  whatsappText: "+92 331 720 3878",
  address: "",
  seo: { metaTitle: "Contact — ADT SoftTech", metaDescription: "Contact ADT SoftTech for AI development, data analytics, and digital transformation projects.", keywords: "contact ADT SoftTech, hire AI developer, software development", canonical: "", robots: "index, follow", ogTitle: "", ogDescription: "", ogImage: "", twitterTitle: "", twitterDescription: "", twitterImage: "" },
};

// ─── Mount page routers ────────────────────────────────────────────────────────
const TYPOGRAPHY_PRESETS = ["modern-saas", "premium-tech", "minimal-corporate", "bold-startup", "clean-enterprise"] as const;
const TYPOGRAPHY_FONTS = ["Inter", "Poppins", "Manrope", "Sora", "Plus Jakarta Sans", "DM Sans", "Outfit"] as const;
const TYPOGRAPHY_WEIGHTS = ["400", "500", "600", "700", "800", "900"] as const;
const GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  preset: "modern-saas",
  fonts: { heading: "Poppins", body: "Inter", ui: "Inter", button: "Inter" },
  sizes: { hero: "clamp(2.1rem, 1.45rem + 2.8vw, 3.75rem)", pageTitle: "clamp(1.9rem, 1.47rem + 1.85vw, 3rem)", sectionTitle: "clamp(1.6rem, 1.35rem + 1.05vw, 2.35rem)", cardTitle: "1.125rem", subtitle: "clamp(1rem, 0.97rem + 0.13vw, 1.125rem)", bodyLarge: "clamp(1rem, 0.97rem + 0.13vw, 1.125rem)", body: "1rem", bodySmall: "0.875rem", caption: "0.75rem", badge: "0.75rem", nav: "0.875rem", footer: "0.875rem", button: "0.875rem", formLabel: "0.75rem", input: "0.875rem" },
  weights: { heading: "700", body: "400", button: "500", cardTitle: "700", badge: "600" },
  lineHeights: { heading: "1.16", body: "1.625", button: "1.25" },
  tracking: { heading: "0em", button: "0em", badge: "0.025em" },
};

function safeEnum<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]) {
  const str = String(value);
  return allowed.includes(str as T[number]) ? str as T[number] : fallback;
}

function safeTypographyFont(value: unknown, fallback: string) {
  const str = String(value || "").trim().replace(/[;"{}<>]/g, "");
  if (!str || str.length > 80) return fallback;
  if (!/^[\w\s+.-]+$/.test(str)) return fallback;
  return str;
}

function isSafeSizeValue(value: unknown, minRem = 0.625, maxRem = 6) {
  const str = String(value || "").trim();
  const simple = str.match(/^(\d+(?:\.\d+)?)rem$/);
  if (simple) {
    const rem = Number(simple[1]);
    return rem >= minRem && rem <= maxRem;
  }
  const clamp = str.match(/^clamp\((\d+(?:\.\d+)?)rem,\s*(\d+(?:\.\d+)?)rem\s*\+\s*(\d+(?:\.\d+)?)vw,\s*(\d+(?:\.\d+)?)rem\)$/);
  if (!clamp) return false;
  const min = Number(clamp[1]);
  const midBase = Number(clamp[2]);
  const vw = Number(clamp[3]);
  const max = Number(clamp[4]);
  return min >= minRem && max <= maxRem && min <= max && midBase >= 0 && vw <= 8;
}

function safeSize(value: unknown, fallback: string, minRem = 0.625, maxRem = 6) {
  return isSafeSizeValue(value, minRem, maxRem) ? String(value).trim() : fallback;
}

function safeLineHeight(value: unknown, fallback: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 2.2 ? String(numeric) : fallback;
}

function safeTracking(value: unknown, fallback: string) {
  const str = String(value || "").trim();
  if (!/^-?\d+(\.\d+)?em$/.test(str)) return fallback;
  const numeric = Number(str.replace("em", ""));
  return numeric >= -0.08 && numeric <= 0.14 ? str : fallback;
}

function sanitizeTypographySettings(input: any) {
  const base: any = GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT;
  const data = input && typeof input === "object" ? input : {};
  const sizes = data.sizes || {};
  const weights = data.weights || {};
  const lineHeights = data.lineHeights || {};
  const tracking = data.tracking || {};
  const fonts = data.fonts || {};
  return {
    _meta: { status: data._meta?.status === "draft" ? "draft" : data._meta?.status === "published" ? "published" : base._meta.status, lastSavedAt: data._meta?.lastSavedAt || null, publishedAt: data._meta?.publishedAt || null },
    preset: safeEnum(data.preset, TYPOGRAPHY_PRESETS, base.preset),
    fonts: { heading: safeTypographyFont(fonts.heading, base.fonts.heading), body: safeTypographyFont(fonts.body, base.fonts.body), ui: safeTypographyFont(fonts.ui, base.fonts.ui), button: safeTypographyFont(fonts.button, base.fonts.button) },
    sizes: { hero: safeSize(sizes.hero, base.sizes.hero, 1.75, 6), pageTitle: safeSize(sizes.pageTitle, base.sizes.pageTitle, 1.5, 5), sectionTitle: safeSize(sizes.sectionTitle, base.sizes.sectionTitle, 1.25, 4), cardTitle: safeSize(sizes.cardTitle, base.sizes.cardTitle, 1, 3.5), subtitle: safeSize(sizes.subtitle, base.sizes.subtitle, 0.875, 2), bodyLarge: safeSize(sizes.bodyLarge, base.sizes.bodyLarge, 0.875, 1.75), body: safeSize(sizes.body, base.sizes.body, 0.8125, 1.5), bodySmall: safeSize(sizes.bodySmall, base.sizes.bodySmall, 0.6875, 1.25), caption: safeSize(sizes.caption, base.sizes.caption, 0.625, 1.125), badge: safeSize(sizes.badge, base.sizes.badge, 0.625, 1.125), nav: safeSize(sizes.nav, base.sizes.nav, 0.75, 1.25), footer: safeSize(sizes.footer, base.sizes.footer, 0.75, 1.25), button: safeSize(sizes.button, base.sizes.button, 0.75, 1.375), formLabel: safeSize(sizes.formLabel, base.sizes.formLabel, 0.625, 1.125), input: safeSize(sizes.input, base.sizes.input, 0.75, 1.25) },
    weights: { heading: safeEnum(weights.heading, TYPOGRAPHY_WEIGHTS, base.weights.heading), body: safeEnum(weights.body, TYPOGRAPHY_WEIGHTS, base.weights.body), button: safeEnum(weights.button, TYPOGRAPHY_WEIGHTS, base.weights.button), cardTitle: safeEnum(weights.cardTitle, TYPOGRAPHY_WEIGHTS, base.weights.cardTitle), badge: safeEnum(weights.badge, TYPOGRAPHY_WEIGHTS, base.weights.badge) },
    lineHeights: { heading: safeLineHeight(lineHeights.heading, base.lineHeights.heading), body: safeLineHeight(lineHeights.body, base.lineHeights.body), button: safeLineHeight(lineHeights.button, base.lineHeights.button) },
    tracking: { heading: safeTracking(tracking.heading, base.tracking.heading), button: safeTracking(tracking.button, base.tracking.button), badge: safeTracking(tracking.badge, base.tracking.badge) },
  };
}

function createTypographyRouter() {
  const pr = Router();
  const DRAFT_FILE = path.join(DATA_DIR, "global-typography.draft.json");
  const PUBLISHED_FILE = path.join(DATA_DIR, "global-typography.published.json");
  const getDraft = () => sanitizeTypographySettings(readJson(DRAFT_FILE) || { ...GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT, _meta: { ...GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT._meta, status: "draft" } });
  const getPublished = () => sanitizeTypographySettings(readJson(PUBLISHED_FILE) || GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT);
  pr.get("/", (_req, res) => res.json(getPublished()));
  pr.get("/draft", (_req, res) => res.json(getDraft()));
  pr.put("/draft", (req, res) => {
    if (!req.body || typeof req.body !== "object") { res.status(400).json({ error: "Invalid body" }); return; }
    const now = new Date().toISOString();
    const draft = sanitizeTypographySettings({ ...req.body, _meta: { ...(req.body._meta || {}), status: "draft", lastSavedAt: now } });
    writeJson(DRAFT_FILE, draft);
    res.json({ ok: true, savedAt: now, content: draft });
  });
  pr.post("/publish", (_req, res) => {
    const now = new Date().toISOString();
    const published = sanitizeTypographySettings({ ...getDraft(), _meta: { status: "published", publishedAt: now, lastSavedAt: now } });
    writeJson(PUBLISHED_FILE, published);
    writeJson(DRAFT_FILE, published);
    res.json({ ok: true, publishedAt: now, content: published });
  });
  pr.post("/reset", (_req, res) => {
    const now = new Date().toISOString();
    const reset = sanitizeTypographySettings({ ...GLOBAL_TYPOGRAPHY_DEFAULT_CONTENT, _meta: { status: "published", lastSavedAt: now, publishedAt: now } });
    writeJson(PUBLISHED_FILE, reset);
    writeJson(DRAFT_FILE, reset);
    res.json({ ok: true, content: reset });
  });
  return pr;
}

const SPACING_PRESETS = ["comfortable", "balanced", "compact"] as const;
const SPACING_OVERRIDES = ["balanced", "compact"] as const;
const GLOBAL_SPACING_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  preset: "balanced",
  section: {
    defaultY: "clamp(4rem, 3.1rem + 3.8vw, 6rem)",
    compactY: "clamp(2.75rem, 2.2rem + 2.3vw, 4rem)",
    heroY: "clamp(5rem, 3.8rem + 5vw, 8rem)",
  },
  cards: {
    padding: "clamp(1.375rem, 1.1rem + 0.9vw, 2rem)",
    compactPadding: "clamp(1rem, 0.92rem + 0.45vw, 1.375rem)",
    contentGap: "clamp(0.75rem, 0.68rem + 0.3vw, 1rem)",
    gridGap: "clamp(1rem, 0.82rem + 0.75vw, 1.5rem)",
    listItemGap: "0.5rem",
  },
  cta: { gap: "0.75rem", margin: "1rem" },
  overrides: { servicesCards: "compact", productCards: "compact", portfolioCards: "compact" },
};

function sanitizeSpacingSettings(input: any) {
  const base: any = GLOBAL_SPACING_DEFAULT_CONTENT;
  const data = input && typeof input === "object" ? input : {};
  const section = data.section || {};
  const cards = data.cards || {};
  const cta = data.cta || {};
  const overrides = data.overrides || {};
  return {
    _meta: { status: data._meta?.status === "draft" ? "draft" : data._meta?.status === "published" ? "published" : base._meta.status, lastSavedAt: data._meta?.lastSavedAt || null, publishedAt: data._meta?.publishedAt || null },
    preset: safeEnum(data.preset, SPACING_PRESETS, base.preset),
    section: {
      defaultY: safeSize(section.defaultY, base.section.defaultY, 1.5, 10),
      compactY: safeSize(section.compactY, base.section.compactY, 1.25, 8),
      heroY: safeSize(section.heroY, base.section.heroY, 2, 12),
    },
    cards: {
      padding: safeSize(cards.padding, base.cards.padding, 0.75, 4),
      compactPadding: safeSize(cards.compactPadding, base.cards.compactPadding, 0.625, 3),
      contentGap: safeSize(cards.contentGap, base.cards.contentGap, 0.375, 2.5),
      gridGap: safeSize(cards.gridGap, base.cards.gridGap, 0.5, 4),
      listItemGap: safeSize(cards.listItemGap, base.cards.listItemGap, 0.25, 1.5),
    },
    cta: {
      gap: safeSize(cta.gap, base.cta.gap, 0.375, 2),
      margin: safeSize(cta.margin, base.cta.margin, 0.5, 3),
    },
    overrides: {
      servicesCards: safeEnum(overrides.servicesCards, SPACING_OVERRIDES, base.overrides.servicesCards),
      productCards: safeEnum(overrides.productCards, SPACING_OVERRIDES, base.overrides.productCards),
      portfolioCards: safeEnum(overrides.portfolioCards, SPACING_OVERRIDES, base.overrides.portfolioCards),
    },
  };
}

function createSpacingRouter() {
  const pr = Router();
  const DRAFT_FILE = path.join(DATA_DIR, "global-spacing.draft.json");
  const PUBLISHED_FILE = path.join(DATA_DIR, "global-spacing.published.json");
  const getDraft = () => sanitizeSpacingSettings(readJson(DRAFT_FILE) || { ...GLOBAL_SPACING_DEFAULT_CONTENT, _meta: { ...GLOBAL_SPACING_DEFAULT_CONTENT._meta, status: "draft" } });
  const getPublished = () => sanitizeSpacingSettings(readJson(PUBLISHED_FILE) || GLOBAL_SPACING_DEFAULT_CONTENT);
  pr.get("/", (_req, res) => res.json(getPublished()));
  pr.get("/draft", (_req, res) => res.json(getDraft()));
  pr.put("/draft", (req, res) => {
    if (!req.body || typeof req.body !== "object") { res.status(400).json({ error: "Invalid body" }); return; }
    const now = new Date().toISOString();
    const draft = sanitizeSpacingSettings({ ...req.body, _meta: { ...(req.body._meta || {}), status: "draft", lastSavedAt: now } });
    writeJson(DRAFT_FILE, draft);
    res.json({ ok: true, savedAt: now, content: draft });
  });
  pr.post("/publish", (_req, res) => {
    const now = new Date().toISOString();
    const published = sanitizeSpacingSettings({ ...getDraft(), _meta: { status: "published", publishedAt: now, lastSavedAt: now } });
    writeJson(PUBLISHED_FILE, published);
    writeJson(DRAFT_FILE, published);
    res.json({ ok: true, publishedAt: now, content: published });
  });
  pr.post("/reset", (_req, res) => {
    const now = new Date().toISOString();
    const reset = sanitizeSpacingSettings({ ...GLOBAL_SPACING_DEFAULT_CONTENT, _meta: { status: "published", lastSavedAt: now, publishedAt: now } });
    writeJson(PUBLISHED_FILE, reset);
    writeJson(DRAFT_FILE, reset);
    res.json({ ok: true, content: reset });
  });
  return pr;
}

const PAGE_BACKGROUND_TYPES = ["none", "animated-birds", "animated-birds-overlay", "image", "image-overlay"] as const;
const PAGE_BACKGROUND_BASE = {
  enabled: true,
  backgroundType: "animated-birds-overlay",
  imageUrl: "",
  backgroundColor: "#07192f",
  overlayColor: "#ffffff",
  overlayOpacity: 55,
  animationColor: "#ff0000",
  animationAccentColor: "#00d1ff",
  animationQuantity: 5,
  animationSpeed: 5,
  height: 720,
  mobileHeight: 520,
};
const PAGE_BACKGROUND_DEFAULT_CONTENT = {
  _meta: { status: "published", lastSavedAt: null, publishedAt: null },
  pages: [
    { ...PAGE_BACKGROUND_BASE, id: "home", label: "Home page", pathPattern: "/", order: 0 },
    { ...PAGE_BACKGROUND_BASE, id: "about", label: "About page", pathPattern: "/about", order: 1 },
    { ...PAGE_BACKGROUND_BASE, id: "services", label: "Services page", pathPattern: "/services", order: 2 },
    { ...PAGE_BACKGROUND_BASE, id: "service-detail", label: "Service detail pages", pathPattern: "/services/*", order: 3 },
    { ...PAGE_BACKGROUND_BASE, id: "portfolio", label: "Products & Portfolio", pathPattern: "/portfolio", order: 4 },
    { ...PAGE_BACKGROUND_BASE, id: "portfolio-detail", label: "Portfolio detail pages", pathPattern: "/portfolio/*", order: 5 },
    { ...PAGE_BACKGROUND_BASE, id: "product-detail", label: "Product detail pages", pathPattern: "/products/*", order: 6 },
    { ...PAGE_BACKGROUND_BASE, id: "project-detail", label: "Project detail pages", pathPattern: "/projects/*", order: 7 },
    { ...PAGE_BACKGROUND_BASE, id: "articles", label: "Articles page", pathPattern: "/articles", order: 8 },
    { ...PAGE_BACKGROUND_BASE, id: "article-detail", label: "Article detail pages", pathPattern: "/articles/*", order: 9 },
    { ...PAGE_BACKGROUND_BASE, id: "free-services", label: "Digital products / free services", pathPattern: "/free-services", order: 10 },
    { ...PAGE_BACKGROUND_BASE, id: "contact", label: "Contact page", pathPattern: "/contact", order: 11 },
    { ...PAGE_BACKGROUND_BASE, id: "support", label: "Support page", pathPattern: "/support", order: 12 },
    { ...PAGE_BACKGROUND_BASE, id: "client-portal", label: "Client portal", pathPattern: "/portal", order: 13 },
    { ...PAGE_BACKGROUND_BASE, id: "search", label: "Search page", pathPattern: "/search", order: 14 },
    { ...PAGE_BACKGROUND_BASE, id: "custom-pages", label: "Custom CMS pages", pathPattern: "/pages/*", order: 15 },
    { ...PAGE_BACKGROUND_BASE, id: "privacy", label: "Privacy page", pathPattern: "/privacy", order: 16 },
    { ...PAGE_BACKGROUND_BASE, id: "terms", label: "Terms page", pathPattern: "/terms", order: 17 },
    { ...PAGE_BACKGROUND_BASE, enabled: false, backgroundType: "none", id: "admin-dashboard", label: "Admin dashboard", pathPattern: "/admin/dashboard", order: 18 },
    { ...PAGE_BACKGROUND_BASE, enabled: false, backgroundType: "none", id: "admin-login", label: "Admin login", pathPattern: "/admin", order: 19 },
  ],
};

function safeBackgroundText(value: unknown, fallback: string, max = 160) {
  const str = String(value ?? "").trim();
  if (!str || str.length > max) return fallback;
  return str.replace(/[<>]/g, "");
}

function safeBackgroundPath(value: unknown, fallback: string) {
  const str = safeBackgroundText(value, fallback, 180);
  if (!str.startsWith("/") || str.includes("..") || /[\s<>]/.test(str)) return fallback;
  return str;
}

function safeBackgroundColor(value: unknown, fallback: string) {
  const str = String(value || "").trim();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(str)) return str;
  if (/^rgba?\((\s*\d{1,3}\s*,){2}\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(str)) return str;
  return fallback;
}

function safeBackgroundUrl(value: unknown) {
  const str = String(value || "").trim();
  if (!str) return "";
  if (str.length > 500 || /[<>"{}]/.test(str)) return "";
  if (/^https?:\/\//i.test(str) || str.startsWith("/")) return str;
  return "";
}

function safeBackgroundNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(min, Math.min(max, numeric)));
}

function sanitizePageBackgroundPage(input: any, fallback: any) {
  const data = input && typeof input === "object" ? input : {};
  return {
    id: safeBackgroundText(data.id, fallback.id, 80).replace(/[^a-z0-9_-]/gi, "-"),
    label: safeBackgroundText(data.label, fallback.label, 120),
    pathPattern: safeBackgroundPath(data.pathPattern, fallback.pathPattern),
    enabled: typeof data.enabled === "boolean" ? data.enabled : fallback.enabled,
    backgroundType: safeEnum(data.backgroundType, PAGE_BACKGROUND_TYPES, fallback.backgroundType),
    imageUrl: safeBackgroundUrl(data.imageUrl),
    backgroundColor: safeBackgroundColor(data.backgroundColor, fallback.backgroundColor),
    overlayColor: safeBackgroundColor(data.overlayColor, fallback.overlayColor),
    overlayOpacity: safeBackgroundNumber(data.overlayOpacity, fallback.overlayOpacity, 0, 95),
    animationColor: safeBackgroundColor(data.animationColor, fallback.animationColor),
    animationAccentColor: safeBackgroundColor(data.animationAccentColor, fallback.animationAccentColor),
    animationQuantity: safeBackgroundNumber(data.animationQuantity, fallback.animationQuantity, 1, 5),
    animationSpeed: safeBackgroundNumber(data.animationSpeed, fallback.animationSpeed, 1, 10),
    height: safeBackgroundNumber(data.height, fallback.height, 360, 1000),
    mobileHeight: safeBackgroundNumber(data.mobileHeight, fallback.mobileHeight, 280, 760),
    order: safeBackgroundNumber(data.order, fallback.order, 0, 999),
  };
}

function sanitizePageBackgroundSettings(input: any) {
  const data = input && typeof input === "object" ? input : {};
  const incomingPages = Array.isArray(data.pages) ? data.pages : [];
  const incomingById = new Map(incomingPages.map((page: any) => [String(page?.id || ""), page]));
  const defaultPages = (PAGE_BACKGROUND_DEFAULT_CONTENT.pages as any[]).map(page => sanitizePageBackgroundPage({ ...page, ...(incomingById.get(page.id) || {}) }, page));
  const knownIds = new Set(defaultPages.map(page => page.id));
  const extraPages = incomingPages
    .filter((page: any) => page?.id && !knownIds.has(String(page.id)))
    .map((page: any, index: number) => sanitizePageBackgroundPage(page, {
      ...PAGE_BACKGROUND_BASE,
      id: `custom-${index + 1}`,
      label: "Custom page",
      pathPattern: "/custom-page",
      order: 100 + index,
    }));

  return {
    _meta: {
      status: data._meta?.status === "draft" ? "draft" : data._meta?.status === "published" ? "published" : "published",
      lastSavedAt: data._meta?.lastSavedAt || null,
      publishedAt: data._meta?.publishedAt || null,
    },
    pages: [...defaultPages, ...extraPages].sort((a, b) => a.order - b.order),
  };
}

function createPageBackgroundRouter() {
  const pr = Router();
  const DRAFT_FILE = path.join(DATA_DIR, "page-backgrounds.draft.json");
  const PUBLISHED_FILE = path.join(DATA_DIR, "page-backgrounds.published.json");
  const getDraft = () => sanitizePageBackgroundSettings(readJson(DRAFT_FILE) || { ...PAGE_BACKGROUND_DEFAULT_CONTENT, _meta: { ...PAGE_BACKGROUND_DEFAULT_CONTENT._meta, status: "draft" } });
  const getPublished = () => sanitizePageBackgroundSettings(readJson(PUBLISHED_FILE) || PAGE_BACKGROUND_DEFAULT_CONTENT);
  pr.get("/", (_req, res) => res.json(getPublished()));
  pr.get("/draft", (_req, res) => res.json(getDraft()));
  pr.put("/draft", (req, res) => {
    if (!req.body || typeof req.body !== "object") { res.status(400).json({ error: "Invalid body" }); return; }
    const now = new Date().toISOString();
    const draft = sanitizePageBackgroundSettings({ ...req.body, _meta: { ...(req.body._meta || {}), status: "draft", lastSavedAt: now } });
    writeJson(DRAFT_FILE, draft);
    res.json({ ok: true, savedAt: now, content: draft });
  });
  pr.post("/publish", (_req, res) => {
    const now = new Date().toISOString();
    const published = sanitizePageBackgroundSettings({ ...getDraft(), _meta: { status: "published", publishedAt: now, lastSavedAt: now } });
    writeJson(PUBLISHED_FILE, published);
    writeJson(DRAFT_FILE, published);
    res.json({ ok: true, publishedAt: now, content: published });
  });
  pr.post("/reset", (_req, res) => {
    const now = new Date().toISOString();
    const reset = sanitizePageBackgroundSettings({ ...PAGE_BACKGROUND_DEFAULT_CONTENT, _meta: { status: "published", lastSavedAt: now, publishedAt: now } });
    writeJson(PUBLISHED_FILE, reset);
    writeJson(DRAFT_FILE, reset);
    res.json({ ok: true, content: reset });
  });
  return pr;
}

router.use("/home", createPageRouter("home", HOME_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/global-typography", createTypographyRouter());
router.use("/global-spacing", createSpacingRouter());
router.use("/page-backgrounds", createPageBackgroundRouter());
router.use("/about", createPageRouter("about", ABOUT_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/services", createPageRouter("services", SERVICES_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/products", createPageRouter("products", PRODUCTS_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/articles", createPageRouter("articles", ARTICLES_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/portfolio", createPageRouter("portfolio", PORTFOLIO_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/support", createPageRouter("support", SUPPORT_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/free-services", createPageRouter("free-services", FREE_SERVICES_DEFAULT_CONTENT as Record<string, unknown>));
router.use("/contact", createPageRouter("contact", CONTACT_DEFAULT_CONTENT as Record<string, unknown>));

// ─── Sitemap (SEO overview) ───────────────────────────────────────────────────
router.get("/sitemap", (_req, res) => {
  const pages = ["home", "about", "services", "products", "articles", "portfolio", "support", "free-services", "contact"];
  const sitemap = pages.map(key => {
    const publishedFile = path.join(DATA_DIR, `${key}.published.json`);
    try {
      if (fs.existsSync(publishedFile)) {
        const data = JSON.parse(fs.readFileSync(publishedFile, "utf-8"));
        return { page: key, seo: data.seo || {}, publishedAt: data._meta?.publishedAt || null };
      }
    } catch { /* ignore */ }
    return { page: key, seo: {}, publishedAt: null };
  });
  res.json({ ok: true, pages: sitemap });
});

// ─── Robots.txt ───────────────────────────────────────────────────────────────
router.get("/robots-txt", (_req, res) => {
  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin/",
    "Disallow: /client-portal/",
    "Sitemap: /sitemap.xml",
  ].join("\n");
  res.type("text/plain").send(robotsTxt);
});

export default router;
