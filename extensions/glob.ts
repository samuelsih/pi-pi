/**
 * Glob Tool - Find files by pattern matching
 *
 * Ported from opencode's glob tool.
 * Uses ripgrep (rg) for fast file discovery.
 * Returns matching file paths sorted by modification time (newest first).
 *
 * Output is truncated to 100 results.
 */

import { execSync } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const LIMIT = 100;

const GlobParams = Type.Object({
  pattern: Type.String({
    description: "The glob pattern to match files against",
  }),
  path: Type.Optional(
    Type.String({
      description:
        'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.',
    }),
  ),
});

/**
 * Resolve the rg binary path. Prefer the bundled copy in ~/.pi/agent/bin,
 * fall back to whatever is on PATH.
 */
function getRgPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const bundled = path.join(home, ".pi", "agent", "bin", process.platform === "win32" ? "rg.exe" : "rg");
  try {
    statSync(bundled);
    return bundled;
  } catch {
    // Fall back to rg on PATH
    return process.platform === "win32" ? "rg.exe" : "rg";
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "glob",
    label: "Glob",
    description: [
      "Find files by pattern matching. Search for files using glob patterns like **/*.js or src/**/*.ts. Returns matching file paths sorted by modification time.",
      "- Fast file pattern matching tool that works with any codebase size",
      "- Supports glob patterns like \"**/*.js\" or \"src/**/*.ts\"",
      "- Returns matching file paths sorted by modification time (newest first)",
      "- Use this tool when you need to find files by name patterns",
      "- You have the capability to call multiple tools in a single response. It is always better to speculatively perform multiple searches as a batch that are potentially useful.",
    ].join("\n"),
    parameters: GlobParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { pattern, path: searchPath } = params;

      // Resolve the search directory
      let searchDir = searchPath ?? ctx.cwd;
      if (!path.isAbsolute(searchDir)) {
        searchDir = path.resolve(ctx.cwd, searchDir);
      }

      // Validate that searchDir is a directory
      try {
        const info = statSync(searchDir);
        if (!info.isDirectory()) {
          throw new Error(`glob path must be a directory: ${searchDir}`);
        }
      } catch (err: any) {
        if (err.code === "ENOENT") {
          throw new Error(`glob path does not exist: ${searchDir}`);
        }
        throw err;
      }

      const rgPath = getRgPath();

      // Build rg --files command with glob filter
      // --no-config: ignore ripgreprc
      // --files: list files instead of searching content
      // --hidden: include hidden files
      // --glob=!.git/*: exclude .git internals
      const args = [
        "--no-config",
        "--files",
        "--hidden",
        "--glob=!.git/*",
        `--glob=${pattern}`,
        ".",
      ];

      let stdout: string;
      try {
        stdout = execSync(`"${rgPath}" ${args.join(" ")}`, {
          cwd: searchDir,
          encoding: "utf-8",
          timeout: 30_000,
          maxBuffer: 50 * 1024 * 1024,
          windowsHide: true,
        });
      } catch (err: any) {
        // rg exits with 1 when no files match
        if (err.status === 1 || err.stdout === "") {
          return {
            content: [{ type: "text", text: "No files found" }],
            details: { count: 0, truncated: false, pattern, path: searchDir },
          };
        }
        throw new Error(`ripgrep failed: ${err.stderr || err.message}`);
      }

      const lines = stdout.split("\n").filter((line) => line.trim().length > 0);

      if (lines.length === 0) {
        return {
          content: [{ type: "text", text: "No files found" }],
          details: { count: 0, truncated: false, pattern, path: searchDir },
        };
      }

      // Collect files with their mtime
      const files: Array<{ fullPath: string; mtime: number }> = [];
      for (const line of lines) {
        const fullPath = path.resolve(searchDir, line);
        let mtime = 0;
        try {
          const info = statSync(fullPath);
          mtime = info.mtimeMs;
        } catch {
          // If stat fails, default mtime to 0
        }
        files.push({ fullPath, mtime });
      }

      // Sort by mtime descending (newest first)
      files.sort((a, b) => b.mtime - a.mtime);

      // Truncate to limit
      let truncated = false;
      if (files.length > LIMIT) {
        truncated = true;
        files.length = LIMIT;
      }

      // Build output
      const output: string[] = [];
      output.push(...files.map((f) => f.fullPath));
      if (truncated) {
        output.push("");
        output.push(
          `(Results are truncated: showing first ${LIMIT} results. Consider using a more specific path or pattern.)`,
        );
      }

      return {
        content: [{ type: "text", text: output.join("\n") }],
        details: {
          count: files.length,
          truncated,
          pattern,
          path: searchDir,
        },
      };
    },

    renderCall(args, theme, _context) {
      let text = theme.fg("toolTitle", theme.bold("glob "));
      text += theme.fg("accent", `"${args.pattern}"`);
      if (args.path) {
        text += theme.fg("muted", ` in ${args.path}`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, _context) {
      const details = result.details as
        | { count: number; truncated: boolean; pattern: string; path: string }
        | undefined;

      if (isPartial) {
        return new Text(theme.fg("warning", "Searching..."), 0, 0);
      }

      if (!details || details.count === 0) {
        return new Text(theme.fg("dim", "No files found"), 0, 0);
      }

      let text = theme.fg("success", `${details.count} file${details.count === 1 ? "" : "s"}`);

      if (details.truncated) {
        text += theme.fg("warning", " (truncated)");
      }

      if (expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const lines = content.text.split("\n").slice(0, 20);
          for (const line of lines) {
            if (line.trim()) {
              text += `\n${theme.fg("dim", line)}`;
            }
          }
          if (content.text.split("\n").length > 20) {
            text += `\n${theme.fg("muted", "... (use more specific pattern to narrow results)")}`;
          }
        }
      }

      return new Text(text, 0, 0);
    },
  });
}
