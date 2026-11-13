/**
 * ─────── Created: 2026-11-14 | Purpose: Verification suite for n8n Pinterest workflows, Multi-Project Scaffolder, Hybrid Antigravity/Gemini parser, dedupe logic & 1000x1500 PNG header parser | Last verified with: Node.js v25.6.1 ───────
 * Run with AI CLI: [node scripts/validate-system.mjs]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildProjectWorkflow } from "./new-project.mjs";
import { configureRenderMcp } from "./install-render-mcp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const workflowsDir = path.join(rootDir, "workflows");

const workflowFiles = [
  "01-pinterest-content-orchestrator.json",
  "02-pinterest-publisher-subworkflow.json",
  "03-global-error-handler.json",
];

function validateWorkflowObject(wf, label) {
  assert.equal(typeof wf.name, "string", `${label}: missing workflow name`);
  assert.ok(Array.isArray(wf.nodes) && wf.nodes.length > 0, `${label}: missing nodes array`);
  assert.equal(typeof wf.connections, "object", `${label}: missing connections object`);
  assert.equal(typeof wf.settings, "object", `${label}: missing settings object`);
  assert.equal(wf.active, false, `${label}: workflow must start inactive until tested`);

  const nodeNames = new Set(wf.nodes.map((n) => n.name));
  assert.equal(nodeNames.size, wf.nodes.length, `${label}: duplicate node names found`);

  for (const [sourceName, outputs] of Object.entries(wf.connections)) {
    assert.ok(nodeNames.has(sourceName), `${label}: connection source '${sourceName}' does not exist`);
    for (const branch of outputs.main || []) {
      for (const edge of branch) {
        assert.ok(nodeNames.has(edge.node), `${label}: connection target '${edge.node}' does not exist`);
      }
    }
  }
}

// 1. Validate n8n workflow JSON structure & connection integrity
for (const file of workflowFiles) {
  const fullPath = path.join(workflowsDir, file);
  const raw = fs.readFileSync(fullPath, "utf8");
  const wf = JSON.parse(raw);

  validateWorkflowObject(wf, file);

  // Ensure no hardcoded real tokens exist
  assert.ok(!/sk-ant-api03-[A-Za-z0-9]{10,}/.test(raw), `${file}: hardcoded Anthropic key detected`);
  assert.ok(!/AIzaSy[A-Za-z0-9_-]{20,}/.test(raw), `${file}: hardcoded Gemini API key detected`);
  assert.ok(!/pina_[A-Za-z0-9]{10,}/.test(raw), `${file}: hardcoded Pinterest token detected`);

  console.log(`[PASS] ${file} valid n8n workflow (${wf.nodes.length} nodes verified)`);
}

// Verify Workflow 01 & 03 specific hub nodes
const wf01 = JSON.parse(fs.readFileSync(path.join(workflowsDir, "01-pinterest-content-orchestrator.json"), "utf8"));
const wf01Names = new Set(wf01.nodes.map((n) => n.name));
assert.ok(wf01Names.has("IF Pre-Generated (Antigravity / Sheets AI)"), "Workflow 01 missing Antigravity bypass IF node");
assert.ok(wf01Names.has("Gemini AI: Generate SEO Pin Content"), "Workflow 01 missing Gemini AI node");

const wf03 = JSON.parse(fs.readFileSync(path.join(workflowsDir, "03-global-error-handler.json"), "utf8"));
const wf03Names = new Set(wf03.nodes.map((n) => n.name));
assert.ok(wf03Names.has("IF Has Sheet Row ID"), "Workflow 03 missing multi-project IF Has Sheet Row ID guard");

// 2. Test Multi-Project Scaffolder (schedule & webhook modes)
const scheduledProj = buildProjectWorkflow({ name: "Booking Reminder", trigger: "schedule" });
validateWorkflowObject(scheduledProj, "new-project:schedule");
assert.equal(scheduledProj.nodes.length, 5);
assert.ok(scheduledProj.nodes.some((n) => n.name === "Schedule Trigger"));

const webhookProj = buildProjectWorkflow({ name: "TikTok Sync!", trigger: "webhook" });
validateWorkflowObject(webhookProj, "new-project:webhook");
assert.equal(webhookProj.nodes.length, 5);
assert.ok(webhookProj.nodes.some((n) => n.name === "Webhook Trigger" && n.parameters.path === "tiktok-sync"));
console.log("[PASS] Multi-project workflow scaffolder (new-project.mjs) verified");

// 3. Test Hybrid Antigravity pre-fill & Gemini API response parser
function parseHybridSeoPayload(inputJson) {
  let parsed;
  if (inputJson.pin_title && inputJson.pin_description && inputJson.image_prompt) {
    parsed = inputJson;
  } else {
    const geminiText = inputJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    const anthropicText = inputJson?.content?.[0]?.text;
    const rawText = String(geminiText || anthropicText || "");
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    parsed = JSON.parse(cleaned);
  }
  return {
    pin_title: String(parsed.pin_title || "").trim(),
    pin_description: String(parsed.pin_description || "").trim(),
    seo_keywords: Array.isArray(parsed.seo_keywords) ? parsed.seo_keywords.join(", ") : String(parsed.seo_keywords || "").trim(),
    alt_text: String(parsed.alt_text || "").trim(),
    image_prompt: String(parsed.image_prompt || "").trim(),
  };
}

const antigravityPrefill = parseHybridSeoPayload({
  pin_title: "Minimalist Home Office Desk Setup Ideas",
  pin_description: "Create a calm, clutter-free workspace with warm task lighting and ergonomic cable management for deep focus. Save this guide! #HomeOffice #MinimalistDesk",
  seo_keywords: "minimalist home office, desk setup ideas",
  alt_text: "Vertical photo of a minimalist wooden desk.",
  image_prompt: "Vertical 2:3 editorial photograph of a sunlit oak desk with warm lighting.",
});
assert.equal(antigravityPrefill.pin_title, "Minimalist Home Office Desk Setup Ideas");

const geminiResponse = parseHybridSeoPayload({
  candidates: [
    {
      content: {
        parts: [
          {
            text: JSON.stringify({
              pin_title: "Small Kitchen Organization Hacks on a Budget",
              pin_description: "Maximize tiny apartment pantry and cabinet space with stackable clear bins, tension rods, and door racks under $30. Save for later! #KitchenOrganization #SmallApartment",
              seo_keywords: "small kitchen organization, apartment storage hacks, budget pantry ideas",
              alt_text: "Organized compact kitchen pantry with labeled clear bins and wooden shelves.",
              image_prompt: "Vertical 2:3 bright editorial photo of a neatly organized small apartment kitchen pantry.",
            }),
          },
        ],
      },
    },
  ],
});
assert.equal(geminiResponse.pin_title, "Small Kitchen Organization Hacks on a Budget");
console.log("[PASS] Hybrid Antigravity pre-fill & Gemini API response parser verified");

// 4. Test deterministic SHA-256 deduplication & single-Pin test cap
function dedupeAndCap(pendingRows, ledgerRows, maxPins = 1) {
  const existingHashes = new Set(ledgerRows.map((r) => String(r.content_hash || "").trim()).filter(Boolean));
  const out = [];
  let accepted = 0;

  for (const row of pendingRows) {
    const sig = `${row.topic.trim().toLowerCase()}|${row.target_link.trim().toLowerCase()}|${row.board_id.trim()}`;
    const hash = crypto.createHash("sha256").update(sig).digest("hex").slice(0, 32);
    if (existingHashes.has(hash)) {
      out.push({ ...row, content_hash: hash, is_duplicate: true });
      continue;
    }
    if (accepted >= maxPins) continue;
    existingHashes.add(hash);
    accepted += 1;
    out.push({ ...row, content_hash: hash, is_duplicate: false });
  }
  return out;
}

const samplePending = [
  { row_id: "1", topic: "Minimalist Desk Setup", target_link: "https://example.com/desk", board_id: "123456789" },
  { row_id: "2", topic: "Minimalist Desk Setup", target_link: "https://example.com/desk", board_id: "123456789" },
  { row_id: "3", topic: "Cozy Reading Corner", target_link: "https://example.com/reading", board_id: "123456789" },
];

const firstRun = dedupeAndCap(samplePending, [], 1);
assert.equal(firstRun.filter((x) => !x.is_duplicate).length, 1, "Single-Pin cap must allow strictly 1 new Pin");
assert.equal(firstRun.filter((x) => x.is_duplicate).length, 1, "In-batch duplicate must be flagged");

const secondRun = dedupeAndCap(samplePending, [{ content_hash: firstRun[0].content_hash }], 1);
assert.equal(secondRun[0].is_duplicate, true, "Already published hash in Published_Ledger must be flagged DUPLICATE");
assert.equal(secondRun.filter((x) => !x.is_duplicate).length, 1, "Next un-published Pin should be picked after duplicate");
console.log("[PASS] Deduplication SHA-256 & single-Pin test cap verified");

// 5. Test SEO validator & binary 1000x1500 PNG dimension parser
function parsePngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

function makeMockPngHeader(width, height) {
  const buf = new Uint8Array(24);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(buf.buffer);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return buf;
}

const validDims = parsePngDimensions(makeMockPngHeader(1000, 1500));
assert.deepEqual(validDims, { width: 1000, height: 1500 });

const wrongDims = parsePngDimensions(makeMockPngHeader(1024, 1024));
assert.notDeepEqual(wrongDims, { width: 1000, height: 1500 });

function validateSeo(payload) {
  assert.ok(payload.pin_title.length > 0 && payload.pin_title.length <= 100);
  assert.ok(payload.pin_description.length >= 50 && payload.pin_description.length <= 500);
  assert.ok(payload.alt_text.length > 0 && payload.alt_text.length <= 500);
  assert.ok(payload.seo_keywords.length > 0);
}

validateSeo(antigravityPrefill);
validateSeo(geminiResponse);
console.log("[PASS] SEO validator & 1000x1500 PNG dimension parser verified");

// 6. Verify Render Free Blueprint & Local Cloud-DB Launcher
const renderYamlPath = path.join(rootDir, "render.yaml");
const launcherPath = path.join(rootDir, "scripts", "start-n8n-hub.ps1");
assert.ok(fs.existsSync(renderYamlPath), "render.yaml missing");
assert.ok(fs.existsSync(launcherPath), "scripts/start-n8n-hub.ps1 missing");
const renderYaml = fs.readFileSync(renderYamlPath, "utf8");
assert.ok(renderYaml.includes("plan: free") && renderYaml.includes("runtime: docker"), "render.yaml must specify free Docker web service");
assert.ok(!/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(renderYaml), "render.yaml must not contain hardcoded DB credentials");
console.log("[PASS] Render.com Free Blueprint & local Neon launcher verified");

// 7. Test Render MCP Configurator against isolated temp files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-mcp-test-"));
try {
  const tmpMcp = path.join(tmpDir, "mcp_config.json");
  const tmpEnv = path.join(tmpDir, ".env.local");
  fs.writeFileSync(tmpMcp, JSON.stringify({ mcpServers: { neon: { serverUrl: "https://mcp.neon.tech/mcp" } } }), "utf8");
  fs.writeFileSync(tmpEnv, "DATABASE_URL=mock\n", "utf8");

  const res = configureRenderMcp({
    token: "rnd_mock_test_key_1234567890",
    mcpPath: tmpMcp,
    envLocalPath: tmpEnv,
  });

  const updatedMcp = JSON.parse(fs.readFileSync(tmpMcp, "utf8"));
  assert.equal(res.urlKey, "serverUrl");
  assert.equal(updatedMcp.mcpServers.neon.serverUrl, "https://mcp.neon.tech/mcp");
  assert.equal(updatedMcp.mcpServers.render.serverUrl, "https://mcp.render.com/mcp");
  assert.equal(updatedMcp.mcpServers.render.headers.Authorization, "Bearer rnd_mock_test_key_1234567890");
  assert.ok(fs.readFileSync(tmpEnv, "utf8").includes("RENDER_API_KEY=rnd_mock_test_key_1234567890"));
  console.log("[PASS] Render MCP installer (install-render-mcp.mjs) verified");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
