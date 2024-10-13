import { Composer } from "grammy";
import { GrammyContext } from "../helpers/grammy-context";
import { logHandle } from "../helpers/logging";
import { BOT_COMMANDS } from "../setcommands";

const composer = new Composer<GrammyContext>();

const feature = composer.chatType("private");
const commands = BOT_COMMANDS.filter((command) => command.type === "all_private_chats");
const commandList = commands.map((command) => `\`/${command.command}\` - ${command.description}`).join("\n");

const welcomeParts = [
  "👋 Hello! I am the Ubiquity OS Beta Bot. I'm still in development, so thanks for your patience!",
  "",
  "<b>Here are some things you can do right now:</b>",
  "1. 🔗 Pair your GitHub account with your Telegram account.",
  "2. 🔔 Subscribe to notifications for specific triggers.",
  "3. 💼 Set your wallet address.",
  "4. 🚀 More features coming soon!",
  "",
  "<b>Here are the commands you can use:</b>",
  commandList,
];

feature.command("start", logHandle("command-start"), (ctx) => {
  return ctx.reply(`${welcomeParts.join("\n")}`, { parse_mode: "HTML" });
});

export { composer as welcomeFeature };
