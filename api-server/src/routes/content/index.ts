import { Router } from "express";
import articlesRouter from "./articles.js";
import servicesRouter from "./services.js";
import projectsRouter from "./projects.js";
import portfolioRouter from "./portfolio.js";
import productsRouter from "./products.js";
import pagesRouter from "./pages.js";

const router = Router();

router.use("/articles", articlesRouter);
router.use("/services", servicesRouter);
router.use("/projects", projectsRouter);
router.use("/portfolio", portfolioRouter);
router.use("/products", productsRouter);
router.use("/pages", pagesRouter);

export default router;
