import { chatAction } from "@grammyjs/auto-chat-action";
import { Composer } from "grammy";
import { GrammyContext } from "../../../helpers/grammy-context";
import { logHandle } from "../../../helpers/logging";

const composer = new Composer<GrammyContext>();

const feature = composer.chatType("private");

/**
 * Pairs the user's Telegram ID with the user's GitHub ID.
 */
feature.command("wallet", logHandle("command-wallet"), chatAction("typing"), async (ctx) => {
  const userId = ctx.from?.id;
  const walletAddress = ctx.message?.text?.split(" ")[1];
  try {
    if (!walletAddress || walletAddress.trim().length !== 42) {
      await ctx.reply("Please provide a valid wallet address like this: /wallet 0x...");
      return;
    }

    const user = await ctx.adapters.github.retrieveUserByTelegramId(userId);
    if (!user) {
      await ctx.reply("You are not registered. Please register first.");
      return;
    }

    await ctx.adapters.github.handleUserBaseStorage(
      {
        ...user,
        walletAddress,
      },
      "update"
    );
  } catch (er) {
    if (er instanceof Error) {
      await ctx.reply(ctx.logger.error(`${er.message}`, { er, userId, walletAddress }).logMessage.raw);
      return;
    }
    await ctx.reply("An error occurred while trying to register your wallet.");
    return;
  }

  await ctx.reply(`Your wallet address has been successfully registered.`);
});

export { composer as walletFeature };
