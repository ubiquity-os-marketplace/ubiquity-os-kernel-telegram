import { Env, PluginInputs } from "./types";
import { Context } from "./types";
import { PluginContext } from "./types/plugin-context-single";
import { proxyCallbacks } from "./handlers/worker-proxy";
import { bubbleUpErrorComment } from "./utils/errors";

export async function runPlugin(context: Context) {
  const { eventName } = context;

  try {
    return proxyCallbacks(context)[eventName];
  } catch (err) {
    return bubbleUpErrorComment(context, err);
  }
}

export async function plugin(inputs: PluginInputs, env: Env) {
  const context = PluginContext.initialize(inputs, env);
  return await runPlugin(context);
}
