#!/usr/bin/env node
import fs from "node:fs";

let input = {};
try {
  input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
} catch {
  input = {};
}

const prompt = String(input.prompt || "");
const likelyImagePrompt =
  /图片|截图|图中|图里|这张图|这个图|照片|界面|报错截图|figure|image|screenshot|ocr/i.test(prompt);

const context = `If this user turn includes an uploaded image, screenshot, figure, photo, or asks about visual content, use SiliconFlow Vision automatically before answering. Run:
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" --latest-claude-image "<the user's visual question>"
Do not ask the user to invoke /sf-vision manually. Do not only check environment variables; the helper also reads "$HOME/.claude/private/sf-vision.env".`;

// Always include a short hint because image attachments may not appear in the text prompt.
// Put the stronger wording first when the text itself mentions visual content.
const additionalContext = likelyImagePrompt
  ? `Visual-content prompt detected. ${context}`
  : context;

console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext,
    },
  }),
);
