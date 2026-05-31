import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

import {
  buildRequestPayload,
  defaultPrompt,
  detectMimeType,
  findLatestClaudeImageDataUrl,
  formatApiError,
  getApiKey,
  getConfiguredApiKey,
  parseArgs,
  resolveImageUrl,
} from "./sf-vision.mjs";

const scriptPath = new URL("./sf-vision.mjs", import.meta.url).pathname;

describe("sf-vision helpers", () => {
  it("detects common image MIME types", () => {
    assert.equal(detectMimeType("photo.jpg"), "image/jpeg");
    assert.equal(detectMimeType("photo.jpeg"), "image/jpeg");
    assert.equal(detectMimeType("diagram.png"), "image/png");
    assert.equal(detectMimeType("scan.webp"), "image/webp");
  });

  it("rejects unsupported local file extensions", () => {
    assert.throws(() => detectMimeType("notes.txt"), /Unsupported image extension/);
  });

  it("resolves an HTTPS image URL without reading local files", () => {
    assert.equal(
      resolveImageUrl("https://example.com/image.png", "high"),
      "https://example.com/image.png",
    );
  });

  it("converts a local image file to a data URL", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-vision-"));
    const imagePath = path.join(dir, "pixel.png");
    fs.writeFileSync(imagePath, Buffer.from("iVBORw0KGgo=", "base64"));

    const url = resolveImageUrl(imagePath, "low");

    assert.match(url, /^data:image\/png;base64,/);
  });

  it("extracts the latest Claude Code image attachment from project JSONL", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sf-vision-claude-"));
    const cwd = path.join(root, "work");
    const projectsRoot = path.join(root, "projects");
    const projectDir = path.join(projectsRoot, "-tmp-sf-vision-work");
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    const transcript = [
      JSON.stringify({
        message: {
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "old-image",
              },
            },
          ],
        },
      }),
      JSON.stringify({
        message: {
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/webp",
                data: "latest-image",
              },
            },
            { type: "text", text: "Base directory for this skill" },
          ],
        },
      }),
    ].join("\n");
    fs.writeFileSync(path.join(projectDir, "session.jsonl"), `${transcript}\n`);

    assert.equal(
      findLatestClaudeImageDataUrl({ cwd: "/tmp/sf-vision/work", projectsRoot }),
      "data:image/webp;base64,latest-image",
    );
  });

  it("builds a SiliconFlow chat completions payload", () => {
    const payload = buildRequestPayload({
      imageUrl: "https://example.com/image.png",
      question: "图中有什么？",
      detail: "high",
      model: "Qwen/Qwen3-VL-8B-Instruct",
      maxTokens: 1200,
      temperature: 0.1,
    });

    assert.equal(payload.model, "Qwen/Qwen3-VL-8B-Instruct");
    assert.equal(payload.max_tokens, 1200);
    assert.equal(payload.temperature, 0.1);
    assert.equal(payload.messages[0].role, "user");
    assert.deepEqual(payload.messages[0].content[0], {
      type: "image_url",
      image_url: {
        url: "https://example.com/image.png",
        detail: "high",
      },
    });
    assert.equal(payload.messages[0].content[1].type, "text");
    assert.match(payload.messages[0].content[1].text, /图中有什么/);
  });

  it("formats a clear invalid-key API error", () => {
    assert.match(formatApiError(401, '"Api key is invalid"'), /key was found/);
    assert.match(formatApiError(401, '"Api key is invalid"'), /rejected it/);
    assert.match(formatApiError(401, '"Api key is invalid"'), /sf-vision\.env/);
  });

  it("reads API keys from supported environment variables", () => {
    assert.equal(getApiKey({ SILICONFLOW_API_KEY: "sf-main" }), "sf-main");
    assert.equal(getApiKey({ SF_API_KEY: "sf-short" }), "sf-short");
    assert.equal(getApiKey({}), "");
  });

  it("can read an API key from a private env file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sf-vision-env-"));
    const envPath = path.join(dir, "sf-vision.env");
    fs.writeFileSync(envPath, 'export SILICONFLOW_API_KEY="sf-from-file"\n');

    assert.equal(getConfiguredApiKey({}, envPath), "sf-from-file");
  });

  it("uses a practical default prompt for image understanding", () => {
    assert.match(defaultPrompt(""), /无法直接看图/);
    assert.match(defaultPrompt("解释坐标轴"), /解释坐标轴/);
  });

  it("rejects missing numeric option values", () => {
    assert.throws(
      () => parseArgs(["https://example.com/image.png", "--temperature"], {}),
      /--temperature must be a number/,
    );
  });
});

describe("sf-vision CLI", () => {
  it("prints a clear configuration error when no API key is present", () => {
    const env = { ...process.env };
    delete env.SILICONFLOW_API_KEY;
    delete env.SF_API_KEY;
    delete env.SILICONFLOW_BASE_URL;
    delete env.SF_VISION_MODEL;
    env.SF_VISION_ENV_FILE = path.join(os.tmpdir(), "sf-vision-missing-env-file");

    const result = spawnSync(
      process.execPath,
      [scriptPath, "https://example.com/image.png", "describe"],
      { env, encoding: "utf8" },
    );

    assert.equal(result.status, 2);
    assert.match(result.stderr, /SILICONFLOW_API_KEY/);
  });
});
