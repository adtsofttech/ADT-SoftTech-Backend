ALTER TABLE cms_products
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS homepage_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_business_value text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE cms_portfolio
  ADD COLUMN IF NOT EXISTS show_on_homepage boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS homepage_sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS homepage_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_impact text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS homepage_technologies jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS cms_products_homepage_showcase_idx
  ON cms_products (homepage_sort_order)
  WHERE status = 'published' AND show_on_homepage = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS cms_portfolio_homepage_showcase_idx
  ON cms_portfolio (homepage_sort_order)
  WHERE status = 'published' AND show_on_homepage = true AND deleted_at IS NULL;

INSERT INTO cms_products (
  title, slug, excerpt, body, category, tags, icon, features, show_on_homepage,
  homepage_sort_order, homepage_business_value, homepage_capabilities, status, published_at,
  seo_title, meta_description, schema_type, sitemap_enabled, sitemap_priority
) VALUES
  (
    'Support AI Agent',
    'support-ai-agent',
    '24/7 automated customer support and chat handling.',
    'Support AI Agent helps teams respond faster to customers, leads, and support requests through AI-powered communication workflows and scalable service coverage.',
    'AI Assistant',
    '["AI Support", "Customer Service"]'::jsonb,
    'support',
    '["AI-powered customer communication", "Instant response workflows", "Lead and support query handling", "Scalable service availability"]'::jsonb,
    true,
    0,
    'Scalable service availability with faster customer and lead response.',
    '["AI-powered customer communication", "Instant response workflows", "Lead and support query handling", "Scalable service availability"]'::jsonb,
    'published',
    now(),
    'Support AI Agent | ADT SoftTech',
    '24/7 AI customer support assistant for communication, support queries, and lead response workflows.',
    'SoftwareApplication',
    true,
    '0.7'
  ),
  (
    'Business Analytics Agent',
    'business-analytics-agent',
    'Automated reports, KPI tracking, and intelligent business insights.',
    'Business Analytics Agent supports KPI monitoring, automated reporting, performance trend summaries, and decision-ready business insights.',
    'Analytics Agent',
    '["Analytics", "KPI"]'::jsonb,
    'analytics',
    '["KPI monitoring", "Automated reports", "Performance trend summaries", "Decision-support insights"]'::jsonb,
    true,
    1,
    'Decision support through automated KPI visibility and performance summaries.',
    '["KPI monitoring", "Automated reports", "Performance trend summaries", "Decision-support insights"]'::jsonb,
    'published',
    now(),
    'Business Analytics Agent | ADT SoftTech',
    'Automated reports, KPI monitoring, and business intelligence assistant for smarter decisions.',
    'SoftwareApplication',
    true,
    '0.7'
  ),
  (
    'HR Screening Agent',
    'hr-screening-agent',
    'Resume filtering, candidate screening, and workforce management support.',
    'HR Screening Agent helps recruitment teams organize resumes, pre-screen candidates, and improve hiring workflow visibility.',
    'HR Automation',
    '["HR", "Recruitment"]'::jsonb,
    'hr',
    '["Candidate pre-screening", "Resume categorization", "Hiring workflow support", "Recruitment visibility"]'::jsonb,
    true,
    2,
    'Clearer recruitment pipelines and faster first-pass candidate screening.',
    '["Candidate pre-screening", "Resume categorization", "Hiring workflow support", "Recruitment visibility"]'::jsonb,
    'published',
    now(),
    'HR Screening Agent | ADT SoftTech',
    'AI HR screening assistant for resume filtering, candidate screening, and recruitment visibility.',
    'SoftwareApplication',
    true,
    '0.7'
  ),
  (
    'Automation Assistant',
    'automation-assistant',
    'Daily workflow automation and repetitive task execution.',
    'Automation Assistant helps teams reduce routine manual work through trigger-based workflows, process support, and repeatable task execution.',
    'Workflow Automation',
    '["Automation", "Operations"]'::jsonb,
    'automation',
    '["Routine task automation", "Trigger-based workflows", "Internal process support", "Repetitive manual work reduction"]'::jsonb,
    true,
    3,
    'Less repetitive manual work and more predictable internal process execution.',
    '["Routine task automation", "Trigger-based workflows", "Internal process support", "Repetitive manual work reduction"]'::jsonb,
    'published',
    now(),
    'Automation Assistant | ADT SoftTech',
    'Workflow automation assistant for routine tasks, trigger-based processes, and operational efficiency.',
    'SoftwareApplication',
    true,
    '0.7'
  ),
  (
    'AI Knowledge Bot',
    'ai-knowledge-bot',
    'Internal document, policy, and team knowledge assistant.',
    'AI Knowledge Bot helps teams retrieve answers from internal documents, policies, and approved knowledge resources.',
    'Knowledge AI',
    '["RAG", "Knowledge Base"]'::jsonb,
    'knowledge',
    '["Document-based Q&A", "Internal knowledge retrieval", "Policy guidance", "Team information support"]'::jsonb,
    true,
    4,
    'Faster internal answers from approved documents, policies, and team resources.',
    '["Document-based Q&A", "Internal knowledge retrieval", "Policy guidance", "Team information support"]'::jsonb,
    'published',
    now(),
    'AI Knowledge Bot | ADT SoftTech',
    'Internal AI knowledge assistant for document Q&A, policy guidance, and team information support.',
    'SoftwareApplication',
    true,
    '0.7'
  )
ON CONFLICT (slug) DO UPDATE SET
  show_on_homepage = EXCLUDED.show_on_homepage,
  homepage_sort_order = EXCLUDED.homepage_sort_order,
  homepage_business_value = EXCLUDED.homepage_business_value,
  homepage_capabilities = EXCLUDED.homepage_capabilities,
  updated_at = now();

INSERT INTO cms_portfolio (
  title, slug, excerpt, body, category, tags, show_on_homepage, homepage_sort_order,
  homepage_impact, homepage_technologies, status, published_at, seo_title, meta_description,
  schema_type, sitemap_enabled, sitemap_priority
) VALUES
  (
    'Bank Loan Dashboard',
    'bank-loan-dashboard',
    'A data-driven loan analytics dashboard built to improve risk visibility, decision-making, and performance tracking.',
    'A finance analytics dashboard designed for risk visibility, loan performance tracking, and executive decision support.',
    'Finance Analytics / Business Intelligence',
    '["Power BI", "Finance", "Analytics"]'::jsonb,
    true,
    0,
    '27% accuracy improvement',
    '["Power BI", "KPI Reporting", "Risk Analytics"]'::jsonb,
    'published',
    now(),
    'Bank Loan Dashboard Case Study | ADT SoftTech',
    'Finance BI case study for loan analytics, risk visibility, and performance tracking.',
    'CreativeWork',
    true,
    '0.6'
  ),
  (
    'Coffee Chain Analytics',
    'coffee-chain-analytics',
    'A business intelligence solution designed to analyze branch sales, customer trends, and product performance.',
    'A retail analytics solution for branch sales, customer trends, product performance, and revenue decision support.',
    'Retail Analytics / Revenue Intelligence',
    '["Retail", "Revenue", "BI"]'::jsonb,
    true,
    1,
    '$1.2M in revenue insights',
    '["Sales Analytics", "Branch Reporting", "Product Insights"]'::jsonb,
    'published',
    now(),
    'Coffee Chain Analytics Case Study | ADT SoftTech',
    'Retail analytics case study for branch sales, customer trends, and product performance insights.',
    'CreativeWork',
    true,
    '0.6'
  ),
  (
    'HR Recruitment Dashboard',
    'hr-recruitment-dashboard',
    'A recruitment analytics dashboard that helps teams monitor candidate pipelines, hiring activity, and operational performance through clear KPI reporting.',
    'An HR analytics dashboard for candidate pipeline visibility, hiring activity monitoring, and recruitment KPI reporting.',
    'HR Analytics / Workforce Intelligence',
    '["HR", "Recruitment", "Dashboard"]'::jsonb,
    true,
    2,
    '',
    '["Recruitment Analytics", "KPI Reporting", "Workforce Intelligence"]'::jsonb,
    'published',
    now(),
    'HR Recruitment Dashboard Case Study | ADT SoftTech',
    'HR analytics case study for recruitment dashboards, candidate pipelines, and workforce reporting.',
    'CreativeWork',
    true,
    '0.6'
  )
ON CONFLICT (slug) DO UPDATE SET
  show_on_homepage = EXCLUDED.show_on_homepage,
  homepage_sort_order = EXCLUDED.homepage_sort_order,
  homepage_impact = EXCLUDED.homepage_impact,
  homepage_technologies = EXCLUDED.homepage_technologies,
  updated_at = now();
