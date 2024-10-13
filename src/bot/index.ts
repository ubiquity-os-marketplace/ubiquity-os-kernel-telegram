import type { BotConfig, StorageAdapter } from "grammy";
import { Bot as TelegramBot } from "grammy";
import { Context as UbiquityOsContext } from "../types";
import { autoChatAction } from "@grammyjs/auto-chat-action";
import { hydrate } from "@grammyjs/hydrate";
import { hydrateReply, parseMode } from "@grammyjs/parse-mode";
import { adminFeature } from "./features/admin/admin";
import { userIdFeature } from "./features/commands/private-chat/user-id";
import { chatIdFeature } from "./features/commands/shared/chat-id";
import { botIdFeature } from "./features/commands/private-chat/bot-id";
import { banCommand } from "./features/commands/groups/ban";
import { setWebhookFeature } from "./features/admin/set-webhook";
import { Logger } from "../utils/logger";
import { createContextConstructor, GrammyContext, SessionData } from "./helpers/grammy-context";
import { errorHandler } from "./handlers/error";
import { session } from "./middlewares/session";
import { welcomeFeature } from "./features/start-command";
import { unhandledFeature } from "./features/helpers/unhandled";
import { registerFeature } from "./features/commands/private-chat/register";
import { notifySubscribeFeature } from "./features/commands/private-chat/notify-subscribe";
import { walletFeature } from "./features/commands/private-chat/wallet";

interface Dependencies {
  config: UbiquityOsContext["env"];
  logger: Logger;
}

interface Options {
  botSessionStorage?: StorageAdapter<SessionData>;
  botConfig?: Omit<BotConfig<GrammyContext>, "ContextConstructor">;
}

function getSessionKey(ctx: Omit<GrammyContext, "session">) {
  return ctx.chat?.id.toString();
}

export function createBot(token: string, dependencies: Dependencies, options: Options = {}) {
  const { config, logger } = dependencies;

  const bot = new TelegramBot(token, {
    ...options.botConfig,
    ContextConstructor: createContextConstructor({
      logger,
      config,
    }),
  });
  const protectedBot = bot.errorBoundary(errorHandler);

  bot.api.config.use(parseMode("HTML"));

  protectedBot.use(autoChatAction(bot.api));
  protectedBot.use(hydrateReply);
  protectedBot.use(hydrate());
  protectedBot.use(session({ getSessionKey, storage: options.botSessionStorage }));

  // the `/start` command for a traditional TG bot, doubt we need this as-is
  // but a variation of can be built for various scenarios.
  protectedBot.use(welcomeFeature);

  // admin commands
  protectedBot.use(adminFeature);
  protectedBot.use(setWebhookFeature);

  // development commands
  protectedBot.use(userIdFeature);
  protectedBot.use(chatIdFeature);
  protectedBot.use(botIdFeature);

  // Private chat commands
  protectedBot.use(registerFeature); // /register <GitHub username>
  protectedBot.use(notifySubscribeFeature); // /subscribe
  protectedBot.use(walletFeature); // /wallet <wallet address>

  // group commands
  protectedBot.use(banCommand);

  // unhandled command handler
  protectedBot.use(unhandledFeature);

  return bot;
}

export type Bot = ReturnType<typeof createBot>;
