import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const pointerScript = `
import ctypes
import sys

x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x.XDefaultRootWindow.restype = ctypes.c_ulong
x.XWarpPointer.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_int, ctypes.c_int]
x.XFlush.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
if not d:
    sys.exit('Could not open X display')
r = x.XDefaultRootWindow(d)
print('ready', flush=True)
for line in sys.stdin:
    a, b = map(int, line.split())
    x.XWarpPointer(d, 0, r, 0, 0, 0, 0, a, b)
    x.XFlush(d)
`;

function child(command: string, args: string[], env = process.env) {
  const proc = spawn(command, args, { env, stdio: "pipe" });
  let stderr = "";
  let failure: Error | undefined;
  proc.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-12000); });
  proc.on("error", error => { failure = error; });
  return { proc, error: () => failure ?? new Error(`${command} exited: ${stderr}`) };
}

async function stop(proc: ChildProcessWithoutNullStreams) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const closed = once(proc, "close").catch(() => undefined);
  proc.kill("SIGTERM");
  const timeout = setTimeout(() => proc.kill("SIGKILL"), 3000);
  try { await closed; } finally { clearTimeout(timeout); }
}

export async function startDesktop(width: number, height: number) {
  const server = child(process.env.PI_RECORDER_XVFB ?? "Xvfb", ["-displayfd", "1", "-screen", "0", `${width}x${height}x24`, "-nolisten", "tcp", "-noreset"]);
  let display = "";
  server.proc.stdout.on("data", chunk => { display += chunk; });
  try {
    for (let i = 0; !display.includes("\n"); i += 1) {
      if (i > 100 || server.proc.exitCode !== null || server.proc.pid === undefined) throw server.error();
      await delay(50);
    }
    const env = { ...process.env, DISPLAY: `:${display.trim()}` };
    const pointer = child("python3", ["-u", "-c", pointerScript], env);
    let ready = false;
    pointer.proc.stdout.on("data", () => { ready = true; });
    try {
      for (let i = 0; !ready; i += 1) {
        if (i > 100 || pointer.proc.exitCode !== null || pointer.proc.pid === undefined) throw pointer.error();
        await delay(50);
      }
      return {
        env,
        move(x: number, y: number) { pointer.proc.stdin.write(`${Math.round(x)} ${Math.round(y)}\n`); },
        async close() { await stop(pointer.proc); await stop(server.proc); },
      };
    } catch (error) { await stop(pointer.proc); throw error; }
  } catch (error) { await stop(server.proc); throw error; }
}

export async function startCapture(display: string, width: number, height: number, path: string, drawMouse: boolean) {
  const capture = child("ffmpeg", ["-y", "-f", "x11grab", "-draw_mouse", drawMouse ? "1" : "0", "-framerate", "30", "-video_size", `${width}x${height}`, "-i", `${display}+0,0`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", path]);
  await delay(700);
  if (capture.proc.exitCode !== null || capture.proc.pid === undefined) throw capture.error();
  return {
    async close() {
      if (capture.proc.exitCode !== null) throw capture.error();
      const closed = once(capture.proc, "close");
      capture.proc.stdin.write("q\n");
      const timeout = setTimeout(() => capture.proc.kill("SIGKILL"), 10000);
      try {
        const [code] = await closed;
        if (code !== 0) throw capture.error();
      } finally { clearTimeout(timeout); }
    },
  };
}
