import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync("npx", ["vite", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (result.status !== 0) process.exit(result.status ?? 1);
