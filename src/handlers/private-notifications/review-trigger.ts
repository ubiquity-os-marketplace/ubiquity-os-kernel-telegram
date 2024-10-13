import { Context, SupportedEvents } from "../../types";
import { CallbackResult } from "../../types/proxy";
import { TelegramBotSingleton } from "../../types/telegram-bot-single";
import { logger } from "../../utils/logger";

export async function reviewNotification(
  context: Context<"pull_request.review_requested", SupportedEvents["pull_request.review_requested"]>
): Promise<CallbackResult> {
  const {
    adapters: { github },
    payload,
    logger,
  } = context;

  const users = await github.retrieveStorageDataObject("userBase", false);

  if (!users) {
    logger.error("No users found in the database.");
    return { status: 500, reason: "No users found in the database." };
  }

  const requestedReviewer = payload.requested_reviewer?.login;

  if (!requestedReviewer) {
    throw new Error("No user found in the payload");
  }

  const dbUser = Object.values(users).find((user) => user.githubUsername.toLowerCase() === requestedReviewer.toLowerCase());

  if (!dbUser) {
    throw new Error("User not found in the database");
  }

  const ownerRepo = payload.repository.full_name;
  const issueNumber = payload.pull_request.number;

  if (!dbUser.listeningTo.length) {
    return { status: 200, reason: "skipped" };
  }

  // skip if they've requested review from themselves
  if (payload.sender.login === requestedReviewer) {
    return { status: 200, reason: "skipped" };
  }

  if (dbUser.listeningTo.includes("review")) {
    await handleReviewNotification(dbUser.githubUsername, dbUser.telegramId, ownerRepo, issueNumber, context);
  } else {
    return { status: 200, reason: "skipped" };
  }

  return { status: 200, reason: "success" };
}

async function handleReviewNotification(
  username: string,
  telegramId: number,
  ownerRepo: string,
  issueNumber: number,
  context: Context<"pull_request.review_requested", SupportedEvents["pull_request.review_requested"]>
) {
  const prAuthor = context.payload.pull_request.user?.login;
  const message = `<b>Hello ${username.charAt(0).toUpperCase() + username.slice(1)}</b>,

${prAuthor} has requested a review from you on <a href="${context.payload.pull_request.html_url}">${ownerRepo}#${issueNumber}</a>.`;

  let userPrivateChat;

  let bot;
  try {
    bot = (await TelegramBotSingleton.initialize(context.env)).getBot();
  } catch (er) {
    logger.error(`Error getting bot instance`, { er });
  }

  if (!bot) {
    throw new Error("Bot instance not found");
  }

  try {
    userPrivateChat = await bot?.api.getChat(telegramId);
  } catch (er) {
    logger.error(`Error getting chat for ${telegramId}`, { er });
  }

  if (!userPrivateChat) {
    logger.error(`This user has not started a chat with the bot yet`, { telegramId });
    return;
  }

  try {
    await bot?.api.sendMessage(telegramId, message, { parse_mode: "HTML" });
  } catch (er) {
    logger.error(`Error sending message to ${telegramId} `, { er });
  }
}
