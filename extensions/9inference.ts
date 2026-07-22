/**
 * 9inference Custom Provider
 *
 * OpenAI-compatible provider with base URL https://9inference.cloud/v1
 * Models and pricing sourced from https://9inference.cloud/id/models
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("9inference", {
    name: "9 Inference",
    baseUrl: "https://9inference.cloud/v1",
    apiKey: "$NINEINFERENCE_API_KEY",
    api: "openai-completions",
    models: [
      // ── GLM Models ─────────────────────────────────────────────────
      {
        id: "glm-5.2",
        name: "GLM-5.2",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.11, output: 0.24, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 32_768,
      },
      {
        id: "glm-5.1",
        name: "GLM 5.1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.13, output: 0.19, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 32_768,
      },
      {
        id: "glm-5.2-fast",
        name: "GLM 5.2 Fast",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.19, output: 0.44, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 32_768,
      },

      // ── DeepSeek Models ────────────────────────────────────────────
      {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        reasoning: true,
        input: ["text"],
        cost: { input: 0.14, output: 0.22, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 32_768,
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "max",
        },
        compat: { supportsReasoningEffort: true, thinkingFormat: "deepseek" },
      },
      {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        reasoning: true,
        input: ["text"],
        cost: { input: 0.13, output: 0.22, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 32_768,
        thinkingLevelMap: {
          minimal: null,
          low: "low",
          medium: "medium",
          high: "high",
          xhigh: "max",
        },
        compat: { supportsReasoningEffort: true, thinkingFormat: "deepseek" },
      },

      // ── Qwen Models ────────────────────────────────────────────────
      {
        id: "qwen3.7-plus",
        name: "Qwen 7 Plus",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.11, output: 0.33, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 32_768,
      },
      {
        id: "qwen3-coder-next",
        name: "Qwen3 Coder Next",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.11, output: 0.22, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 200_000,
        maxTokens: 32_768,
      },

      // ── MiniMax ────────────────────────────────────────────────────
      {
        id: "minimax-m3",
        name: "MiniMax M3",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0.08, output: 0.11, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 1_000_000,
        maxTokens: 32_768,
      },

      // ── MoonshotAI (Kimi) ──────────────────────────────────────────
      {
        id: "kimi-k2.7-code",
        name: "Kimi K2.7 Code",
        reasoning: false,
        input: ["text", "image"],
        cost: { input: 0.19, output: 0.33, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 250_000,
        maxTokens: 32_768,
      },

      // ── Xiaomi ─────────────────────────────────────────────────────
      {
        id: "mimo-v2.5-pro",
        name: "MiMo V2.5 Pro",
        reasoning: false,
        input: ["text"],
        cost: { input: 0.06, output: 0.06, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256_000,
        maxTokens: 32_768,
      },
    ],
  });
}
