const express = require("express");
const path = require("path");
const { pathToFileURL } = require("url");

// Hostinger detects Express projects more reliably when the root entry creates an app.
const app = express();
void app;

const serverEntry = path.join(__dirname, "api-server", "dist", "index.js");

import(pathToFileURL(serverEntry).href).catch((error) => {
  console.error("Unable to start built backend. Run `pnpm run build` from backend before `pnpm start`.", error);
  process.exit(1);
});
