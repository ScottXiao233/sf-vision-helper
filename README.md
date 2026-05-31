# sf-vision-helper

Claude Code skill and hooks that let a non-vision model such as DeepSeek inspect images through SiliconFlow's OpenAI-compatible vision API.

The default model is `Qwen/Qwen3-VL-8B-Instruct`, and the default API base URL is `https://api.siliconflow.cn/v1`.

## What It Does

- Adds a Claude Code skill named `sf-vision`.
- Sends local images, remote image URLs, or the latest uploaded Claude Code image attachment to SiliconFlow.
- Supports screenshots, charts, plots, scanned documents, paper figures, UI captures, OCR tasks, and photos.
- Adds optional Claude Code hooks that nudge the model to call the helper automatically when a prompt appears to involve visual content.
- Reads API keys from environment variables or a private local file outside the repository.

## Repository Layout

```text
sf-vision-helper/
├── sf-vision/
│   ├── SKILL.md
│   ├── agents/openai.yaml
│   └── scripts/
│       ├── sf-vision.mjs
│       └── sf-vision.test.mjs
├── hooks/
│   ├── sf-vision-autohint.mjs
│   └── sf-vision-session-env.sh
├── scripts/
│   ├── install.mjs
│   └── uninstall.mjs
└── README.md
```

## Requirements

- macOS or Linux with Claude Code.
- Node.js 18 or newer.
- A SiliconFlow API key from `cloud.siliconflow.cn`.
- Network access to `https://api.siliconflow.cn`.

## Install

From this repository:

```bash
node scripts/install.mjs
```

The installer copies:

- `sf-vision/` to `~/.claude/skills/sf-vision`
- `hooks/` to `~/.claude/hooks`
- hook entries into `~/.claude/settings.json`

Then configure the API key:

```bash
mkdir -p "$HOME/.claude/private"
chmod 700 "$HOME/.claude/private"
printf 'export SILICONFLOW_API_KEY="%s"\n' "YOUR_SILICONFLOW_KEY" > "$HOME/.claude/private/sf-vision.env"
chmod 600 "$HOME/.claude/private/sf-vision.env"
```

Restart Claude Code Desktop, or run `/reload-skills` in an existing Code session.

## Usage

Explicit skill invocation:

```text
/sf-vision ./image.png 解释这张图
```

Direct script usage:

```bash
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" ./image.png "解释这张图"
```

Use the latest image uploaded into the current Claude Code project transcript:

```bash
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" --latest-claude-image "图片中讲了什么"
```

Remote URL:

```bash
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" "https://example.com/image.png" "提取文字"
```

Dense screenshots or charts:

```bash
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" --detail high ./screenshot.png "找出报错原因"
```

## Automatic Image Hint

The `UserPromptSubmit` hook adds a hidden hint to each user turn. If the prompt or attachment appears to involve visual content, it asks the model to run:

```bash
node "$HOME/.claude/skills/sf-vision/scripts/sf-vision.mjs" --latest-claude-image "<the user's visual question>"
```

This is best-effort automation. Claude Code hooks can nudge the model, but they are not a hard system-level image interceptor. If the model does not call the helper automatically, use `/sf-vision` explicitly.

## Configuration

Supported environment variables:

```text
SILICONFLOW_API_KEY     SiliconFlow API key. Preferred.
SF_API_KEY              Alternative API key variable.
SILICONFLOW_BASE_URL    Default: https://api.siliconflow.cn/v1
SF_VISION_MODEL         Default: Qwen/Qwen3-VL-8B-Instruct
SF_VISION_DETAIL        high | low | auto. Default: high
SF_VISION_MAX_TOKENS    Default: 1600
SF_VISION_TEMPERATURE   Default: 0.1
SF_VISION_ENV_FILE      Override private key file path.
```

The helper also reads:

```text
~/.claude/private/sf-vision.env
```

This private file is intentionally outside the repository.

## Security Notes

- Do not commit API keys.
- Do not put API keys in `SKILL.md`, `README.md`, hook files, shell history screenshots, or issue comments.
- Keep `~/.claude/private/sf-vision.env` mode `600`.
- Uploaded Claude Code images can be embedded in `~/.claude/projects/.../*.jsonl`; this helper can read the latest image from those transcripts with `--latest-claude-image`.
- Image content is sent to SiliconFlow for processing. Do not use this on sensitive images unless that is acceptable for your threat model and data policy.
- A `401 Api key is invalid` error usually means the key is wrong, expired, copied incorrectly, or being sent to the wrong SiliconFlow endpoint. This project defaults to the China endpoint, `https://api.siliconflow.cn/v1`.
- A `403` error usually means the key lacks permission or quota for the selected model.
- Public repositories should not include local Claude transcripts, `.claude/`, `.env`, or private key files.

## Claude Code Desktop Notes

Claude Code Code mode and Cowork mode may load skills from different places. This repository targets standard Claude Code skill installation under `~/.claude/skills`. Cowork-specific skill plugin registration may need extra manual integration depending on the Claude Desktop build.

If you use Code mode, the installer and `/reload-skills` are usually enough.

If you use Cowork mode, verify that `sf-vision` appears in the `/` menu. If it does not, install it through the Cowork skill/plugin flow or copy the skill into Cowork's active skills plugin directory.

## Test

```bash
npm test
```

No npm dependencies are required. The test suite uses Node's built-in test runner.

## Uninstall

Remove the skill and hooks but keep the private key file:

```bash
node scripts/uninstall.mjs
```

Remove the private key file too:

```bash
node scripts/uninstall.mjs --remove-key
```

Restart Claude Code Desktop after uninstalling.

## Troubleshooting

`Missing SiliconFlow API key`

Create `~/.claude/private/sf-vision.env` and put `export SILICONFLOW_API_KEY="..."` inside it.

`Api key is invalid`

Check that the key is copied from the SiliconFlow API key page, not from a masked table row. The visible masked key such as `sk-b********gknn` is not the full secret.

`No image attachment found in Claude project transcripts`

Use an explicit local file path or URL. The `--latest-claude-image` mode only works when Claude Code stored the upload in the current project's JSONL transcript.

The model still asks me to run `/sf-vision`

The automatic hook is a hint, not a forced router. Use `/sf-vision` explicitly as a fallback.

## License

MIT
