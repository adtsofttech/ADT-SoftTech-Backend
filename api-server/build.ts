import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { access, cp, readFile, rm, writeFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  const serverDir = path.resolve(distDir, "server");
  const publicDir = path.resolve(distDir, "public");
  const frontendPublicDir = path.resolve(__dirname, "../../frontend/app/dist/public");
  const includeFrontendBuild = process.env["INCLUDE_FRONTEND_BUILD"] === "true";
  await rm(distDir, { recursive: true, force: true });
  await cp(path.resolve(__dirname, "src/data"), path.resolve(distDir, "data"), {
    recursive: true,
  });
  if (includeFrontendBuild) {
    try {
      await access(path.join(frontendPublicDir, "index.html"));
    } catch {
      throw new Error(
        "Frontend build not found. Run `pnpm --dir ../frontend run build` before building the API server with INCLUDE_FRONTEND_BUILD=true.",
      );
    }
    await cp(frontendPublicDir, publicDir, { recursive: true });
  }

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: path.resolve(serverDir, "index.mjs"),
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await writeFile(
    path.resolve(distDir, "index.js"),
    'import "./server/index.mjs";\n',
    "utf-8",
  );
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
