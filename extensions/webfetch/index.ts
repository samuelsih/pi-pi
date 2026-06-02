import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "typebox"
import TurndownService from "./vendor/turndown/turndown"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000 // 30 seconds
const MAX_TIMEOUT = 120 * 1000 // 2 minutes

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  "image/avif",
]

function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.some((t) => mime.includes(t))
}

function extractTextFromHTML(html: string): string {
  let text = ""
  let skipDepth = 0
  const skipTags = new Set(["script", "style", "noscript", "iframe", "object", "embed"])

  // Simple regex-based HTML text extractor (no external deps)
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>|([^<]+)/g
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[2]) {
      // Text node
      if (skipDepth === 0) {
        text += match[2]
      }
    } else if (match[1]) {
      const tagName = match[1].toLowerCase()
      const isClosing = match[0][1] === "/"

      if (isClosing) {
        if (skipDepth > 0) skipDepth--
      } else {
        if (skipTags.has(tagName)) {
          skipDepth++
        }
      }
    }
  }

  return text.trim()
}

function convertHTMLToMarkdown(html: string): string {
  const turndownService = new TurndownService({
    headingStyle: "atx",
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
  })
  turndownService.remove(["script", "style", "meta", "link"])
  return turndownService.turndown(html)
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "webfetch",
    label: "WebFetch",
    description: `Fetch a URL and return its content. Supports text, markdown, and HTML formats. Use this tool to read web pages, APIs, or download content.

- format: "markdown" (default) converts HTML to clean markdown, "text" extracts plain text, "html" returns raw HTML
- timeout: optional timeout in seconds (max 120, default 30)
- Returns up to 5MB of content
- Images are returned as base64 data URIs`,
    promptSnippet: "Fetch content from a URL and return it as text, markdown, or HTML",
    promptGuidelines: [
      "Use webfetch when the user asks to retrieve content from a specific URL or web page.",
      "Use webfetch with format 'markdown' for readable web page content.",
      "Use webfetch with format 'text' for plain text extraction without formatting.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch content from" }),
      format: Type.Optional(
        Type.Union(
          [Type.Literal("text"), Type.Literal("markdown"), Type.Literal("html")],
          {
            description:
              'The format to return the content in (text, markdown, or html). Defaults to "markdown".',
          }
        )
      ),
      timeout: Type.Optional(
        Type.Number({ description: "Optional timeout in seconds (max 120)" })
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate) {
      const { url, format = "markdown", timeout: timeoutSec } = params as {
        url: string
        format?: "text" | "markdown" | "html"
        timeout?: number
      }

      // Validate URL
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        throw new Error("URL must start with http:// or https://")
      }

      const timeout = Math.min(
        (timeoutSec ?? DEFAULT_TIMEOUT / 1000) * 1000,
        MAX_TIMEOUT
      )

      // Build Accept header based on requested format
      let acceptHeader = "*/*"
      switch (format) {
        case "markdown":
          acceptHeader =
            "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
          break
        case "text":
          acceptHeader =
            "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
          break
        case "html":
          acceptHeader =
            "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
          break
      }

      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
        Accept: acceptHeader,
        "Accept-Language": "en-US,en;q=0.9",
      }

      // Fetch with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      // Link our signal to the controller
      if (signal) {
        signal.addEventListener("abort", () => controller.abort())
      }

      let response: Response
      try {
        onUpdate?.({ content: [{ type: "text", text: `Fetching ${url}...` }] })

        response = await fetch(url, {
          headers,
          signal: controller.signal,
          redirect: "follow",
        })
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === "AbortError") {
          throw new Error(`Request timed out after ${timeout / 1000}s`)
        }
        throw new Error(`Failed to fetch URL: ${err.message}`)
      } finally {
        clearTimeout(timeoutId)
      }

      // Retry with honest UA if blocked by Cloudflare
      if (response.status === 403) {
        const cfMitigated = response.headers.get("cf-mitigated")
        if (cfMitigated === "challenge") {
          try {
            const retryController = new AbortController()
            const retryTimeoutId = setTimeout(() => retryController.abort(), timeout)
            if (signal) {
              signal.addEventListener("abort", () => retryController.abort())
            }

            response = await fetch(url, {
              headers: { ...headers, "User-Agent": "pi-webfetch" },
              signal: retryController.signal,
              redirect: "follow",
            })
            clearTimeout(retryTimeoutId)
          } catch (err: any) {
            if (err.name === "AbortError") {
              throw new Error(`Request timed out after ${timeout / 1000}s`)
            }
            throw new Error(`Failed to fetch URL: ${err.message}`)
          }
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Check content length
      const contentLength = response.headers.get("content-length")
      if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
        throw new Error("Response too large (exceeds 5MB limit)")
      }

      // Read response body
      const arrayBuffer = await response.arrayBuffer()
      if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
        throw new Error("Response too large (exceeds 5MB limit)")
      }

      const contentType = response.headers.get("content-type") || ""
      const mime = contentType.split(";")[0]?.trim().toLowerCase() || ""
      const title = `${url} (${contentType})`

      // Handle images
      if (isImageMime(mime)) {
        const base64Content = Buffer.from(arrayBuffer).toString("base64")
        return {
          content: [
            {
              type: "text" as const,
              text: `Image fetched successfully\nContent-Type: ${mime}\nSize: ${arrayBuffer.byteLength} bytes`,
            },
          ],
          details: {
            url,
            contentType: mime,
            format,
            isImage: true,
            dataUri: `data:${mime};base64,${base64Content}`,
          },
        }
      }

      const content = new TextDecoder().decode(arrayBuffer)

      // Handle content based on requested format and actual content type
      let output: string
      switch (format) {
        case "markdown":
          if (contentType.includes("text/html")) {
            output = convertHTMLToMarkdown(content)
          } else {
            output = content
          }
          break

        case "text":
          if (contentType.includes("text/html")) {
            output = extractTextFromHTML(content)
          } else {
            output = content
          }
          break

        case "html":
          output = content
          break

        default:
          output = content
      }

      return {
        content: [{ type: "text" as const, text: output }],
        details: {
          url,
          contentType,
          format,
          size: arrayBuffer.byteLength,
        },
      }
    },
  })
}
