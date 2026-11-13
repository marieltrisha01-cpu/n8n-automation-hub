/**
 * ─────── Created: 2026-11-14 | Purpose: Standalone ESM Updater for Render MCP Config & .env.local | Last verified with: Node.js v25.6.1 ───────
 * Run with AI CLI: [powershell -ExecutionPolicy Bypass -File .\scripts\install-render-mcp.ps1]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function configureRenderMcp({ token, mcpPath, envLocalPath }) {
  const cleanedToken = String(token || "").trim();
  if (cleanedToken.length < 16) {
    throw new Error("Invalid Render API key: expected at least 16 characters (rnd_...).");
  }

  fs.mkdirSync(path.dirname(mcpPath), { recursive: true });
  let cfg = { mcpServers: {} };
  if (fs.existsSync(mcpPath)) {
    const raw = fs.readFileSync(mcpPath, "utf8").trim();
    if (raw) {
      cfg = JSON.parse(raw);
    }
  }
  if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") {
    cfg.mcpServers = {};
  }

  const existingHttp = Object.values(cfg.mcpServers).find((s) => s && (s.serverUrl || s.url));
  const urlKey = existingHttp && Object.prototype.hasOwnProperty.call(existingHttp, "serverUrl") ? "serverUrl" : "url";

  cfg.mcpServers.render = {
    [urlKey]: "https://mcp.render.com/mcp",
    headers: {
      Authorization: `Bearer ${cleanedToken}`,
    },
  };

  fs.writeFileSync(mcpPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");

  let envContent = fs.existsSync(envLocalPath) ? fs.readFileSync(envLocalPath, "utf8") : "";
  if (/^RENDER_API_KEY=.*$/m.test(envContent)) {
    envContent = envContent.replace(/^RENDER_API_KEY=.*$/m, `RENDER_API_KEY=${cleanedToken}`);
  } else {
    envContent = `${envContent ? `${envContent.replace(/\s*$/, "")}\n` : ""}RENDER_API_KEY=${cleanedToken}\n`;
  }
  fs.writeFileSync(envLocalPath, envContent, "utf8");

  return { urlKey, mcpPath, envLocalPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const token = process.env.RENDER_API_KEY_TMP;
  const mcpPath = process.env.MCP_CONFIG_PATH_TMP;
  const envLocalPath = process.env.ENV_LOCAL_PATH_TMP;

  if (!token || !mcpPath || !envLocalPath) {
    console.error("[ERROR] Missing required environment variables. Run via scripts/install-render-mcp.ps1.");
    process.exit(1);
  }

  const result = configureRenderMcp({ token, mcpPath, envLocalPath });
  console.log(`[1/2] Configured Render MCP (${result.urlKey}) in ${result.mcpPath}`);
  console.log(`[2/2] Saved RENDER_API_KEY to ${result.envLocalPath} (hidden)`);
}
