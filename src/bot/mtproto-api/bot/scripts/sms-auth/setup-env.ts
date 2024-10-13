// @ts-expect-error no types
import input from "input";
// @ts-expect-error no types
import sodium from "libsodium-wrappers";
import { Context } from "../../../../../types";
import { exit } from "node:process";
import { Octokit } from "@octokit/rest";
import dotenv from "dotenv";
import { appendFile, writeFile } from "node:fs/promises";
import { logger } from "../../../../../utils/logger";
dotenv.config();
/**
 * This script is used to help guide the user through setting up the environment variables.
 *
 * The user will be prompted to enter the required environment variables, they'll be stored
 * automatically in the `.env` and `.dev.vars` files.
 */

class SetUpHandler {
  private _env = {
    REPO_ADMIN_ACCESS_TOKEN: null,
    TELEGRAM_BOT_ENV: {
      botSettings: {
        TELEGRAM_BOT_ADMINS: [],
        TELEGRAM_BOT_TOKEN: null,
        TELEGRAM_BOT_WEBHOOK: null,
        TELEGRAM_BOT_WEBHOOK_SECRET: null,
      },
      mtProtoSettings: {
        TELEGRAM_API_HASH: null,
        TELEGRAM_APP_ID: 0,
      },
    },
  } as unknown as Context["env"];

  get env() {
    return this._env;
  }

  set env(env: Context["env"]) {
    this._env = env;
  }

  steps = [
    {
      title: "Repository settings",
      questions: [
        {
          type: "input",
          name: "TELEGRAM_BOT_REPOSITORY_FULL_NAME",
          message: "Enter your repository name (owner/repo). Need to store your secrets in your repository.",
        },
      ],
    },
    {
      title: "Secret upload",
      questions: [
        {
          type: "input",
          name: "REPO_ADMIN_ACCESS_TOKEN",
          message:
            "Enter your GitHub PAT token.\n    This is used to store secrets in your repository so it should have the 'repo' scope and be an admin of the repository.",
        },
      ],
    },
    {
      title: "Bot settings",
      questions: [
        {
          type: "input",
          name: "TELEGRAM_BOT_TOKEN",
          message: "Enter your Telegram bot token. This can be obtained from @BotFather",
        },
        {
          type: "input",
          name: "TELEGRAM_BOT_WEBHOOK",
          message: "Any URL (except smee.io) used should end with '/telegram'. e.g 'https://example.com/telegram'",
        },
        {
          type: "input",
          name: "TELEGRAM_BOT_WEBHOOK_SECRET",
          message: "Enter your Telegram bot webhook secret. Random 12 char-min e.g '123456123456'",
        },
        {
          type: "input",
          name: "TELEGRAM_BOT_ADMINS",
          message: "Enter your Telegram bot admin IDs separated with commas. '123456789,987654321'",
        },
      ],
    },
    {
      title: "MTProto settings",
      questions: [
        {
          type: "input",
          name: "TELEGRAM_API_HASH",
          message: "Enter your Telegram API hash. This can be obtained from 'https://my.telegram.org'",
        },
        {
          type: "input",
          name: "TELEGRAM_APP_ID",
          message: "Enter your Telegram app id. This can be obtained from 'https://my.telegram.org'",
        },
      ],
    },
    {
      title: "Storage settings",
      questions: [
        {
          type: "input",
          name: "STORAGE_APP_ID",
          message:
            "Enter your storage app id. This can be obtained from `https://github.com/settings/apps`\n\n This should be saved as an organization secret but we'll save it to the repo too.",
        },
        {
          type: "input",
          name: "STORAGE_APP_PRIVATE_KEY",
          message:
            "Enter your storage app private key. This can be obtained following the instructions in the README. \n\n This should be saved as an organization secret but we'll save it to the repo too.",
        },
      ],
    },
  ];

  shouldTestToken = !!process.env.REPO_ADMIN_ACCESS_TOKEN;
  hasSetRepository = !!process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME;

  async handleFirstTwo(question: { name: string; message: string }, answer: string) {
    if (question.name === "TELEGRAM_BOT_REPOSITORY_FULL_NAME") {
      if (!answer.includes("/")) {
        logger.error("Invalid repository name. Please enter in the format 'owner/repo'");
        process.exit(1);
      }
      await writeFile(".env", `TELEGRAM_BOT_REPOSITORY_FULL_NAME=${answer}`, "utf-8");
      logger.ok("Repository name saved successfully");
    }

    if (question.name === "REPO_ADMIN_ACCESS_TOKEN") {
      await appendFile(".env", `\nREPO_ADMIN_ACCESS_TOKEN=${answer}`, "utf-8");
      logger.ok("GitHub PAT token saved successfully, we must restart the script to continue.");
      process.exit(0);
    }
  }

  async run() {
    const answers: Record<string, Record<string, string>> = {};
    for (const step of this.steps) {
      const questions = step.questions;

      for (const question of questions) {
        await this.handleQuestions(answers, step, question);
      }
    }
    console.clear();

    this.env = {
      STORAGE_APP_ID: answers["Storage settings"]["STORAGE_APP_ID"],
      STORAGE_APP_PRIVATE_KEY: answers["Storage settings"]["STORAGE_APP_PRIVATE_KEY"],
      TELEGRAM_BOT_ENV: {
        botSettings: {
          TELEGRAM_BOT_ADMINS: JSON.parse(answers["Bot settings"]["TELEGRAM_BOT_ADMINS"]),
          TELEGRAM_BOT_TOKEN: answers["Bot settings"]["TELEGRAM_BOT_TOKEN"],
          TELEGRAM_BOT_WEBHOOK: answers["Bot settings"]["TELEGRAM_BOT_WEBHOOK"],
          TELEGRAM_BOT_WEBHOOK_SECRET: answers["Bot settings"]["TELEGRAM_BOT_WEBHOOK_SECRET"],
        },
        mtProtoSettings: {
          TELEGRAM_API_HASH: answers["MTProto settings"]["TELEGRAM_API_HASH"],
          TELEGRAM_APP_ID: Number(answers["MTProto settings"]["TELEGRAM_APP_ID"]),
        },
      },
    };

    await this.validateEnv();
  }

  async handleQuestions(
    answers: Record<string, Record<string, string>>,
    step: { title: string; questions: { type: string; name: string; message: string }[] },
    question: { name: string; message: string }
  ) {
    answers[step.title] ??= {};

    // Skip these as they are already set
    if (question.name === "TELEGRAM_BOT_REPOSITORY_FULL_NAME" && this.hasSetRepository) {
      answers[step.title][question.name] = process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME as string;
      return;
    }
    if (question.name === "REPO_ADMIN_ACCESS_TOKEN" && (await this.testAccessToken())) {
      answers[step.title][question.name] = process.env.REPO_ADMIN_ACCESS_TOKEN as string;
      return;
    }

    console.log(step.title);

    const passwords = [
      "STORAGE_APP_PRIVATE_KEY",
      "TELEGRAM_BOT_WEBHOOK_SECRET",
      "REPO_ADMIN_ACCESS_TOKEN",
      "TELEGRAM_API_HASH",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_APP_ID",
    ];
    let answer;

    if (passwords.includes(question.name)) {
      answer = await input.password(`  ${question.message}\n>  `);
    } else {
      answer = await input.text(`  ${question.message}\n>  `);
    }

    await this.handleFirstTwo(question, answer);

    if (question.name === "TELEGRAM_BOT_ADMINS") {
      answers[step.title][question.name] = JSON.stringify(answer.split(",").map((id: string) => Number(id)));
      return;
    }

    answers[step.title][question.name] = answer;
  }

  async validateEnv() {
    const { TELEGRAM_BOT_ENV, STORAGE_APP_PRIVATE_KEY, STORAGE_APP_ID } = this.env;
    const { botSettings, mtProtoSettings } = TELEGRAM_BOT_ENV;

    const merged = {
      ...botSettings,
      ...mtProtoSettings,
      STORAGE_APP_PRIVATE_KEY,
      STORAGE_APP_ID,
    };

    const keys = Object.keys(merged);

    const missing = [];

    for (const key_ of keys) {
      const key = key_ as keyof typeof merged;
      if (!merged[key]) {
        missing.push(key);
      }
    }

    if (missing.length) {
      console.log("Missing keys:", missing);
      await this.run();
    }
    await this.saveEnv();

    logger.ok("Env saved successfully");

    exit();
  }

  async saveEnv() {
    const paths = [".env", ".dev.vars"];

    const telegramBotEnv = `TELEGRAM_BOT_ENV=${JSON.stringify(this.env.TELEGRAM_BOT_ENV)}`;
    const repositoryEnv = `TELEGRAM_BOT_REPOSITORY_FULL_NAME=${process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME}`;
    const storageAppId = `STORAGE_APP_ID=${this.env.STORAGE_APP_ID}`;
    const storageAppPrivateKey = `STORAGE_APP_PRIVATE_KEY=${this.env.STORAGE_APP_PRIVATE_KEY}`;

    for (const path of paths) {
      const envVar = `${repositoryEnv}\n${telegramBotEnv}\n${storageAppId}\n${storageAppPrivateKey}`;
      await writeFile(path, envVar, "utf-8");
    }

    logger.ok("Local env files saved successfully");
    logger.info("Storing secrets in GitHub");
    await this.storeRepoSecrets();
  }

  getOwnerRepo() {
    if (!process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME) {
      logger.error("No repository found in environment variables");
      exit(1);
    }
    const [owner, repo] = process.env.TELEGRAM_BOT_REPOSITORY_FULL_NAME.split("/");
    return { owner, repo };
  }

  async testAccessToken() {
    if (!this.shouldTestToken) {
      return false;
    }
    const octokit = new Octokit({ auth: process.env.REPO_ADMIN_ACCESS_TOKEN });
    const secret = `{}`;

    try {
      const { owner, repo } = this.getOwnerRepo();
      const pubKey = await octokit.actions.getRepoPublicKey({
        owner,
        repo,
      });

      const key = pubKey.data.key;
      const encryptedSecret = await this.encryptSecret(secret, key);

      await octokit.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: "TELEGRAM_BOT_ENV",
        encrypted_value: encryptedSecret,
        key_id: pubKey.data.key_id,
      });

      return true;
    } catch (e) {
      logger.error("Error testing access token", { e });
      return false;
    }
  }

  async storeRepoSecrets() {
    const octokit = new Octokit({ auth: process.env.REPO_ADMIN_ACCESS_TOKEN });
    const secrets = {
      TELEGRAM_BOT_ENV: this.env.TELEGRAM_BOT_ENV,
      STORAGE_APP_ID: this.env.STORAGE_APP_ID,
      STORAGE_APP_PRIVATE_KEY: this.env.STORAGE_APP_PRIVATE_KEY,
    };

    try {
      for (const [key, value] of Object.entries(secrets)) {
        const { owner, repo } = this.getOwnerRepo();
        const pubKey = await octokit.actions.getRepoPublicKey({
          owner,
          repo,
        });

        const secret = typeof value === "object" ? JSON.stringify(value) : value;

        if (!secret) {
          throw new Error(`No secret found to save for key ${key}`);
        }

        const encryptedSecret = await this.encryptSecret(secret, pubKey.data.key);

        await octokit.actions.createOrUpdateRepoSecret({
          owner,
          repo,
          secret_name: key,
          encrypted_value: encryptedSecret,
          key_id: pubKey.data.key_id,
        });

        logger.ok(`Secret ${key} stored successfully`);
      }
    } catch (err) {
      logger.error("Error storing secret", { err });
    }
    exit();
  }

  async encryptSecret(secret: string, key: string /* Base64 */) {
    await sodium.ready;
    const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
    const binsec = sodium.from_string(secret);
    const encBytes = sodium.crypto_box_seal(binsec, binkey);
    return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
  }
}

async function guided() {
  const setup = new SetUpHandler();
  await setup.run();
}

guided().catch(console.error);
