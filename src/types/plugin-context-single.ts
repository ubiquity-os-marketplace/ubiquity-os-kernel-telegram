import { Value } from "@sinclair/typebox/value";
import { Logs } from "@ubiquity-dao/ubiquibot-logger";
import { createAdapters } from "../adapters";
import { PluginInputs } from "./plugin-inputs";
import { Env, envValidator } from "./env";
import { Context } from "./context";
import { App } from "octokit";
import { logger } from "../utils/logger";
import { Octokit } from "@octokit/rest";

/**
 * Singleton for the plugin context making accessing it throughout
 * the "two branches" of the codebase easier.
 *
 * This is used with both the worker and the workflows.
 */
export class PluginContext {
  private static _instance: PluginContext;

  private constructor(
    public readonly inputs: PluginInputs,
    public _env: Env
  ) {}

  get env() {
    return Value.Decode(envValidator.schema, Value.Default(envValidator.schema, this._env));
  }
  set env(env: Env) {
    this._env = env;
  }

  static initialize(inputs: PluginInputs, env: Env): Context {
    PluginContext._instance = new PluginContext(inputs, env);
    return PluginContext._instance.getContext();
  }

  static getInstance(): PluginContext {
    if (!PluginContext._instance) {
      throw new Error("PluginContext not initialized");
    }
    return PluginContext._instance;
  }

  getInputs(): PluginInputs {
    return this.inputs;
  }

  getStorageApp() {
    try {
      return new App({
        appId: this.env.STORAGE_APP_ID,
        privateKey: this.env.STORAGE_APP_PRIVATE_KEY,
      });
    } catch (er) {
      throw logger.error("Error initializing storage app", { er });
    }
  }

  getStdOctokit() {
    return new Octokit({ auth: this.inputs.authToken });
  }

  getContext(): Context {
    const octokit: Context["octokit"] = new Octokit({ auth: this.inputs.authToken });

    if (!octokit) {
      throw new Error("Octokit could not be initialized");
    }

    const ctx = {
      eventName: this.inputs.eventName,
      payload: this.inputs.eventPayload,
      config: this.inputs.settings,
      octokit,
      env: this.env,
      logger: new Logs("verbose"),
    } as Context;

    return {
      ...ctx,
      adapters: createAdapters(ctx),
    };
  }
}
