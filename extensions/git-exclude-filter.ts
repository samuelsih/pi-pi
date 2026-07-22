import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider, AutocompleteItem } from "@earendil-works/pi-tui";
import { readFile, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
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

async function loadPatternFile(cwd: string, ...pathSegments: string[]): Promise<Pattern[]> {
	try {
		const content = await readFile(join(cwd, ...pathSegments), "utf-8");
		return content.split("\n").map(parsePattern).filter((p): p is Pattern => p !== null);
	} catch {
		return [];
	}
}

async function loadPrompts(cwd: string): Promise<PromptTemplate[]> {
	try {
		const files = await readdir(join(cwd, CONFIG_DIR_NAME, "prompts"));
		return Promise.all(
			files.filter(f => f.endsWith(".md")).map(async (file) => {
				const content = await readFile(join(cwd, CONFIG_DIR_NAME, "prompts", file), "utf-8");
				const description = content.match(/description:\s*(.+?)(?:\n|$)/)?.[1]?.trim();
				return { name: basename(file, ".md"), description };
			})
		);
	} catch {
		return [];
	}
}

function searchFilesWithNoIgnore(cwd: string, query: string, maxResults = 50): Promise<AutocompleteItem[]> {
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
		];

		if (query) {
			args.push("^" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
		}

		const child = spawn("fd", args, { stdio: ["ignore", "pipe", "pipe"] });

		let stdout = "";
		let resolved = false;

		const finish = (items: AutocompleteItem[]) => {
			if (resolved) return;
			resolved = true;
			resolve(items);
		};

		child.stdout.setEncoding("utf-8");
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.on("error", () => finish([]));

		const timer = setTimeout(() => {
			if (!resolved) { child.kill("SIGKILL"); finish([]); }
		}, 2000);

		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0 || !stdout) return finish([]);

			const items = stdout.trim().split("\n").filter(Boolean).flatMap((line) => {
				const isDirectory = line.endsWith("/");
				const displayPath = isDirectory ? line.slice(0, -1) : line;

				if (displayPath === ".git" || displayPath.startsWith(".git/") || displayPath.includes("/.git/")) {
					return [];
				}

				return [{
					value: "@" + displayPath + (isDirectory ? "/" : ""),
					label: displayPath + (isDirectory ? "/" : ""),
					description: isDirectory ? "directory" : "file",
				}];
			});

			resolve(items);
		});
	});
}

export default function (pi: ExtensionAPI): void {
	let gitignorePatterns: Pattern[] = [];
	let excludePatterns: Pattern[] = [];
	let prompts: PromptTemplate[] = [];
	let loadedAt = 0;

	const reload = async (cwd: string) => {
		[gitignorePatterns, excludePatterns, prompts] = await Promise.all([
			loadPatternFile(cwd, ".gitignore"),
			loadPatternFile(cwd, ".git", "info", "exclude"),
			loadPrompts(cwd),
		]);
		loadedAt = Date.now();
	};

	pi.on("session_start", async (_event, ctx) => {
		await reload(ctx.cwd);

		ctx.ui.addAutocompleteProvider((current: AutocompleteProvider): AutocompleteProvider => ({
			triggerCharacters: current.triggerCharacters,
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);

				if (Date.now() - loadedAt > 5000) {
					await reload(ctx.cwd);
				}

				let items = result?.items ?? [];
				let prefix = result?.prefix ?? "";

				const beforeCursor = (lines[cursorLine] || "").slice(0, cursorCol);
				const hasAtPrefix = beforeCursor.includes("@");
				const slashMatch = hasAtPrefix ? null : beforeCursor.match(/\/(\w*)$/);

				if (slashMatch) {
					const promptPrefix = slashMatch[1].toLowerCase();
					const matchingPrompts = prompts.filter((p) => p.name.toLowerCase().startsWith(promptPrefix));

					if (matchingPrompts.length > 0) {
						const existingValues = new Set(items.map((i) => i.value));
						items = [
							...matchingPrompts
								.filter((p) => !existingValues.has(p.name))
								.map((p) => ({
									value: p.name,
									label: `/${p.name}`,
									description: p.description || `Prompt: ${p.name}`,
								})),
							...items,
						];
					}
				}

				const atMatch = beforeCursor.match(/@(\S*)$/);

				if (atMatch && excludePatterns.length > 0) {
					const excludeMatches = await searchFilesWithNoIgnore(ctx.cwd, atMatch[1]);
					const existingValues = new Set(items.map((i) => i.value));
					items = [
						...excludeMatches.filter((item) => {
							const relPath = item.value.replace(/^@/, "").replace(/\\/g, "/");
							return !existingValues.has(item.value) && matchesPattern(relPath, excludePatterns);
						}),
						...items,
					];
					prefix = atMatch[0];
				}

				if (items.length === 0) return null;
				if (gitignorePatterns.length === 0) return { items, prefix };

				return {
					items: items.filter((item) => {
						if (item.value.startsWith("/")) return true;
						const relPath = item.value.replace(/^@/, "").replace(/\\/g, "/");
						if (excludePatterns.length > 0 && matchesPattern(relPath, excludePatterns)) return true;
						return !matchesPattern(relPath, gitignorePatterns);
					}),
					prefix,
				};
			},
			applyCompletion: (lines, cursorLine, cursorCol, item, prefix) =>
				current.applyCompletion(lines, cursorLine, cursorCol, item, prefix),
			shouldTriggerFileCompletion: (lines, cursorLine, cursorCol) =>
				current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true,
		}));
	});
}
