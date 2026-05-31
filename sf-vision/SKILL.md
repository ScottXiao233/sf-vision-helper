---
name: sf-vision
description: Use when Claude Code or a non-vision model such as DeepSeek needs to understand images, screenshots, UI captures, charts, plots, scanned documents, paper figures, photos, OCR content, layout, visual relationships, or any local/remote image file.
allowed-tools: Bash(node *)
---

# SiliconFlow Vision

Use the bundled helper to ask SiliconFlow's vision model what is in an image, then use the result as visual context for the current task.

Invoke directly as `/sf-vision <image-path-or-url> [question]`, or run:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/sf-vision.mjs" "<image-path-or-url>" "<question>"
```

When invoked from Claude Code with an uploaded image but no explicit image path, use the latest image attachment from the current Claude project transcript:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/sf-vision.mjs" --latest-claude-image "$ARGUMENTS"
```

Quote paths and questions. Never let user-provided text become shell syntax.

## Configuration

Set one API key environment variable before use:

```bash
export SILICONFLOW_API_KEY="..."
```

`SF_API_KEY` is also accepted. The default model is `Qwen/Qwen3-VL-8B-Instruct`.

Optional overrides:

- `SF_VISION_MODEL`: model name, default `Qwen/Qwen3-VL-8B-Instruct`
- `SILICONFLOW_BASE_URL`: OpenAI-compatible base URL, default `https://api.siliconflow.cn/v1`
- `SF_VISION_DETAIL`: `high`, `low`, or `auto`, default `high`
- `SF_VISION_MAX_TOKENS`: default `1600`
- `SF_VISION_TEMPERATURE`: default `0.1`

Per-call overrides:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/sf-vision.mjs" --latest-claude-image "图片中讲了什么"
node "${CLAUDE_SKILL_DIR}/scripts/sf-vision.mjs" --detail high --max-tokens 2000 "./figure.png" "解释图中的实验结论"
node "${CLAUDE_SKILL_DIR}/scripts/sf-vision.mjs" --model "Qwen/Qwen3-VL-8B-Instruct" "https://example.com/image.png" "提取文字"
```

## Workflow

1. Run the helper whenever image content matters to the answer or code change.
2. If the user uploaded an image and did not provide a file path or URL, run the helper with `--latest-claude-image "$ARGUMENTS"` instead of searching random filesystem locations.
3. Ask a task-specific question when possible: OCR, chart interpretation, UI layout, error screenshot, figure conclusion, object identification, or spatial relationship.
4. Treat the output as model-derived visual evidence. Preserve uncertainty instead of inventing details.
5. If the output says resolution is insufficient, ask for a clearer image or rerun with `--detail high`.
6. If the helper returns `401` or `Api key is invalid`, say the key was found but rejected by SiliconFlow. Do not reinterpret that as a missing environment variable.

## Supported Inputs

- Local files: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`
- Remote `http://` or `https://` image URLs
- Existing `data:image/...;base64,...` URLs
- Latest uploaded image in the current Claude Code project transcript via `--latest-claude-image`

Local files are converted to base64 data URLs inside the script. The API key is read only from the environment and is never written to disk.

## Output

By default, the helper prints Markdown in Chinese with:

- one-sentence overview
- key visible elements
- OCR/readable text
- layout, position, color, and graphical relationships
- conclusions relevant to the question
- uncertainty or parts that need higher resolution

Use `--raw-json` only when debugging API responses.
