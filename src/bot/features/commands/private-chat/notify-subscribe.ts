import { chatAction } from "@grammyjs/auto-chat-action";
import { Composer } from "grammy";
import { GrammyContext } from "../../../helpers/grammy-context";
import { logHandle } from "../../../helpers/logging";
import { NotificationTriggers, notifyTriggers } from "../../../../constants";

const composer = new Composer<GrammyContext>();

const feature = composer.chatType("private");

feature.command("subscribe", logHandle("command-notifySubscribe"), chatAction("typing"), async (ctx) => {
  try {
    const user = await ctx.adapters.github.retrieveUserByTelegramId(ctx.from?.id);

    if (!user) {
      await ctx.reply("You are not registered. Please register first.");
      return;
    }
    await ctx.reply("Please select a trigger to subscribe to:", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          Object.keys(notifyTriggers).map((part, index) => ({
            text: part,
            callback_data: `notifySubscribe:${index}`,
          })),
        ],
      },
    });
  } catch (er) {
    await ctx.reply(`An error occurred while updating your subscription.\n\n${JSON.stringify(er)}`);
  }
});

feature.callbackQuery(/^notifySubscribe:(\d+)/, logHandle("callback-notifySubscribe"), async (ctx) => {
  try {
    const user = await ctx.adapters.github.retrieveUserByTelegramId(ctx.from?.id);

    if (!user) {
      await ctx.reply("You are not registered. Please register first.");
      return;
    }

    const selected = ctx.match[1];

    const trigger = Object.keys(notifyTriggers).find((a, index) => index === parseInt(selected)) as NotificationTriggers;

    if (!trigger) {
      await ctx.reply("Invalid trigger selected.");
      return;
    }

    if (user.listeningTo.includes(trigger)) {
      await ctx.reply(`You are already subscribed to the ${trigger} trigger.`);
      return;
    }

    user.listeningTo.push(trigger);
    await ctx.adapters.github.handleUserBaseStorage(user, "update");
    await ctx.reply(`You have subscribed to the ${trigger} trigger.`);
  } catch (e) {
    await ctx.reply(`An error occurred while updating your subscription.\n\n${JSON.stringify(e)}`);
  }
});

feature.command("unsubscribe", logHandle("command-notifyUnsubscribe"), chatAction("typing"), async (ctx) => {
  const user = await ctx.adapters.github.retrieveUserByTelegramId(ctx.from?.id);

  if (!user) {
    await ctx.reply("You are not registered. Please register first.");
    return;
  }
  await ctx.reply("Please select a trigger to unsubscribe from:", {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        user.listeningTo.map((part, index) => ({
          text: part,
          callback_data: `notifyUnsubscribe:${index}`,
        })),
      ],
    },
  });
});

feature.callbackQuery(/^notifyUnsubscribe:(\d+)/, logHandle("callback-notifyUnsubscribe"), async (ctx) => {
  const user = await ctx.adapters.github.retrieveUserByTelegramId(ctx.from?.id);

  if (!user) {
    await ctx.reply("You are not registered. Please register first.");
    return;
  }

  const selected = ctx.match[1];
  const trigger = user.listeningTo.find((a, index) => index === parseInt(selected));
  if (!trigger) {
    await ctx.reply("You are not subscribed to this trigger.");
    return;
  }

  try {
    user.listeningTo = user.listeningTo.filter((part) => part !== trigger);
    await ctx.adapters.github.handleUserBaseStorage(user, "update");
    await ctx.reply(`You have unsubscribed from the ${trigger} trigger.`);
  } catch {
    await ctx.reply("An error occurred while updating your subscription.");
  }
});

export { composer as notifySubscribeFeature };
