import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/index.js";
import sitemapRouter from "./routes/sitemap.js";
import { allowedCorsOrigins } from "./lib/http-security.js";

const app: Express = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = process.env.STATIC_DIR
  ? path.resolve(process.env.STATIC_DIR)
  : path.resolve(__dirname, process.env.NODE_ENV === "production" ? "../public" : "../dist/public");
const indexHtml = path.join(staticDir, "index.html");

app.set("trust proxy", 1);
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const allowed = allowedCorsOrigins();
    if (!origin || allowed.length === 0 || allowed.includes(origin.replace(/\/+$/, ""))) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(sitemapRouter);
app.use("/api", router);

if (fs.existsSync(indexHtml)) {
  app.use(express.static(staticDir, {
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }));

  app.use((req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      next();
      return;
    }
    if (req.path.startsWith("/api/") || req.path === "/sitemap.xml" || req.path === "/robots.txt") {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}

export default app;
