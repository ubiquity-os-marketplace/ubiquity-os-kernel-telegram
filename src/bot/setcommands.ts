import type { BotCommand } from "@grammyjs/types";
import type { CommandContext } from "grammy";
import { GrammyContext } from "./helpers/grammy-context";

export const BOT_COMMANDS = [
  {
    command: "start",
    description: "View the welcome message",
    type: "all_private_chats",
  },
  {
    command: "register",
    description: "Pair your GitHub account",
    type: "all_private_chats",
  },
  {
    command: "subscribe",
    description: "Subscribe to notifications",
    type: "all_private_chats",
  },
  {
    command: "unsubscribe",
    description: "Unsubscribe from selected notifications",
    type: "all_private_chats",
  },
  {
    command: "wallet",
    description: "Register your wallet address",
    type: "all_private_chats",
  },
  {
    command: "myid",
    description: "Get your user ID",
    type: "all_private_chats",
  },
  {
    command: "botid",
    description: "Get the bot's ID",
    type: "all_private_chats",
  },
  {
    command: "chatid",
    description: "Get the chat ID",
    type: "all_private_chats",
  },
  {
    command: "ban",
    description: "Ban a user",
    type: "all_group_chats",
    isAdmin: true,
  },
  {
    command: "setcommands",
    description: "Set the bot's commands",
    type: "chat",
    isAdmin: true,
  },
  {
    command: "setwebhook",
    description: "Set the webhook URL",
    type: "chat",
    isAdmin: true,
  },
];

function getPrivateChatCommands(): BotCommand[] {
  return [
    {
      command: "botid",
      description: "Get the bot's ID",
    },
    {
      command: "myid",
      description: "Get your user ID",
    },
    {
      command: "register",
      description: "Pair your GitHub account",
    },
    {
      command: "subscribe",
      description: "Subscribe to notifications",
    },
    {
      command: "unsubscribe",
      description: "Unsubscribe from selected notifications",
    },
    {
      command: "wallet",
      description: "Register your wallet address",
    },
  ];
}

function getPrivateChatAdminCommands(): BotCommand[] {
  return [
    {
      command: "setcommands",
      description: "Set the bot's commands",
    },
    {
      command: "setwebhook",
      description: "Set the webhook URL",
    },
  ];
}

function getGroupChatCommands(): BotCommand[] {
  return [
    {
      command: "ban",
      description: "Ban a user",
    },
  ];
}

export async function setCommandsHandler(ctx: CommandContext<GrammyContext>) {
  // set private chat commands
  await ctx.api.setMyCommands([...getPrivateChatCommands()], {
    scope: {
      type: "all_private_chats",
    },
  });

  // set group chat commands
  await ctx.api.setMyCommands(getGroupChatCommands(), {
    scope: {
      type: "all_group_chats",
    },
  });

  // set private chat commands for owner
  await ctx.api.setMyCommands([...getPrivateChatCommands(), ...getPrivateChatAdminCommands()], {
    scope: {
      type: "chat",
      chat_id: ctx.chat.id,
    },
  });

  return ctx.reply("admin-commands-updated");
}
