import { Context, SupportedEvents } from "../../types";
import { CallbackResult } from "../../types/proxy";
import { TelegramBotSingleton } from "../../types/telegram-bot-single";
import { logger } from "../../utils/logger";

export async function disqualificationNotification(context: Context<"issues.unassigned", SupportedEvents["issues.unassigned"]>): Promise<CallbackResult> {
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

  const unassignedUser = payload.assignee?.login;

  if (!unassignedUser) {
    throw new Error("No user found in the payload");
  }

  const dbUser = Object.values(users).find((user) => user.githubUsername.toLowerCase() === unassignedUser.toLowerCase());

  if (!dbUser) {
    throw new Error("User not found in the database");
  }

  const ownerRepo = payload.repository.full_name;
  const issueNumber = payload.issue.number;

  if (!dbUser.listeningTo.length) {
    return { status: 200, reason: "skipped" };
  }

  // skip if they've unassigned themselves
  if (payload.sender.login === unassignedUser) {
    return { status: 200, reason: "skipped" };
  }

  if (dbUser.listeningTo.includes("disqualification")) {
    await handleDisqualificationNotification(dbUser.githubUsername, dbUser.telegramId, ownerRepo, issueNumber, context);
  } else {
    return { status: 200, reason: "skipped" };
  }

  return { status: 200, reason: "success" };
}

async function handleDisqualificationNotification(
  username: string,
  telegramId: number,
  ownerRepo: string,
  issueNumber: number,
  context: Context<"issues.unassigned", SupportedEvents["issues.unassigned"]>
) {
  const message = `<b>Hello ${username.charAt(0).toUpperCase() + username.slice(1)}</b>,

You have been disqualified from <a href="${context.payload.issue.html_url}">${ownerRepo}#${issueNumber}</a>.

You will not be able to self-assign this task again.
`;

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
    logger.error(`Error sending message to ${telegramId}`, { er });
  }
}
