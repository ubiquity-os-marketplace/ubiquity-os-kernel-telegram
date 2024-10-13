import { chatAction } from "@grammyjs/auto-chat-action";
import { Composer } from "grammy";
import { GrammyContext } from "../../helpers/grammy-context";
import { isAdmin } from "../../filters/is-admin";
import { logHandle } from "../../helpers/logging";
import { setCommandsHandler } from "../../setcommands";

const composer = new Composer<GrammyContext>();

const feature = composer.chatType("private").filter((ctx) => isAdmin(ctx.config.TELEGRAM_BOT_ENV.botSettings.TELEGRAM_BOT_ADMINS)(ctx));

feature.command("setcommands", logHandle("command-setcommands"), chatAction("typing"), setCommandsHandler);

export { composer as adminFeature };
