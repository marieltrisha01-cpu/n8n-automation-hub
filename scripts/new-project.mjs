/**
 * ─────── Created: 2026-11-14 | Purpose: CLI Scaffolder for New n8n Automation Projects in the Shared Hub | Last verified with: Node.js v25.6.1 ───────
 * Run with AI CLI: [node scripts/new-project.mjs --name "my-automation" --trigger webhook]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export function sanitizeSlug(rawName) {
  const slug = String(rawName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("Project name must contain at least one alphanumeric character.");
  }
  return slug;
}

export function buildProjectWorkflow({ name, trigger = "schedule" }) {
  const slug = sanitizeSlug(name);
  const mode = trigger === "webhook" ? "webhook" : "schedule";
  const triggerNodeName = mode === "webhook" ? "Webhook Trigger" : "Schedule Trigger";

  const triggerNode =
    mode === "webhook"
      ? {
          parameters: {
            httpMethod: "POST",
            path: slug,
            responseMode: "onReceived",
            options: {},
          },
          id: `node-${slug}-webhook`,
          name: triggerNodeName,
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [-680, 120],
          webhookId: `${slug}-inbound`,
        }
      : {
          parameters: {
            rule: {
              interval: [
                {
                  field: "cronExpression",
                  expression: "0 9 * * *",
                },
              ],
            },
          },
          id: `node-${slug}-schedule`,
          name: triggerNodeName,
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1.2,
          position: [-680, 120],
        };

  return {
    name: `[${slug}] Automation Workflow`,
    nodes: [
      triggerNode,
      {
        parameters: {},
        id: `node-${slug}-manual`,
        name: "Manual Test Trigger",
        type: "n8n-nodes-base.manualTrigger",
        typeVersion: 1,
        position: [-680, 320],
      },
      {
        parameters: {
          jsCode: `const incoming = $input.item.json || {};\nconst payload = incoming.body || incoming;\n\nreturn [{\n  json: {\n    project: '${slug}',\n    received_at: new Date().toISOString(),\n    task_input: payload.task || payload.topic || JSON.stringify(payload),\n    raw: payload\n  }\n}];`,
        },
        id: `node-${slug}-normalize`,
        name: "Validate & Normalize Payload",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [-420, 220],
      },
      {
        parameters: {
          method: "POST",
          url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + ($env.GEMINI_MODEL || 'gemini-2.5-flash') + ':generateContent' }}",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "x-goog-api-key",
                value: "={{ $env.GEMINI_API_KEY }}",
              },
              {
                name: "content-type",
                value: "application/json",
              },
            ],
          },
          sendBody: true,
          specifyBody: "json",
          jsonBody:
            "={{ JSON.stringify({ systemInstruction: { parts: [{ text: 'You are an automation assistant for project ' + $json.project + '. Return ONLY valid JSON with keys: summary, status, next_action.' }] }, contents: [{ role: 'user', parts: [{ text: String($json.task_input || '') }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' } }) }}",
          options: {
            timeout: 45000,
          },
        },
        id: `node-${slug}-gemini`,
        name: "Gemini AI: Process Task",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [-160, 220],
        retryOnFail: true,
        maxTries: 3,
        waitBetweenTries: 3000,
      },
      {
        parameters: {
          method: "POST",
          url: "={{ 'https://api.telegram.org/bot' + $env.TELEGRAM_BOT_TOKEN + '/sendMessage' }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody:
            "={{ JSON.stringify({ chat_id: $env.TELEGRAM_CHAT_ID, text: '✅ [' + $('Validate & Normalize Payload').item.json.project + '] Automation Completed\\n\\n' + ($json.candidates?.[0]?.content?.parts?.[0]?.text || 'Done') }) }}",
          options: {},
        },
        id: `node-${slug}-telegram`,
        name: "Telegram: Send Completion Summary",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [120, 220],
      },
    ],
    connections: {
      [triggerNodeName]: {
        main: [
          [
            {
              node: "Validate & Normalize Payload",
              type: "main",
              index: 0,
            },
          ],
        ],
      },
      "Manual Test Trigger": {
        main: [
          [
            {
              node: "Validate & Normalize Payload",
              type: "main",
              index: 0,
            },
          ],
        ],
      },
      "Validate & Normalize Payload": {
        main: [
          [
            {
              node: "Gemini AI: Process Task",
              type: "main",
              index: 0,
            },
          ],
        ],
      },
      "Gemini AI: Process Task": {
        main: [
          [
            {
              node: "Telegram: Send Completion Summary",
              type: "main",
              index: 0,
            },
          ],
        ],
      },
    },
    active: false,
    settings: {
      executionOrder: "v1",
      saveManualExecutions: true,
      callerPolicy: "workflowsFromSameOwner",
    },
    versionId: "1.0.0",
    meta: {
      templateCredsSetupCompleted: false,
    },
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--name" && argv[i + 1]) {
      args.name = argv[++i];
    } else if (argv[i] === "--trigger" && argv[i + 1]) {
      args.trigger = argv[++i];
    }
  }
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const { name, trigger } = parseCliArgs(process.argv.slice(2));
  if (!name) {
    console.error("Usage: node scripts/new-project.mjs --name <project-slug> [--trigger schedule|webhook]");
    process.exit(1);
  }
  const slug = sanitizeSlug(name);
  const workflow = buildProjectWorkflow({ name: slug, trigger });
  const outDir = path.join(rootDir, "workflows", "projects");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${slug}-workflow.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  console.log(`Created ${outPath} (trigger: ${trigger === "webhook" ? "webhook" : "schedule"})`);
}
