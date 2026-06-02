/**
 * Grep Tool - Fast content search using ripgrep
 *
 * Ported from opencode's grep tool.
 * Uses ripgrep (rg) for fast regex search across files.
 * Returns file paths and line numbers sorted by modification time (newest first).
 *
 * Output is truncated to 100 matches.
 */

import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const LIMIT = 100;
const MAX_LINE_LENGTH = 2000;

const GrepParams = Type.Object({
  pattern: Type.String({
    description: "The regex pattern to search for in file contents",
  }),
  path: Type.Optional(
    Type.String({
      description: "The directory to search in. Defaults to the current working directory.",
    }),
  ),
  include: Type.Optional(
    Type.String({
      description:
        'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")',
    }),
  ),
});

interface RgMatch {
  path: string;
  line: number;
  text: string;
}

interface RgJsonLine {
  type: "match";
  data: {
    path: { text: string };
    line_number: number;
    lines: { text: string };
  };
}

/**
 * Resolve the rg binary path. Prefer the bundled copy in ~/.pi/agent/bin,
 * fall back to whatever is on PATH.
 */
function getRgPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const bundled = path.join(
    home,
    ".pi",
    "agent",
    "bin",
    process.platform === "win32" ? "rg.exe" : "rg"
  );
  try {
    statSync(bundled);
    return bundled;
  } catch {
    return process.platform === "win32" ? "rg.exe" : "rg";
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "grep",
    label: "Grep",
    description: [
      "Fast content search tool that works with any codebase size.",
      "- Searches file contents using regular expressions",
      '- Supports full regex syntax (eg. "log.*Error", "function\\s+\\w+", etc.)',
      '- Filter files by pattern with the include parameter (eg. "*.js", "*.{ts,tsx}")',
      "- Returns file paths and line numbers with at least one match sorted by modification time",
      "- Use this tool when you need to find files containing specific patterns",
      '- If you need to identify/count the number of matches within files, use the Bash tool with `rg` (ripgrep) directly. Do NOT use `grep`.',
    ].join("\n"),
    parameters: GrepParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { pattern, path: searchPath, include } = params;

      if (!pattern) {
        throw new Error("pattern is required");
      }

      // Resolve search directory
      let searchDir = searchPath ?? ctx.cwd;
      if (!path.isAbsolute(searchDir)) {
        searchDir = path.resolve(ctx.cwd, searchDir);
      }

      // If the path is a file, search that file specifically
      let cwd: string;
      let fileArg: string | undefined;
      try {
        const info = statSync(searchDir);
        if (info.isDirectory()) {
          cwd = searchDir;
        } else {
          cwd = path.dirname(searchDir);
          fileArg = path.relative(cwd, searchDir);
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          throw new Error(`Path does not exist: ${searchDir}`);
        }
        throw err;
      }

      const rgPath = getRgPath();

      // Build rg command with JSON output
      // --no-config: ignore ripgreprc
      // --json: structured JSON output for easy parsing
      // --hidden: include hidden files
      // --glob=!.git/*: exclude .git internals
      // --no-messages: suppress warning messages
      const args = [
        "--no-config",
        "--json",
        "--hidden",
        "--glob=!.git/*",
        "--no-messages",
      ];

      if (include) {
        args.push(`--glob=${include}`);
      }

      args.push("--", pattern);

      if (fileArg) {
        args.push(fileArg);
      } else {
        args.push(".");
      }

      let stdout: string;
      try {
        stdout = execSync(`"${rgPath}" ${args.join(" ")}`, {
          cwd,
          encoding: "utf-8",
          timeout: 30_000,
          maxBuffer: 50 * 1024 * 1024,
          windowsHide: true,
        });
      } catch (err: any) {
        // rg exits with 1 when no matches found, 2 for partial error
        if (err.status === 1 || err.stdout === "") {
          return {
            content: [{ type: "text", text: "No files found" }],
            details: { matches: 0, truncated: false, pattern },
          };
        }
        // Exit code 2 means partial results (some paths inaccessible)
        if (err.status === 2 && err.stdout) {
          stdout = err.stdout;
        } else {
          throw new Error(`ripgrep failed: ${err.stderr || err.message}`);
        }
      }

      // Parse JSON lines - only care about "match" type
      const matches: RgMatch[] = [];
      let partial = false;

      for (const line of stdout.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as
            | RgJsonLine
            | { type: string };
          if (parsed.type === "match") {
            const data = (parsed as RgJsonLine).data;
            matches.push({
              path: path.isAbsolute(data.path.text)
                ? data.path.text
                : path.resolve(cwd, data.path.text),
              line: data.line_number,
              text: data.lines.text,
            });
          } else if (parsed.type === "summary") {
            // Check if partial (some paths inaccessible)
            // summary doesn't directly tell us, but exit code 2 does
          }
        } catch {
          // Skip unparseable lines
        }
      }

      if (matches.length === 0) {
        return {
          content: [{ type: "text", text: "No files found" }],
          details: { matches: 0, truncated: false, pattern },
        };
      }

      // Get mtime for each unique file
      const uniquePaths = [...new Set(matches.map((m) => m.path))];
      const mtimeMap = new Map<string, number>();
      for (const filePath of uniquePaths) {
        try {
          const info = statSync(filePath);
          mtimeMap.set(filePath, info.mtimeMs);
        } catch {
          mtimeMap.set(filePath, 0);
        }
      }

      // Sort matches by file mtime descending (newest first)
      matches.sort((a, b) => {
        const mtimeA = mtimeMap.get(a.path) ?? 0;
        const mtimeB = mtimeMap.get(b.path) ?? 0;
        return mtimeB - mtimeA;
      });

      // Truncate to limit
      let truncated = false;
      if (matches.length > LIMIT) {
        truncated = true;
        matches.length = LIMIT;
      }

      const total = matches.length;

      // Build output grouped by file
      const output: string[] = [
        `Found ${total} match${total === 1 ? "" : "es"}${
          truncated ? ` (showing first ${LIMIT})` : ""
        }`,
      ];

      let currentFile = "";
      for (const match of matches) {
        if (currentFile !== match.path) {
          if (currentFile !== "") output.push("");
          currentFile = match.path;
          output.push(`${match.path}:`);
        }
        const text =
          match.text.length > MAX_LINE_LENGTH
            ? match.text.substring(0, MAX_LINE_LENGTH) + "..."
            : match.text;
        output.push(`  Line ${match.line}: ${text}`);
      }

      if (truncated) {
        output.push("");
        output.push(
          `(Results truncated: showing ${LIMIT} of ${total} matches. Consider using a more specific path or pattern.)`
        );
      }

      if (partial) {
        output.push("");
        output.push("(Some paths were inaccessible and skipped)");
      }

      return {
        content: [{ type: "text", text: output.join("\n") }],
        details: {
          matches: total,
          truncated,
          pattern,
        },
      };
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("grep "));
      text += theme.fg("accent", `"${args.pattern}"`);
      if (args.path) {
        text += theme.fg("muted", ` in ${args.path}`);
      }
      if (args.include) {
        text += theme.fg("dim", ` --include ${args.include}`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, _context) {
      const details = result.details as
        | { matches: number; truncated: boolean; pattern: string }
        | undefined;

      if (isPartial) {
        return new Text(theme.fg("warning", "Searching..."), 0, 0);
      }

      if (!details || details.matches === 0) {
        return new Text(theme.fg("dim", "No matches found"), 0, 0);
      }

      let text = theme.fg(
        "success",
        `${details.matches} match${details.matches === 1 ? "" : "es"}`
      );

      if (details.truncated) {
        text += theme.fg("warning", " (truncated)");
      }

      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const lines = content.text.split("\n").slice(0, 30);
          for (const line of lines) {
            if (line.trim()) {
              text += `\n${theme.fg("dim", line)}`;
            }
          }
          if (content.text.split("\n").length > 30) {
            text += `\n${theme.fg(
              "muted",
              "... (use more specific pattern to narrow results)"
            )}`;
          }
        }
      }

      return new Text(text, 0, 0);
    },
  });
}
