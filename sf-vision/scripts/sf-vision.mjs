#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1";
export const DEFAULT_MODEL = "Qwen/Qwen3-VL-8B-Instruct";
export const DEFAULT_PRIVATE_ENV_PATH = path.join(os.homedir(), ".claude", "private", "sf-vision.env");

const SUPPORTED_MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
]);

function claudeProjectDirName(cwd) {
  return path.resolve(cwd).replace(/\//g, "-");
}

export function getApiKey(env = process.env) {
  return env.SILICONFLOW_API_KEY || env.SF_API_KEY || "";
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function readApiKeyFromEnvFile(envPath = DEFAULT_PRIVATE_ENV_PATH) {
  try {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?(?:SILICONFLOW_API_KEY|SF_API_KEY)\s*=\s*(.+?)\s*$/);
      if (match) return unquoteEnvValue(match[1]);
    }
  } catch {
    // Missing private env file is fine; callers still report a normal missing-key error.
  }
  return "";
}

export function getConfiguredApiKey(env = process.env, envPath = DEFAULT_PRIVATE_ENV_PATH) {
  return getApiKey(env) || readApiKeyFromEnvFile(envPath);
}

export function detectMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = SUPPORTED_MIME_TYPES.get(ext);
  if (!mimeType) {
    throw new Error(
      `Unsupported image extension "${ext || "(none)"}". Supported: jpg, jpeg, png, webp, gif, bmp.`,
    );
  }
  return mimeType;
}

function isUrl(value) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function expandPath(input) {
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return path.resolve(process.cwd(), input);
}

export function resolveImageUrl(imageRef) {
  if (isUrl(imageRef)) return imageRef;

  const absolutePath = expandPath(imageRef);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Image path is not a file: ${absolutePath}`);
  }

  const mimeType = detectMimeType(absolutePath);
  const base64 = fs.readFileSync(absolutePath).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

function collectImagesFromMessageContent(content, images) {
  if (!Array.isArray(content)) return;
  for (const part of content) {
    const source = part?.source;
    if (
      part?.type === "image" &&
      source?.type === "base64" &&
      typeof source.media_type === "string" &&
      typeof source.data === "string" &&
      source.data
    ) {
      images.push(`data:${source.media_type};base64,${source.data}`);
    }
  }
}

export function findLatestClaudeImageDataUrl({
  cwd = process.cwd(),
  projectsRoot = path.join(os.homedir(), ".claude", "projects"),
} = {}) {
  const projectDir = path.join(projectsRoot, claudeProjectDirName(cwd));
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Claude project transcript directory not found: ${projectDir}`);
  }

  const files = fs
    .readdirSync(projectDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const file = path.join(projectDir, entry.name);
      return { file, mtimeMs: fs.statSync(file).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { file } of files) {
    const lines = fs.readFileSync(file, "utf8").trimEnd().split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (!lines[index].trim()) continue;
      let record;
      try {
        record = JSON.parse(lines[index]);
      } catch {
        continue;
      }

      const images = [];
      collectImagesFromMessageContent(record.message?.content, images);
      collectImagesFromMessageContent(record.toolUseResult?.content, images);
      if (images.length > 0) return images.at(-1);
    }
  }

  throw new Error(`No image attachment found in Claude project transcripts: ${projectDir}`);
}

export function defaultPrompt(question = "") {
  const userQuestion = question.trim() || "请完整描述这张图片，并提取所有对当前任务有帮助的信息。";
  return `你是给无法直接看图的代码/研究助手使用的视觉理解工具。请用中文 Markdown 输出，避免空泛描述。

请按以下结构回答：
- 一句话概览
- 关键可见元素
- OCR/可读文字
- 布局、位置关系、颜色和图形关系
- 与用户问题直接相关的结论
- 不确定性或需要更高分辨率确认的地方

用户问题：${userQuestion}`;
}

export function buildRequestPayload({
  imageUrl,
  question,
  detail,
  model,
  maxTokens,
  temperature,
}) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: imageUrl,
              detail,
            },
          },
          {
            type: "text",
            text: defaultPrompt(question),
          },
        ],
      },
    ],
    max_tokens: maxTokens,
    temperature,
  };
}

function parseNumber(value, label) {
  if (value === "") throw new Error(`${label} must be a number.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a number.`);
  return parsed;
}

export function parseArgs(argv, env = process.env) {
  const options = {
    baseUrl: env.SILICONFLOW_BASE_URL || DEFAULT_BASE_URL,
    detail: env.SF_VISION_DETAIL || "high",
    model: env.SF_VISION_MODEL || DEFAULT_MODEL,
    maxTokens: parseNumber(env.SF_VISION_MAX_TOKENS || "1600", "SF_VISION_MAX_TOKENS"),
    temperature: parseNumber(env.SF_VISION_TEMPERATURE || "0.1", "SF_VISION_TEMPERATURE"),
    rawJson: false,
    latestClaudeImage: false,
    help: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--latest-claude-image") {
      options.latestClaudeImage = true;
    } else if (arg === "--raw-json") {
      options.rawJson = true;
    } else if (arg === "--model") {
      options.model = argv[++index] || "";
    } else if (arg === "--detail") {
      options.detail = argv[++index] || "";
    } else if (arg === "--max-tokens") {
      options.maxTokens = parseNumber(argv[++index] || "", "--max-tokens");
    } else if (arg === "--temperature") {
      options.temperature = parseNumber(argv[++index] || "", "--temperature");
    } else if (arg === "--base-url") {
      options.baseUrl = argv[++index] || "";
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!["low", "high", "auto"].includes(options.detail)) {
    throw new Error('--detail must be one of "low", "high", or "auto".');
  }
  if (!options.model) throw new Error("Model cannot be empty.");
  if (!options.baseUrl) throw new Error("Base URL cannot be empty.");
  if (!Number.isInteger(options.maxTokens) || options.maxTokens < 1) {
    throw new Error("--max-tokens must be a positive integer.");
  }
  if (options.temperature < 0 || options.temperature > 2) {
    throw new Error("--temperature must be between 0 and 2.");
  }

  return {
    ...options,
    imageRef: options.latestClaudeImage ? "" : positional[0] || "",
    question: (options.latestClaudeImage ? positional : positional.slice(1)).join(" "),
  };
}

function usage() {
  return `SiliconFlow Vision for Claude Code

Usage:
  sf-vision <image-path-or-url> [question]
  sf-vision --detail low ./screenshot.png "提取页面中的错误信息"
  sf-vision --latest-claude-image "分析刚上传的图片"

Required environment:
  SILICONFLOW_API_KEY     SiliconFlow API key. SF_API_KEY is also accepted.

Optional environment:
  SILICONFLOW_BASE_URL    Default: ${DEFAULT_BASE_URL}
  SF_VISION_MODEL         Default: ${DEFAULT_MODEL}
  SF_VISION_DETAIL        low | high | auto. Default: high
  SF_VISION_MAX_TOKENS    Default: 1600
  SF_VISION_TEMPERATURE   Default: 0.1

Options:
  --model <name>          Override the model for one call.
  --detail <value>        low | high | auto.
  --max-tokens <number>   Maximum output tokens.
  --temperature <number>  Sampling temperature, 0-2.
  --base-url <url>        OpenAI-compatible base URL.
  --latest-claude-image   Read the latest uploaded image from Claude Code project JSONL.
  --raw-json              Print the full API JSON response.
  -h, --help              Show this help.
`;
}

function completionUrl(baseUrl) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export function formatApiError(status, message) {
  if (status === 401) {
    return `SiliconFlow API key was found, but SiliconFlow rejected it (401): ${message}
Replace the key in ${DEFAULT_PRIVATE_ENV_PATH}, or set a valid SILICONFLOW_API_KEY.`;
  }
  if (status === 403) {
    return `SiliconFlow rejected this request (403): ${message}
Check whether the API key has permission to use model ${DEFAULT_MODEL}.`;
  }
  return `SiliconFlow API error ${status}: ${message}`;
}

async function callSiliconFlow({ apiKey, baseUrl, payload }) {
  if (typeof fetch !== "function") {
    throw new Error("This script requires Node.js 18+ because it uses global fetch().");
  }

  const response = await fetch(completionUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok) {
    const message = json?.error?.message || text || response.statusText;
    throw new Error(formatApiError(response.status, message));
  }
  if (!json) throw new Error(`SiliconFlow returned non-JSON response: ${text.slice(0, 500)}`);
  return json;
}

function extractAssistantText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  return JSON.stringify(json, null, 2);
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let options;
  try {
    options = parseArgs(argv, env);
  } catch (error) {
    console.error(error.message);
    console.error("");
    console.error(usage());
    return 2;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.imageRef && !options.latestClaudeImage) {
    console.error("Missing image path or URL.");
    console.error("");
    console.error(usage());
    return 2;
  }

  const apiKey = getConfiguredApiKey(env, env.SF_VISION_ENV_FILE || DEFAULT_PRIVATE_ENV_PATH);
  if (!apiKey) {
    console.error(
      `Missing SiliconFlow API key. Set SILICONFLOW_API_KEY or SF_API_KEY, or create ${DEFAULT_PRIVATE_ENV_PATH}.`,
    );
    return 2;
  }

  try {
    const imageUrl = options.latestClaudeImage
      ? findLatestClaudeImageDataUrl({ cwd: process.cwd() })
      : resolveImageUrl(options.imageRef);
    const payload = buildRequestPayload({
      imageUrl,
      question: options.question,
      detail: options.detail,
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
    });
    const json = await callSiliconFlow({
      apiKey,
      baseUrl: options.baseUrl,
      payload,
    });

    if (options.rawJson) {
      console.log(JSON.stringify(json, null, 2));
    } else {
      console.log(extractAssistantText(json));
    }
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const exitCode = await main();
  process.exitCode = exitCode;
}
