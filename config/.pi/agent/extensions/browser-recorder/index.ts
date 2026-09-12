import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, resolve } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { startCapture, startDesktop } from "./native-capture.ts";

const actionNames = [
  "goto",
  "click",
  "type",
  "fill",
  "select",
  "press",
  "check",
  "uncheck",
  "wait",
  "wait_for_url",
  "screenshot",
] as const;

const actionSchema = Type.Object({
  action: StringEnum(actionNames),
  selector: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  text_env: Type.Optional(Type.String()),
  value: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  ms: Type.Optional(Type.Number({ minimum: 0 })),
  pause_after_ms: Type.Optional(Type.Number({ minimum: 0 })),
});

const parameters = Type.Object({
  output: Type.String({ description: "MP4 output path, relative to the project or absolute" }),
  actions: Type.Array(actionSchema, { minItems: 1 }),
  setup: Type.Optional(
    Type.Array(actionSchema, {
      description: "Unrecorded actions used to establish authentication or other initial state",
    }),
  ),
  width: Type.Optional(Type.Integer({ minimum: 320, maximum: 3840 })),
  height: Type.Optional(Type.Integer({ minimum: 240, maximum: 2160 })),
  cursor_style: Type.Optional(StringEnum(["circle", "arrow", "hidden"] as const, { description: "Cursor appearance; defaults to the native arrow. Use hidden for slides or touch tutorials." })),
  cursor_speed: Type.Optional(
    Type.Number({ minimum: 100, maximum: 3000, description: "Maximum cursor speed in pixels/second" }),
  ),
  typing_delay_ms: Type.Optional(Type.Number({ minimum: 0, maximum: 500 })),
  keep_webm: Type.Optional(Type.Boolean()),
  gif: Type.Optional(Type.Boolean({ description: "Also export a looping GIF alongside the MP4" })),
  gif_width: Type.Optional(Type.Integer({ minimum: 320, maximum: 3840 })),
  gif_fps: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
});

type ActionName = (typeof actionNames)[number];

type FlowAction = {
  action: ActionName;
  selector?: string;
  url?: string;
  text?: string;
  text_env?: string;
  value?: string;
  label?: string;
  key?: string;
  path?: string;
  ms?: number;
  pause_after_ms?: number;
};

type ToolParams = {
  output: string;
  actions: FlowAction[];
  setup?: FlowAction[];
  width?: number;
  height?: number;
  cursor_style?: "circle" | "arrow" | "hidden";
  cursor_speed?: number;
  typing_delay_ms?: number;
  keep_webm?: boolean;
  gif?: boolean;
  gif_width?: number;
  gif_fps?: number;
};

type Cursor = { x: number; y: number };

export function cursorScript(style: "circle" | "hidden" = "circle") {
  return String.raw`
(() => {
  function install() {
    const mode = ${JSON.stringify(style)};
    const hideNative = document.createElement('style');
    hideNative.textContent = '* { cursor: none !important; }';
    document.documentElement.appendChild(hideNative);
    if (window !== window.top || mode === 'hidden') return;
    const old = document.getElementById('__pi_recorder_cursor');
    if (old) old.remove();
    const match = window.name.match(/(?:^|;)__pi_recorder_cursor=([\d.]+),([\d.]+)(?:;|$)/);
    const x = match ? match[1] : String(innerWidth / 2);
    const y = match ? match[2] : String(innerHeight / 2);
    const cursor = document.createElement('div');
    cursor.id = '__pi_recorder_cursor';
    const transform = 'translate(-50%,-50%)';
    cursor.innerHTML = '<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="29" fill="#1671e8" fill-opacity=".12" stroke="#1671e8" stroke-width="3"/><circle cx="32" cy="32" r="14" fill="#1671e8" fill-opacity=".18"/></svg>';
    Object.assign(cursor.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: '64px', height: '64px', zIndex: '2147483647', pointerEvents: 'none', transform });
    cursor.style.visibility = match && (Number(x) !== 0 || Number(y) !== 0) ? 'visible' : 'hidden';
    document.documentElement.appendChild(cursor);
    const remember = (nextX, nextY) => {
      const entry = '__pi_recorder_cursor=' + nextX + ',' + nextY;
      const rest = window.name.replace(/(?:^|;)__pi_recorder_cursor=[\d.]+,[\d.]+(?=;|$);?/g, '').replace(/^;|;$/g, '');
      window.name = rest ? rest + ';' + entry : entry;
    };
    document.addEventListener('mousemove', event => {
      if (event.clientX === 0 && event.clientY === 0 && cursor.style.visibility === 'hidden') return;
      cursor.style.visibility = 'visible';
      cursor.style.left = event.clientX + 'px';
      cursor.style.top = event.clientY + 'px';
      remember(event.clientX, event.clientY);
    }, true);
    document.addEventListener('mousedown', () => {
      cursor.animate([
        { transform: transform + ' scale(1)' },
        { transform: transform + ' scale(.82)' },
        { transform: transform + ' scale(1)' }
      ], { duration: 220, easing: 'ease-out' });
    }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
`;
}

function resolvePath(cwd: string, path: string) {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return resolve(homedir(), path.slice(2));
  return resolve(cwd, path);
}

function required(action: FlowAction, field: keyof FlowAction): string {
  const value = action[field];
  if (typeof value !== "string" || !value) {
    throw new Error(`${action.action} requires ${field}`);
  }
  return value;
}

function actionText(action: FlowAction): string {
  if (action.text_env) {
    const value = process.env[action.text_env];
    if (value === undefined) throw new Error(`Environment variable ${action.text_env} is not set`);
    return value;
  }
  return action.text ?? "";
}

async function smoothMove(page: Page, locator: Locator, cursor: Cursor, speed: number) {
  const scrolled = await locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    if (getComputedStyle(element).position === "fixed" || (box.top >= 100 && box.bottom <= innerHeight - 100)) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    return true;
  });
  if (scrolled) await locator.page().waitForTimeout(900);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element has no visible bounding box: ${locator}`);

  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;
  const dx = targetX - cursor.x;
  const dy = targetY - cursor.y;
  const distance = Math.hypot(dx, dy);
  const duration = Math.max(280, (distance / speed) * 1000);
  const bend = Math.min(38, distance * 0.08);
  const controlX = distance ? (cursor.x + targetX) / 2 - (dy / distance) * bend : cursor.x;
  const controlY = distance ? (cursor.y + targetY) / 2 + (dx / distance) * bend : cursor.y;
  const steps = Math.max(18, Math.ceil(duration / 16));

  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
    const inverse = 1 - eased;
    const x = inverse * inverse * cursor.x + 2 * inverse * eased * controlX + eased * eased * targetX;
    const y = inverse * inverse * cursor.y + 2 * inverse * eased * controlY + eased * eased * targetY;
    await page.mouse.move(x, y);
    await page.waitForTimeout(duration / steps);
  }

  cursor.x = targetX;
  cursor.y = targetY;
}

async function recordedLocator(page: Page, selector: string, cursor: Cursor, speed: number) {
  const locator = page.locator(selector).first();
  await smoothMove(page, locator, cursor, speed);
  await page.waitForTimeout(80);
  return locator;
}

async function runAction(
  page: Page,
  action: FlowAction,
  options: {
    recorded: boolean;
    cursor: Cursor;
    cursorSpeed: number;
    typingDelay: number;
    cwd: string;
  },
) {
  const locatorForAction = async () => {
    const selector = required(action, "selector");
    if (!options.recorded) return page.locator(selector).first();
    return recordedLocator(page, selector, options.cursor, options.cursorSpeed);
  };

  switch (action.action) {
    case "goto":
      await page.goto(required(action, "url"), { waitUntil: "domcontentloaded" });
      break;
    case "click": {
      const locator = await locatorForAction();
      await locator.click({ delay: options.recorded ? 45 : 0 });
      break;
    }
    case "type": {
      const locator = await locatorForAction();
      await locator.click({ delay: options.recorded ? 45 : 0 });
      await locator.fill("");
      await locator.pressSequentially(actionText(action), { delay: options.typingDelay });
      break;
    }
    case "fill": {
      const locator = await locatorForAction();
      await locator.fill(actionText(action));
      break;
    }
    case "select": {
      const locator = await locatorForAction();
      if (options.recorded) {
        const choices = await locator.evaluate((element) => Array.from((element as HTMLSelectElement).options).map(option => ({ value: option.value, label: option.label, disabled: option.disabled })));
        const index = choices.findIndex(choice => action.label !== undefined ? choice.label === action.label : choice.value === action.value);
        if (index < 0 || choices[index].disabled) throw new Error("Requested select option is unavailable");
        await locator.click();
        await page.waitForTimeout(900);
        await page.keyboard.press("Home");
        const enabledBefore = choices.slice(0, index).filter(choice => !choice.disabled).length;
        for (let i = 0; i < enabledBefore; i += 1) {
          await page.keyboard.press("ArrowDown");
          await page.waitForTimeout(250);
        }
        await page.waitForTimeout(700);
        await page.keyboard.press("Enter");
        if (await locator.inputValue() !== choices[index].value) throw new Error("Native dropdown did not select the requested option");
      } else if (action.label !== undefined) await locator.selectOption({ label: action.label });
      else await locator.selectOption(required(action, "value"));
      break;
    }
    case "press": {
      const locator = await locatorForAction();
      await locator.press(required(action, "key"));
      break;
    }
    case "check":
      await (await locatorForAction()).check();
      break;
    case "uncheck":
      await (await locatorForAction()).uncheck();
      break;
    case "wait":
      await page.waitForTimeout(action.ms ?? 500);
      break;
    case "wait_for_url":
      await page.waitForURL(required(action, "url"));
      break;
    case "screenshot": {
      const path = resolvePath(options.cwd, required(action, "path"));
      await mkdir(dirname(path), { recursive: true });
      await page.screenshot({ path });
      break;
    }
  }

  if (action.pause_after_ms) await page.waitForTimeout(action.pause_after_ms);
}

async function runActions(
  context: BrowserContext,
  actions: FlowAction[],
  options: {
    recorded: boolean;
    cursorSpeed: number;
    typingDelay: number;
    cwd: string;
    signal?: AbortSignal;
    preparePage?: (page: Page) => Promise<void>;
    update?: (message: string) => void;
  },
) {
  const page = await context.newPage();
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 };
  const cursor = { x: viewport.width / 2, y: viewport.height / 2 };
  await options.preparePage?.(page);
  for (const [index, action] of actions.entries()) {
    options.signal?.throwIfAborted();
    options.update?.(`${index + 1}/${actions.length}: ${action.action}`);
    await runAction(page, action, { ...options, cursor });
  }
  return page;
}

async function convertGif(pi: ExtensionAPI, input: string, output: string, width = 1200, fps = 12, signal?: AbortSignal) {
  if (extname(output).toLowerCase() !== ".gif") throw new Error("GIF output must end in .gif");
  if (input === output) throw new Error("Input and output must be different files");
  await mkdir(dirname(output), { recursive: true });
  const result = await pi.exec("ffmpeg", [
    "-y", "-i", input, "-vf",
    `fps=${fps},scale='min(${width},iw)':-2:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse=dither=sierra2_4a`,
    "-loop", "0", output,
  ], { signal, timeout: 120000 });
  if (result.code !== 0) throw new Error(`GIF conversion failed: ${result.stderr}`);
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "convert_video_to_gif",
    label: "Convert Video to GIF",
    description: "Convert an existing local video into a palette-optimized looping GIF with ffmpeg. Defaults to 1200px maximum width and 12fps; never upscales.",
    parameters: Type.Object({
      input: Type.String(),
      output: Type.String({ description: "GIF output path" }),
      width: Type.Optional(Type.Integer({ minimum: 320, maximum: 3840 })),
      fps: Type.Optional(Type.Integer({ minimum: 1, maximum: 30 })),
    }),
    async execute(_id, params, signal, _update, ctx) {
      const input = resolvePath(ctx.cwd, params.input);
      const output = resolvePath(ctx.cwd, params.output);
      await convertGif(pi, input, output, params.width, params.fps, signal);
      return { content: [{ type: "text", text: `Converted GIF: ${output}` }], details: { output } };
    },
  });
  pi.registerTool({
    name: "record_browser_flow",
    label: "Record Browser Flow",
    description:
      "Record a real Chromium window, including native dropdown menus, on an isolated Linux Xvfb desktop. Playwright automates actions; FFmpeg captures the window and native arrow cursor. Optional circle or hidden cursor. Setup runs off-camera. Produces H.264 MP4; gif=true also exports a looping GIF. Use text_env for credentials. Requires Chromium, FFmpeg, Xvfb, Python 3 and libX11 for window mode.",
    promptSnippet: "Record browser workflows as polished MP4 demos",
    promptGuidelines: [
      "Use record_browser_flow when the user asks for a browser screen recording or product demo.",
      "Keep authentication in record_browser_flow setup actions so login is not included in the video.",
      "Use record_browser_flow text_env rather than text for credentials or other secrets.",
    ],
    parameters,

    async execute(_toolCallId, params: ToolParams, signal, onUpdate, ctx) {
      if (extname(params.output).toLowerCase() !== ".mp4") {
        throw new Error("output must end in .mp4");
      }

      const width = params.width ?? 1440;
      const height = params.height ?? 900;
      const cursorSpeed = params.cursor_speed ?? 800;
      const typingDelay = params.typing_delay_ms ?? 15;
      const output = resolvePath(ctx.cwd, params.output);
      const temp = await mkdtemp(resolve(tmpdir(), "pi-browser-recorder-"));
      const webmOutput = output.replace(/\.mp4$/i, ".webm");
      let browser;
      let desktop: Awaited<ReturnType<typeof startDesktop>> | undefined;
      let capture: Awaited<ReturnType<typeof startCapture>> | undefined;

      try {
        onUpdate?.({ content: [{ type: "text", text: "Launching Chromium" }] });
        desktop = await startDesktop(width, height);
        browser = await chromium.launch({
          headless: false,
          env: desktop!.env,
          args: ["--ozone-platform=x11", `--window-size=${width},${height}`, "--window-position=0,0"],
        });
        let storageState;

        if (params.setup?.length) {
          const setupContext = await browser.newContext({ viewport: { width, height } });
          await runActions(setupContext, params.setup, {
            recorded: false,
            cursorSpeed,
            typingDelay: 0,
            cwd: ctx.cwd,
            signal,
          });
          storageState = await setupContext.storageState();
          await setupContext.close();
        }

        const context = await browser.newContext({
          viewport: null,
          storageState,
          colorScheme: "light",
        });
        if (params.cursor_style && params.cursor_style !== "arrow") {
          await context.addInitScript({ content: cursorScript(params.cursor_style) });
        }
        await runActions(context, params.actions, {
          recorded: true,
          preparePage: async (page) => {
            await page.bringToFront();
            const origin = await page.evaluate(() => ({ x: window.screenX + (window.outerWidth - window.innerWidth) / 2, y: window.screenY + window.outerHeight - window.innerHeight }));
            const move = page.mouse.move.bind(page.mouse);
            page.mouse.move = async (x, y, options) => {
              desktop!.move(x + origin.x, y + origin.y);
              await move(x, y, options);
            };
            await page.mouse.move(width / 2, height / 2);
            await page.waitForTimeout(700);
            capture = await startCapture(desktop!.env.DISPLAY, width, height, resolve(temp, "window.mkv"), !params.cursor_style || params.cursor_style === "arrow");
          },
          cursorSpeed,
          typingDelay,
          cwd: ctx.cwd,
          signal,
          update: (message) =>
            onUpdate?.({ content: [{ type: "text", text: `Recording ${message}` }] }),
        });
        if (capture) { const recording = capture; capture = undefined; await recording.close(); }
        await context.close();
        const rawVideo = resolve(temp, "window.mkv");

        await mkdir(dirname(output), { recursive: true });
        onUpdate?.({ content: [{ type: "text", text: "Encoding MP4 with ffmpeg" }] });
        const conversion = await pi.exec(
          "ffmpeg",
          [
            "-y",
            "-i",
            rawVideo,
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "21",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-an",
            output,
          ],
          { signal, timeout: 120000 },
        );
        if (conversion.code !== 0) throw new Error(`ffmpeg failed: ${conversion.stderr}`);

        if (params.keep_webm) {
          const webm = await pi.exec("ffmpeg", ["-y", "-i", rawVideo, "-c:v", "libvpx-vp9", webmOutput], { signal, timeout: 120000 });
          if (webm.code !== 0) throw new Error(`WebM conversion failed: ${webm.stderr}`);
        }

        const gifOutput = params.gif ? output.replace(/\.mp4$/i, ".gif") : undefined;
        if (gifOutput) {
          onUpdate?.({ content: [{ type: "text", text: "Encoding GIF with ffmpeg" }] });
          await convertGif(pi, output, gifOutput, params.gif_width, params.gif_fps, signal);
        }

        return {
          content: [{ type: "text", text: `Recorded browser flow: ${output}${gifOutput ? `\nGIF: ${gifOutput}` : ""}` }],
          details: { output, gif: gifOutput, webm: params.keep_webm ? webmOutput : undefined },
        };
      } finally {
        try { await capture?.close(); } finally {
          try { await browser?.close(); } finally { await desktop?.close(); }
        }
        await rm(temp, { recursive: true, force: true });
      }
    },
  });
}
