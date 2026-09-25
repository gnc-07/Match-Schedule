// Starts Python's built-in web server on a spare port so the tests see the site
// exactly as a browser would, and finds the Chromium browser to test with.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PORT = Number(process.env.PORT || 8123);
export const BASE = `http://localhost:${PORT}/`;

export function chromePath() {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"].filter(Boolean);
  const found = candidates.find(p => existsSync(p));
  if (!found) throw new Error("No Chromium or Chrome found. Install one, or set CHROME_PATH.");
  return found;
}

export async function startServer() {
  if (!existsSync(path.join(ROOT, "fixtures.json"))) {
    throw new Error("fixtures.json is missing. Run: python3 build_schedule.py");
  }
  const proc = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" });
  // Wait until the port accepts connections. (A plain socket, because Node's
  // fetch occasionally crashes on the way Python's server closes connections.)
  const listening = () => new Promise(resolve => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
  for (let i = 0; i < 50; i++) {
    if (await listening()) return proc;
    await new Promise(r => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`The local web server did not start on port ${PORT}. Is something else using it?`);
}
