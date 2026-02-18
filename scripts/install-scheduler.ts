import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "fs";
import path from "path";
import { execSync } from "child_process";

const PROJECT_DIR = "/Users/johau/Projects/sermon-study";
const PLIST_LABEL = "com.sermon-study.daily";
const PLIST_FILENAME = `${PLIST_LABEL}.plist`;
const SCHEDULER_DIR = path.join(PROJECT_DIR, "scheduler");
const PLIST_SOURCE = path.join(SCHEDULER_DIR, PLIST_FILENAME);
const LAUNCH_AGENTS_DIR = path.join(
  process.env.HOME || "/Users/johau",
  "Library",
  "LaunchAgents"
);
const PLIST_DEST = path.join(LAUNCH_AGENTS_DIR, PLIST_FILENAME);

function findNodePath(): string {
  try {
    return execSync("which node", { encoding: "utf-8" }).trim();
  } catch {
    return "/usr/local/bin/node";
  }
}

function findTsxPath(): string {
  // Check project-local tsx first
  const localTsx = path.join(PROJECT_DIR, "node_modules", ".bin", "tsx");
  if (existsSync(localTsx)) return localTsx;

  try {
    return execSync("which tsx", { encoding: "utf-8" }).trim();
  } catch {
    return path.join(PROJECT_DIR, "node_modules", ".bin", "tsx");
  }
}

function generatePlist(): string {
  const tsxPath = findTsxPath();
  const logPath = path.join(PROJECT_DIR, "data", "daily.log");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${tsxPath}</string>
    <string>${path.join(PROJECT_DIR, "scripts", "daily-study.ts")}</string>
  </array>

  <key>StartCalendarInterval</key>
  <array>
    <dict>
      <key>Hour</key>
      <integer>21</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <dict>
      <key>Hour</key>
      <integer>22</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>StandardOutPath</key>
  <string>${logPath}</string>

  <key>StandardErrorPath</key>
  <string>${logPath}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>`;
}

function main() {
  console.log("Installing sermon-study daily scheduler...\n");

  // Ensure directories exist
  mkdirSync(SCHEDULER_DIR, { recursive: true });
  mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true });
  mkdirSync(path.join(PROJECT_DIR, "data"), { recursive: true });

  // Generate and write plist
  const plistContent = generatePlist();
  writeFileSync(PLIST_SOURCE, plistContent, "utf-8");
  console.log(`Generated: ${PLIST_SOURCE}`);

  // Unload existing agent if present
  try {
    execSync(`launchctl unload "${PLIST_DEST}" 2>/dev/null`, {
      encoding: "utf-8",
    });
    console.log("Unloaded existing agent.");
  } catch {
    // Not loaded, that's fine
  }

  // Copy plist to LaunchAgents
  copyFileSync(PLIST_SOURCE, PLIST_DEST);
  console.log(`Copied to: ${PLIST_DEST}`);

  // Load the agent
  try {
    execSync(`launchctl load "${PLIST_DEST}"`, { encoding: "utf-8" });
    console.log("Loaded agent with launchctl.\n");
  } catch (err) {
    console.error("Failed to load agent:", err);
    console.log("You may need to load it manually:");
    console.log(`  launchctl load "${PLIST_DEST}"\n`);
  }

  console.log("Scheduler installed successfully!");
  console.log("  Schedule: Daily at 21:00 and 22:00 (reminder)");
  console.log(`  Label: ${PLIST_LABEL}`);
  console.log(`  Log: ${path.join(PROJECT_DIR, "data", "daily.log")}`);
  console.log("\nUseful commands:");
  console.log(`  launchctl list | grep sermon`);
  console.log(`  launchctl unload "${PLIST_DEST}"`);
}

main();
