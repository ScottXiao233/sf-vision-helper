#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const claudeDir = path.join(os.homedir(), ".claude");
const settingsPath = path.join(claudeDir, "settings.json");
const skillTarget = path.join(claudeDir, "skills", "sf-vision");
const hooks = [
  path.join(claudeDir, "hooks", "sf-vision-autohint.mjs"),
  path.join(claudeDir, "hooks", "sf-vision-session-env.sh"),
];
const privateEnv = path.join(claudeDir, "private", "sf-vision.env");
const removeKey = process.argv.includes("--remove-key");

function stripHookCommands(settings) {
  const commandNames = new Set([
    hooks[1],
    `node ${hooks[0]}`,
  ]);
  if (!settings.hooks) return settings;

  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((entry) => ({
        ...entry,
        hooks: (entry.hooks || []).filter((hook) => !commandNames.has(hook.command)),
      }))
      .filter((entry) => (entry.hooks || []).length > 0);
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  return settings;
}

fs.rmSync(skillTarget, { recursive: true, force: true });
for (const hook of hooks) fs.rmSync(hook, { force: true });
if (removeKey) fs.rmSync(privateEnv, { force: true });

if (fs.existsSync(settingsPath)) {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  fs.writeFileSync(settingsPath, `${JSON.stringify(stripHookCommands(settings), null, 2)}\n`);
}

console.log("Removed sf-vision skill and hooks.");
if (removeKey) {
  console.log(`Removed private key file: ${privateEnv}`);
} else {
  console.log(`Kept private key file: ${privateEnv}`);
  console.log("Run with --remove-key to delete it too.");
}
