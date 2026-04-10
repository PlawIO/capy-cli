import { defineCommand } from "citty";
import { modelArgs, jsonArg, resolveModel } from "./_shared.js";

export const captain = defineCommand({
  meta: { name: "captain", description: "Start Captain thread", alias: "plan" },
  args: {
    prompt: { type: "positional", description: "Task prompt", required: true },
    ...modelArgs,
    ...jsonArg,
  },
  async run({ args }) {
    const api = await import("../api.js");
    const config = await import("../config.js");
    const { out, IS_JSON } = await import("../output.js");
    const { log } = await import("@clack/prompts");

    const cfg = config.load();
    const model = resolveModel(args) || cfg.defaultModel;
    const data = await api.createThread(args.prompt, model);

    if (IS_JSON) { out(data); return; }
    log.success(`Captain started: https://capy.ai/project/${cfg.projectId}/captain/${data.id}`);
    log.info(`Thread: ${data.id}  Model: ${model}`);
  },
});

export const build = defineCommand({
  meta: { name: "build", description: "Start Build agent (isolated)", alias: "run" },
  args: {
    prompt: { type: "positional", description: "Task prompt", required: true },
    ...modelArgs,
    ...jsonArg,
  },
  async run({ args }) {
    const api = await import("../api.js");
    const config = await import("../config.js");
    const { out, IS_JSON } = await import("../output.js");
    const { log } = await import("@clack/prompts");

    const cfg = config.load();
    const model = resolveModel(args) || cfg.defaultModel;
    const data = await api.createTask(args.prompt, model);

    if (IS_JSON) { out(data); return; }
    log.success(`Build started: https://capy.ai/project/${cfg.projectId}/tasks/${data.id}`);
    log.info(`ID: ${data.identifier}  Model: ${model}`);
  },
});
