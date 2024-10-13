// @ts-expect-error no types for this package
import input from "input";
import dotenv from "dotenv";
import { BaseMtProto } from "./base-mtproto";
import { Context } from "../../../../../types";
import { logger } from "../../../../../utils/logger";
import { GithubStorage } from "../../../../../adapters/github/storage-layer";
import { Octokit } from "@octokit/rest";
dotenv.config();

/**
 * The account holder must run this script (to my knowledge only once) to login,
 * this will give us the necessary session information to login in the future.
 */
export class AuthHandler {
  private _github: GithubStorage | undefined;
  private _env = {
    TELEGRAM_API_HASH: null,
    TELEGRAM_APP_ID: 0,
    TELEGRAM_BOT_TOKEN: null,
  } as {
    TELEGRAM_API_HASH: string | null;
    TELEGRAM_APP_ID: number;
    TELEGRAM_BOT_TOKEN: string | null;
  };

  constructor() {
    const env = process.env.TELEGRAM_BOT_ENV;
    if (!env) {
      throw new Error("Have you ran the setup script? Try running 'yarn setup-env' first.");
    }

    const key = process.env.REPO_ADMIN_ACCESS_TOKEN;

    if (!key) {
      throw new Error("Missing Github PAT token.");
    }

    const owner = process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME?.split("/")[0];

    if (!owner) {
      throw new Error("Missing TELEGRAM_BOT_REPOSITORY_FULL_NAME");
    }

    this._github = new GithubStorage(
      {
        octokit: new Octokit({ auth: key }),
      } as unknown as Context,
      {
        storageOwner: owner,
        isEnvSetup: true,
      }
    );

    const parsedEnv: Context["env"]["TELEGRAM_BOT_ENV"] = JSON.parse(env);
    if (!parsedEnv) {
      throw new Error("Failed to parse environment variables for Telegram Bot");
    }

    const { botSettings, mtProtoSettings } = parsedEnv;

    if (!botSettings || !mtProtoSettings) {
      throw new Error("Missing required environment variables for Telegram Bot settings");
    }

    const { TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_WEBHOOK } = botSettings;
    const { TELEGRAM_APP_ID, TELEGRAM_API_HASH } = mtProtoSettings;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_BOT_WEBHOOK) {
      throw new Error("Missing required environment variables for Telegram Bot settings");
    }

    if (!TELEGRAM_APP_ID || !TELEGRAM_API_HASH) {
      throw new Error("Missing required environment variables for MtProto settings");
    }

    this._env = {
      TELEGRAM_API_HASH,
      TELEGRAM_APP_ID,
      TELEGRAM_BOT_TOKEN,
    };
  }

  /**
   * You should only need to run this once.
   *
   * You will be prompted in your terminal to enter the following:
   * - Phone number
   * - Code received
   * - Password (if required)
   *
   * In that order and the code will be sent to a Telegram instance
   * which the associated phone number is logged in.
   *
   * The session data will be saved to GitHub plugin storage for future use.
   */
  async smsLogin() {
    const env = process.env.TELEGRAM_BOT_ENV;
    if (!env) {
      throw new Error("Have you ran the setup script? Try running 'yarn setup-env' first.");
    }

    const key = process.env.REPO_ADMIN_ACCESS_TOKEN;

    if (!key) {
      throw new Error("Missing Github PAT token.");
    }

    const owner = process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME?.split("/")[0];

    if (!owner) {
      throw new Error("Missing TELEGRAM_BOT_REPOSITORY_FULL_NAME");
    }

    this._github = new GithubStorage(
      {
        octokit: new Octokit({ auth: key }),
      } as unknown as Context,
      {
        storageOwner: owner,
        isEnvSetup: true,
      }
    );

    const mtProto = new BaseMtProto();

    if (this._env.TELEGRAM_API_HASH === null) {
      throw new Error("Missing required environment variables for Telegram API");
    }

    if (this._env.TELEGRAM_APP_ID === 0) {
      throw new Error("Missing required environment variables for Telegram API");
    }

    if (this._env.TELEGRAM_BOT_TOKEN === null) {
      throw new Error("Missing required environment variables for Telegram API");
    }

    const envObj = {
      TELEGRAM_API_HASH: this._env.TELEGRAM_API_HASH,
      TELEGRAM_APP_ID: this._env.TELEGRAM_APP_ID,
      TELEGRAM_BOT_TOKEN: this._env.TELEGRAM_BOT_TOKEN,
    };

    await mtProto.initialize(envObj);
    try {
      await mtProto.client?.start({
        phoneNumber: async () => await input.password("Enter your phone number:"),
        password: async () => await input.password("Enter your password if required:"),
        phoneCode: async () => await input.text("Enter the code you received:"),
        onError: (err: unknown) => console.error("Error during login:", { err }),
      });

      if (!mtProto.session) {
        throw new Error("Failed to get session data.");
      }

      const didSave = await this._github.handleSession(mtProto.session.save(), "create");

      if (!didSave) {
        throw new Error("Failed to save session data to GitHub.");
      }

      logger.ok("Successfully logged in and saved session data. You can now run the bot.");
      process.exit(0);
    } catch (err) {
      logger.error("Failed to log in:", { err });
    }
  }
}
