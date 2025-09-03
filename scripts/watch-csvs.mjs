// scripts/watch-csvs.mjs
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";

const CSV_DIR = path.resolve("src/csvs");
const GEN = path.resolve("scripts/generate-csvs.mjs");

let running = false;
let pending = false;

function runGen() {
  if (running) { pending = true; return; }
  running = true;
  const p = spawn(process.execPath, [GEN], { stdio: "inherit" });
  p.on("exit", () => {
    running = false;
    if (pending) { pending = false; runGen(); }
  });
}

async function ensureDir() {
  try { await fs.mkdir(CSV_DIR, { recursive: true }); } catch {}
}

(async function main() {
  await ensureDir();
  runGen(); // initial build

  // Lightweight watcher with debounce-ish gating
  try {
    const watcher = fs.watch(CSV_DIR, { recursive: true }, (_eventType, filename) => {
      if (!filename || !/\.csv$/i.test(filename)) return;
      runGen();
    });
    process.on("SIGINT", () => watcher.close());
    process.on("SIGTERM", () => watcher.close());
  } catch (err) {
    console.error("[csvs watch] Failed to watch:", err);
    // fall back to periodic regen every 3s
    setInterval(runGen, 3000);
  }
})();
