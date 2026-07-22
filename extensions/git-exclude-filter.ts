import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider, AutocompleteItem } from "@earendil-works/pi-tui";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, basename } from "node:path";
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { spawn } from "node:child_process";

type Pattern = { regex: RegExp; negated: boolean };

interface PromptTemplate {
  name: string;
  description?: string;
}

function parsePattern(line: string): Pattern | null {
	let s = line.trim();
	if (!s || s.startsWith("#")) return null;
	let negated = false;
	if (s.startsWith("!")) { negated = true; s = s.slice(1); }
	if (s.endsWith("/")) s = s.slice(0, -1);
	if (s.startsWith("/")) s = s.slice(1);
	if (!s) return null;

	let re = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "*") {
			if (s[i + 1] === "*") { re += ".*"; i++; if (s[i + 1] === "/") i++; }
			else re += "[^/]*";
		} else if (c === "?") {
			re += "[^/]";
		} else if (c === "[") {
			let cls = ""; i++;
			if (s[i] === "!") { cls += "^"; i++; }
			while (i < s.length && s[i] !== "]") { cls += s[i] === "\\" ? "\\\\" : s[i]; i++; }
			re += `[${cls}]`;
		} else {
			re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
	}
	return { regex: new RegExp(`(?:^|/)${re}(?:/|$)`), negated };
}

function matchesPattern(path: string, patterns: Pattern[]): boolean {
	let matched = false;
	for (const p of patterns) {
		if (p.regex.test(path)) matched = !p.negated;
	}
	return matched;
}

async function loadPatterns(cwd: string): Promise<Pattern[]> {
	const patterns: Pattern[] = [];
	
	// Load from .gitignore
	try {
		const content = await readFile(join(cwd, ".gitignore"), "utf-8");
		patterns.push(...content.split("\n").map(parsePattern).filter((p): p is Pattern => p !== null));
	} catch {}
	
	return patterns;
}

async function loadExcludePatterns(cwd: string): Promise<Pattern[]> {
	const patterns: Pattern[] = [];
	
	// Load from .git/info/exclude
	try {
		const content = await readFile(join(cwd, ".git", "info", "exclude"), "utf-8");
		patterns.push(...content.split("\n").map(parsePattern).filter((p): p is Pattern => p !== null));
	} catch {}
	
	return patterns;
}

async function loadPrompts(cwd: string): Promise<PromptTemplate[]> {
	const promptsDir = join(cwd, CONFIG_DIR_NAME, "prompts");
	const prompts: PromptTemplate[] = [];

	try {
		const files = await readdir(promptsDir);
		for (const file of files) {
			if (!file.endsWith(".md")) continue;

			const filePath = join(promptsDir, file);
			const content = await readFile(filePath, "utf-8");
			const name = basename(file, ".md");

			// Extract description from frontmatter
			let description: string | undefined;
			const descMatch = content.match(/description:\s*(.+?)(?:\n|$)/);
			if (descMatch) description = descMatch[1].trim();

			prompts.push({ name, description });
		}
	} catch {}

	return prompts;
}

// Search for files using fd with --no-ignore to find git-excluded files
async function searchFilesWithNoIgnore(cwd: string, query: string, maxResults: number = 50): Promise<AutocompleteItem[]> {
	return new Promise((resolve) => {
		const args = [
			"--base-directory", cwd,
			"--max-results", String(maxResults),
			"--type", "f",
			"--type", "d",
			"--follow",
			"--hidden",
			"--no-ignore",
			"--exclude", ".git",
			"--exclude", ".git/*",
			"--exclude", ".git/**",
		];
		
		if (query) {
			args.push(query);
		}

		const child = spawn("fd", args, {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let resolved = false;

		const finish = (items: AutocompleteItem[]) => {
			if (resolved) return;
			resolved = true;
			resolve(items);
		};

		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});

		child.on("error", () => finish([]));

		// Timeout after 2 seconds
		const timer = setTimeout(() => {
			if (!resolved) {
				child.kill("SIGKILL");
				finish([]);
			}
		}, 2000);

		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0 || !stdout) {
				finish([]);
				return;
			}

			const lines = stdout.trim().split("\n").filter(Boolean);
			const items: AutocompleteItem[] = [];

			for (const line of lines) {
				const isDirectory = line.endsWith("/");
				const displayPath = isDirectory ? line.slice(0, -1) : line;
				
				// Skip .git paths
				if (displayPath === ".git" || displayPath.startsWith(".git/") || displayPath.includes("/.git/")) {
					continue;
				}

				items.push({
					value: join(cwd, displayPath),
					label: displayPath + (isDirectory ? "/" : ""),
					description: isDirectory ? "directory" : "file",
					icon: isDirectory ? "folder" as const : "file" as const,
				});
			}

			resolve(items);
		});
	});
}

export default function (pi: ExtensionAPI): void {
	let gitignorePatterns: Pattern[] = [];
	let excludePatterns: Pattern[] = [];
	let prompts: PromptTemplate[] = [];
	let loadedAt = 0;

	pi.on("session_start", async (_event, ctx) => {
		gitignorePatterns = await loadPatterns(ctx.cwd);
		excludePatterns = await loadExcludePatterns(ctx.cwd);
		prompts = await loadPrompts(ctx.cwd);
		loadedAt = Date.now();

		ctx.ui.addAutocompleteProvider((current: AutocompleteProvider): AutocompleteProvider => ({
			triggerCharacters: current.triggerCharacters,
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
				if (!result) return null;

				const now = Date.now();
				if (now - loadedAt > 5000) {
					gitignorePatterns = await loadPatterns(ctx.cwd);
					excludePatterns = await loadExcludePatterns(ctx.cwd);
					prompts = await loadPrompts(ctx.cwd);
					loadedAt = now;
				}

				// Add prompt templates for / commands
				const currentLine = lines[cursorLine] || "";
				const beforeCursor = currentLine.slice(0, cursorCol);
				const slashMatch = beforeCursor.match(/\/(\w*)$/);

				let items = result.items;

				if (slashMatch) {
					const prefix = slashMatch[1].toLowerCase();
					const matchingPrompts = prompts.filter((p) =>
						p.name.toLowerCase().startsWith(prefix)
					);

					if (matchingPrompts.length > 0) {
						const promptItems = matchingPrompts.map((p) => ({
							value: p.name,
							label: `/${p.name}`,
							description: p.description || `Prompt: ${p.name}`,
							icon: "prompt" as const,
						}));

						// Merge prompts with existing items
						const existingValues = new Set(items.map((i) => i.value));
						const newItems = promptItems.filter((p) => !existingValues.has(p.value));
						items = [...newItems, ...items];
					}
				}

				// Check if this is a file completion (has @ prefix)
				const atMatch = beforeCursor.match(/@(\S*)$/);
				
				if (atMatch && excludePatterns.length > 0) {
					// Search for files with --no-ignore to find git-excluded files
					const query = atMatch[1];
					const excludeMatches = await searchFilesWithNoIgnore(ctx.cwd, query);
					
					// Filter to only include files that match .git/info/exclude patterns
					const additionalItems = excludeMatches.filter((item) => {
						const relPath = relative(ctx.cwd, item.value).replace(/\\/g, "/");
						return matchesPattern(relPath, excludePatterns);
					});
					
					// Merge with existing items, avoiding duplicates
					const existingValues = new Set(items.map((i) => i.value));
					const newItems = additionalItems.filter((item) => !existingValues.has(item.value));
					items = [...newItems, ...items];
				}

				// Filter out git-excluded items (but keep prompt commands and git-excluded files we added)
				if (gitignorePatterns.length === 0) return { items, prefix: result.prefix };

				return {
					items: items.filter((item) => {
						// Don't filter pi commands (items starting with /)
						if (item.value.startsWith("/")) return true;
						
						const relPath = relative(ctx.cwd, item.value).replace(/\\/g, "/");
						
						// Don't filter files that match .git/info/exclude patterns (they should be visible)
						if (excludePatterns.length > 0 && matchesPattern(relPath, excludePatterns)) {
							return true;
						}
						
						// Filter out files matching .gitignore patterns
						return !matchesPattern(relPath, gitignorePatterns);
					}),
					prefix: result.prefix,
				};
			},
			applyCompletion: (lines, cursorLine, cursorCol, item, prefix) =>
				current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
			shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) =>
				current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true,
		}));
	});
}
