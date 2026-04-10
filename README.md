# capy-cli

Agent orchestrator with quality gates for [Capy.ai](https://capy.ai). Zero dependencies.

Works with Claude Code, Codex, OpenClaw, or any AI agent that can run shell commands.

## Install

```bash
npm i -g capy-cli
capy init
```

Or set env vars directly:

```bash
export CAPY_API_KEY=capy_...
export CAPY_PROJECT_ID=...
```

## Usage

```bash
# Start work
capy captain "Implement feature X. Files: src/foo.ts. Tests required."
capy build "Fix typo in README"

# Monitor
capy status
capy watch <thread-id>

# Review + approve
capy review <task-id>
capy approve <task-id>
capy retry <task-id> --fix="fix the failing test"
```

Every command supports `--json` for machine-readable output.

## Quality Gates

`capy review` checks pass/fail gates:

| Gate | What it checks |
|------|---------------|
| `pr_exists` | PR was created |
| `pr_open` | PR is open or merged |
| `ci` | CI checks passing |
| `greptile` | No unaddressed Greptile issues |
| `greptile_check` | Greptile GitHub status check |
| `threads` | No unresolved review threads |
| `tests` | Diff includes test files |

Configure which gates run via `capy config quality.reviewProvider greptile|capy|both|none`.

## For Agents

```bash
capy review TASK-1 --json   # parse quality.pass boolean
capy status --json           # full state dump
```

## Config

```bash
capy config defaultModel gpt-5.4
capy config quality.reviewProvider both
capy config notifyCommand "notify-send {text}"
```

Env vars: `CAPY_API_KEY`, `CAPY_PROJECT_ID`, `CAPY_SERVER`, `CAPY_ENV_FILE`, `GREPTILE_API_KEY`.

## Requirements

[Bun](https://bun.sh) runtime. GitHub CLI (`gh`) for quality gate checks.

## License

MIT
