/**
 * Mapache MCP Server
 *
 * Exposes dev tools to Claude Code for autonomous app verification.
 *
 * Build & install:
 *   cd tools/mcp-server && npm install && npm run build
 *
 * Registered in .claude/settings.json as "mapache-dev".
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../.."
);
const MOBILE_DIR = path.join(PROJECT_ROOT, "mobile");
const ADMIN_DIR = path.join(PROJECT_ROOT, "admin");

// ─── Expo process state ───────────────────────────────────────────────────────

interface ExpoProcess {
  pid: number;
  logFile: string;
  proc: ReturnType<typeof spawn>;
}

let expoProcess: ExpoProcess | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate output to max chars, appending a notice when truncated. */
function truncate(text: string, maxChars = 5000): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return (
    text.slice(0, half) +
    `\n\n... [TRUNCATED — ${text.length - maxChars} chars omitted] ...\n\n` +
    text.slice(text.length - half)
  );
}

/** Run a shell command with a timeout, returning combined stdout+stderr. */
async function runCommand(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<{ output: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: { ...process.env, PATH: process.env.PATH },
    });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { output: truncate(output), exitCode: 0 };
  } catch (err: unknown) {
    const error = err as {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      message?: string;
    };
    if (error.killed) {
      return {
        output: `Command timed out after ${timeoutMs / 1000}s`,
        exitCode: -1,
      };
    }
    const output = [error.stdout, error.stderr, error.message]
      .filter(Boolean)
      .join("\n")
      .trim();
    return { output: truncate(output), exitCode: error.code ?? 1 };
  }
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function toolTypecheck(): Promise<string> {
  const { output, exitCode } = await runCommand(
    "npx tsc --noEmit",
    MOBILE_DIR,
    60_000
  );
  if (exitCode === 0) {
    return "✓ TypeScript: no errors found.\n" + (output ? `\n${output}` : "");
  }
  return `TypeScript errors (exit ${exitCode}):\n\n${output || "(no output)"}`;
}

async function toolTest(): Promise<string> {
  const { output, exitCode } = await runCommand(
    "npm test -- --watchAll=false --ci 2>&1 || true",
    MOBILE_DIR,
    120_000
  );
  const header =
    exitCode === 0
      ? "✓ Tests passed."
      : `Tests failed (exit ${exitCode}).`;
  return `${header}\n\n${output || "(no output)"}`;
}

async function toolValidatePacks(): Promise<string> {
  const scriptPath = path.join(ADMIN_DIR, "validate_packs.py");
  if (!fs.existsSync(scriptPath)) {
    return `Error: validate_packs.py not found at ${scriptPath}`;
  }
  const { output, exitCode } = await runCommand(
    `python3 "${scriptPath}"`,
    PROJECT_ROOT,
    30_000
  );
  const header =
    exitCode === 0 ? "✓ Packs valid." : `Validation failed (exit ${exitCode}).`;
  return `${header}\n\n${output || "(no output)"}`;
}

async function toolExpoStart(): Promise<string> {
  if (expoProcess !== null) {
    return `Expo already running (PID ${expoProcess.pid}). Use expo_stop first if you want to restart.`;
  }

  const logFile = path.join(os.tmpdir(), `mapache-expo-${Date.now()}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const proc = spawn("npx", ["expo", "start", "--non-interactive"], {
    cwd: MOBILE_DIR,
    env: { ...process.env },
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);

  proc.on("exit", (code) => {
    logStream.end();
    if (expoProcess?.pid === proc.pid) {
      expoProcess = null;
    }
  });

  if (proc.pid === undefined) {
    return "Failed to start expo process.";
  }

  expoProcess = { pid: proc.pid, logFile, proc };

  // Wait up to 10 s for expo to emit its first output as a startup signal
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    proc.stdout?.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.stderr?.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
  });

  // Grab first few lines as confirmation
  let preview = "";
  try {
    preview = fs.readFileSync(logFile, "utf-8").slice(0, 1000);
  } catch {
    // ignore read errors
  }

  return (
    `Expo started (PID ${proc.pid}).\nLog file: ${logFile}\n\n` +
    `First output:\n${preview || "(none yet)"}`
  );
}

async function toolExpoStop(): Promise<string> {
  if (expoProcess === null) {
    return "No expo process is currently running.";
  }
  const { pid, proc } = expoProcess;
  try {
    proc.kill("SIGTERM");
    // Give it 3 s to die gracefully, then SIGKILL
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // already dead
        }
        resolve();
      }, 3000);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    expoProcess = null;
    return `Expo process (PID ${pid}) stopped.`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    expoProcess = null;
    return `Attempted to stop PID ${pid}, got: ${msg}`;
  }
}

async function toolExpoLogs(lines: number): Promise<string> {
  if (expoProcess === null) {
    return "No expo process is currently running.";
  }
  const { logFile, pid } = expoProcess;
  try {
    const content = fs.readFileSync(logFile, "utf-8");
    const allLines = content.split("\n");
    const tail = allLines.slice(-lines).join("\n");
    return `Expo logs (PID ${pid}, last ${lines} lines):\n\n${tail || "(empty)"}`;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Could not read log file: ${msg}`;
  }
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mapache-dev", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "typecheck",
      description:
        "Run `npx tsc --noEmit` in mobile/ and return TypeScript errors.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "test",
      description:
        "Run `npm test` in mobile/ and return pass/fail status and output.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "validate_packs",
      description:
        "Run `python3 admin/validate_packs.py` and return validation results.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "expo_start",
      description:
        "Start `npx expo start --non-interactive` in background in mobile/. Returns PID and initial log output.",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "expo_stop",
      description: "Stop the running expo process (if any).",
      inputSchema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "expo_logs",
      description: "Return the last N lines of expo output. Default: 50 lines.",
      inputSchema: {
        type: "object" as const,
        properties: {
          lines: {
            type: "number",
            description: "Number of log lines to return (default: 50)",
          },
        },
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let text: string;

  switch (name) {
    case "typecheck":
      text = await toolTypecheck();
      break;
    case "test":
      text = await toolTest();
      break;
    case "validate_packs":
      text = await toolValidatePacks();
      break;
    case "expo_start":
      text = await toolExpoStart();
      break;
    case "expo_stop":
      text = await toolExpoStop();
      break;
    case "expo_logs": {
      const lines = typeof args?.lines === "number" ? args.lines : 50;
      text = await toolExpoLogs(lines);
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text }],
  };
});

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't pollute the MCP stdio protocol on stdout
  process.stderr.write("Mapache MCP server running (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
