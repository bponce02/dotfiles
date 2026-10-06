import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { copyToClipboard, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type MarkdownToken = {
  type: string;
  depth?: number;
  lang?: string;
};

type MarkdownRuntime = {
  theme: {
    codeBlockBorder: (text: string) => string;
    codeBlockIndent?: string;
  };
};

type RenderToken = (
  this: MarkdownRuntime,
  token: MarkdownToken,
  width: number,
  nextTokenType?: string,
  styleContext?: unknown,
) => string[];

type CodeRegion = {
  start: number;
  end: number;
  code: string;
};

type CopyState = {
  notify?: (message: string, level: "info" | "error") => void;
};

const patchFlag = Symbol.for("pi.clean-markdown.patched");
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const maxImageBytes = 15 * 1024 * 1024;
const copyPatchFlag = Symbol.for("pi.better-tui.copy-patched");
const codeRegionsKey = Symbol.for("pi.better-tui.code-regions");
const copyStateKey = Symbol.for("pi.better-tui.copy-state");
const copyState = ((globalThis as Record<symbol, unknown>)[copyStateKey] ??= {}) as CopyState;

function stripAnsi(text: string) {
  return text
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "");
}

function extractCodeBlocks(markdown: string) {
  const blocks: string[] = [];
  const lines = markdown.split("\n");
  let marker: string | undefined;
  let code: string[] = [];

  for (const line of lines) {
    if (!marker) {
      const opening = line.match(/^\s*(`{3,}|~{3,})/);
      if (!opening) continue;
      marker = opening[1];
      code = [];
      continue;
    }

    if (new RegExp(`^\\s*${marker[0]}{${marker.length},}\\s*$`).test(line)) {
      blocks.push(code.join("\n"));
      marker = undefined;
      code = [];
      continue;
    }

    code.push(line);
  }

  return blocks;
}

function installCodeCopyPatch(prototype: {
  render: (width: number) => string[];
  handleMouse?: (event: TuiMouseEvent) => TuiMouseEventResult | undefined;
  [key: symbol]: unknown;
}) {
  if (prototype[copyPatchFlag]) return;

  const render = prototype.render;
  const handleMouse = prototype.handleMouse;

  prototype.render = function (this: { text?: string; [key: symbol]: unknown }, width) {
    const lines = render.call(this, width);
    const blocks = extractCodeBlocks(this.text ?? "");
    const regions: CodeRegion[] = [];
    let blockIndex = 0;
    let start: number | undefined;

    for (let index = 0; index < lines.length && blockIndex < blocks.length; index++) {
      const line = stripAnsi(lines[index]).trim();
      if (start === undefined && line.startsWith("╭─") && !line.includes("🖼")) {
        start = index;
      } else if (start !== undefined && line === "╰─") {
        regions.push({ start, end: index, code: blocks[blockIndex] });
        blockIndex++;
        start = undefined;
      }
    }

    this[codeRegionsKey] = regions;
    return lines;
  };

  prototype.handleMouse = function (this: { [key: symbol]: unknown }, event) {
    if (event.type === "click" && event.button === "left") {
      const region = ((this[codeRegionsKey] as CodeRegion[] | undefined) ?? []).find(
        (candidate) => event.y >= candidate.start && event.y <= candidate.end,
      );
      if (region) {
        void copyToClipboard(region.code)
          .then(() => copyState.notify?.("Copied code block", "info"))
          .catch(() => copyState.notify?.("Could not copy code block", "error"));
        return { handled: true };
      }
    }

    return handleMouse?.call(this, event);
  };

  prototype[copyPatchFlag] = true;
}

async function loadPicture(source: string, cwd: string, signal?: AbortSignal) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, { signal });
    if (!response.ok) throw new Error(`Image request failed: ${response.status} ${response.statusText}`);

    const mimeType = response.headers.get("content-type")?.split(";")[0].toLowerCase() ?? "";
    if (!supportedMimeTypes.has(mimeType)) throw new Error(`Unsupported image type: ${mimeType || "unknown"}`);

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxImageBytes) throw new Error("Image exceeds the 15 MB limit");

    return {
      data: bytes.toString("base64"),
      mimeType,
      name: basename(new URL(source).pathname) || "picture",
      source,
    };
  }

  const path = resolve(cwd, source.replace(/^@/, ""));
  const extension = path.split(".").pop()?.toLowerCase();
  const mimeType = extension === "png"
    ? "image/png"
    : extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : extension === "webp"
        ? "image/webp"
        : extension === "gif"
          ? "image/gif"
          : "";

  if (!supportedMimeTypes.has(mimeType)) throw new Error("Use a PNG, JPEG, WebP, or GIF image");

  const bytes = await readFile(path);
  if (bytes.length > maxImageBytes) throw new Error("Image exceeds the 15 MB limit");

  return {
    data: bytes.toString("base64"),
    mimeType,
    name: basename(path),
    source: path,
  };
}

function renderImageCards(markdown: string) {
  let fence: string | undefined;

  return markdown
    .split("\n")
    .flatMap((line) => {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        fence = fence === marker ? undefined : fence ?? marker;
        return [line];
      }

      if (fence) return [line];

      const image = line.match(/^\s*!\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)\s*$/);
      if (!image) return [line];

      const [, alt, url] = image;
      return [
        `╭─ 🖼 ${alt || "Image"}`,
        `│ [Ctrl+Click to open in browser](${url})`,
        `╰─ [${url}](${url})`,
      ];
    })
    .join("\n");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    copyState.notify = (message, level) => ctx.ui.notify(message, level);
  });

  pi.on("session_shutdown", () => {
    copyState.notify = undefined;
  });

  pi.registerMarkdownTransformer((markdown) => renderImageCards(markdown));

  pi.registerTool({
    name: "render_picture",
    label: "Render picture",
    description: "Render a local or remote image inside Pi with its full-size source shown beneath it.",
    promptSnippet: "Render a picture inside Pi from an HTTPS URL or local image path",
    promptGuidelines: [
      "Use render_picture instead of Markdown image syntax whenever the user asks to render, show, or preview a picture in the TUI.",
    ],
    renderShell: "self",
    parameters: Type.Object({
      source: Type.String({ description: "HTTPS image URL or local PNG, JPEG, WebP, or GIF path" }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const picture = await loadPicture(params.source, ctx.cwd, signal);
      return {
        content: [
          {
            type: "text",
            text: `${picture.name}\nCtrl+Click for full size: ${picture.source}`,
          },
          {
            type: "image",
            data: picture.data,
            mimeType: picture.mimeType,
          },
        ],
        details: { name: picture.name, source: picture.source },
      };
    },
    renderCall() {
      return new Container();
    },
    renderResult(result, _options, theme) {
      const details = result.details as { source?: string } | undefined;
      return details?.source
        ? new Text(theme.fg("mdLink", details.source), 0, 0)
        : new Container();
    },
  });

  const prototype = Markdown.prototype as unknown as {
    render: (width: number) => string[];
    renderToken: RenderToken;
    handleMouse?: (event: TuiMouseEvent) => TuiMouseEventResult | undefined;
    [key: symbol]: unknown;
  };

  installCodeCopyPatch(prototype);

  if (prototype[patchFlag]) return;

  const renderToken = prototype.renderToken;

  prototype.renderToken = function (token, width, nextTokenType, styleContext) {
    if (token.type === "heading" && (token.depth ?? 0) >= 3) {
      return renderToken.call(this, { ...token, depth: 2 }, width, nextTokenType, styleContext);
    }

    const rendered = renderToken.call(this, token, width, nextTokenType, styleContext);
    if (token.type !== "code") return rendered;

    const trailingSpace = rendered.at(-1) === "";
    const body = rendered.slice(1, trailingSpace ? -2 : -1);
    const indent = this.theme.codeBlockIndent ?? "  ";
    const language = token.lang ? ` ${token.lang}` : "";
    const lines = [
      this.theme.codeBlockBorder(`╭─${language}`),
      ...body.map((line) => {
        const content = line.startsWith(indent) ? line.slice(indent.length) : line;
        return this.theme.codeBlockBorder("│ ") + content;
      }),
      this.theme.codeBlockBorder("╰─"),
    ];

    if (trailingSpace) lines.push("");
    return lines;
  };

  prototype[patchFlag] = true;
}
