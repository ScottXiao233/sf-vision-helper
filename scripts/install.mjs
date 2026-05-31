#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const claudeDir = path.join(os.homedir(), ".claude");
const skillSource = path.join(repoRoot, "sf-vision");
const skillTarget = path.join(claudeDir, "skills", "sf-vision");
const hooksSource = path.join(repoRoot, "hooks");
const hooksTarget = path.join(claudeDir, "hooks");
const privateDir = path.join(claudeDir, "private");
const settingsPath = path.join(claudeDir, "settings.json");

const hookCommands = {
  SessionStart: path.join(hooksTarget, "sf-vision-session-env.sh"),
  UserPromptSubmit: `node ${path.join(hooksTarget, "sf-vision-autohint.mjs")}`,
};

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot parse ${settingsPath}: ${error.message}`);
  }
}

function hasCommand(settings, event, command) {
  return (settings.hooks?.[event] || []).some((entry) =>
    (entry.hooks || []).some((hook) => hook.type === "command" && hook.command === command),
  );
}

function addHook(settings, event, command) {
  settings.hooks ||= {};
  settings.hooks[event] ||= [];
  if (!hasCommand(settings, event, command)) {
    settings.hooks[event].push({
      hooks: [
        {
          type: "command",
          command,
        },
      ],
    });
  }
}

fs.mkdirSync(path.dirname(skillTarget), { recursive: true });
fs.mkdirSync(hooksTarget, { recursive: true });
fs.mkdirSync(privateDir, { recursive: true, mode: 0o700 });

fs.rmSync(skillTarget, { recursive: true, force: true });
fs.cpSync(skillSource, skillTarget, { recursive: true });
fs.cpSync(hooksSource, hooksTarget, { recursive: true });

for (const executable of [
  path.join(skillTarget, "scripts", "sf-vision.mjs"),
  path.join(hooksTarget, "sf-vision-autohint.mjs"),
  path.join(hooksTarget, "sf-vision-session-env.sh"),
]) {
  fs.chmodSync(executable, 0o755);
}

const settings = readSettings();
settings.enableWorkflows = true;
addHook(settings, "SessionStart", hookCommands.SessionStart);
addHook(settings, "UserPromptSubmit", hookCommands.UserPromptSubmit);
fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);

console.log(`Installed sf-vision skill to ${skillTarget}`);
console.log(`Installed hooks to ${hooksTarget}`);
console.log(`Updated ${settingsPath}`);
console.log("");
console.log("Set your SiliconFlow key before use:");
console.log('  mkdir -p "$HOME/.claude/private"');
console.log('  chmod 700 "$HOME/.claude/private"');
console.log('  printf \'export SILICONFLOW_API_KEY="%s"\\n\' "YOUR_KEY" > "$HOME/.claude/private/sf-vision.env"');
console.log('  chmod 600 "$HOME/.claude/private/sf-vision.env"');
console.log("");
console.log("Restart Claude Code Desktop or run /reload-skills in an existing Code session.");
