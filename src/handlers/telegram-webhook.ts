import { Env } from "../types";
import { TelegramBotSingleton } from "../types/telegram-bot-single";
import { logger } from "../utils/logger";

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  let server;
  try {
    server = (await TelegramBotSingleton.initialize(env)).getServer();
  } catch (er) {
    logger.error("Error initializing TelegramBotSingleton", { er });
    return new Response("Error initializing TelegramBotSingleton", { status: 500, statusText: "Internal Server Error" });
  }

  try {
    return server.fetch(request, env);
  } catch (er) {
    logger.error("Error fetching request from hono server", { er });
    return new Response("Error fetching request from hono server", { status: 500, statusText: "Internal Server Error" });
  }
}
