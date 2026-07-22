/**
 * No-Edit Extension
 *
 * Toggle with /noedit to block all file-mutating tools (write, edit, bash).
 * When active, the agent will only read/analyze — no file modifications.
 * Useful when you want planning and explanation without immediate changes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let noeditActive = false;

  // Register the /noedit toggle command
  pi.registerCommand("noedit", {
    description: "Toggle read-only mode (blocks write/edit/bash)",
    handler: async (_args, ctx) => {
      noeditActive = !noeditActive;

      if (noeditActive) {
        ctx.ui.notify("🔒 No-edit mode ON — file modifications blocked", "warning");
        ctx.ui.setStatus("noedit", "🔒 NOEDIT");
      } else {
        ctx.ui.notify("🔓 No-edit mode OFF — file modifications allowed", "info");
        ctx.ui.setStatus("noedit", "");
      }
    },
  });

  // Show initial status on session start
  pi.on("session_start", async (_event, ctx) => {
    if (noeditActive) {
      ctx.ui.setStatus("noedit", "🔒 NOEDIT");
    }
  });

  // Block file-mutating tool calls when noedit is active
  pi.on("tool_call", async (event, ctx) => {
    if (!noeditActive) return undefined;

    // Read-only tools are allowed.
    if (event.toolName === "read" || event.toolName === "webfetch") {
      return undefined;
    }

    // Block write and edit unconditionally
    if (event.toolName === "write" || event.toolName === "edit") {
      return {
        block: true,
        reason: "No-edit mode is active. Use /noedit to toggle off. Describe the changes instead of applying them.",
      };
    }

    // Block bash commands that modify the filesystem
    if (event.toolName === "bash") {
      const cmd = (event.input.command as string) ?? "";
      const trimmed = cmd.trim();

      // Allow read-only / inspection commands
      const readOnlyPrefixes = [
        "ls", "cat", "head", "tail", "less", "more",
        "grep", "rg", "ag", "find", "fd", "which", "whereis",
        "file", "stat", "wc", "du", "df",
        "echo", "printf", "pwd", "whoami", "hostname",
        "git log", "git show", "git diff", "git status",
        "git branch", "git tag", "git remote",
        "env", "printenv", "date", "uname",
        "node -e", "python -c", "jq",
      ];

      const isReadOnly = readOnlyPrefixes.some((prefix) =>
        trimmed.startsWith(prefix) || trimmed.startsWith("/usr/bin/" + prefix.split(" ")[0])
      );

      if (isReadOnly) return undefined;

      return {
        block: true,
        reason:
          "No-edit mode is active. Bash commands that modify the filesystem are blocked. " +
          "Use /noedit to toggle off, or use read-only commands (ls, cat, grep, find, git log, etc.).",
      };
    }

    return undefined;
  });
}
