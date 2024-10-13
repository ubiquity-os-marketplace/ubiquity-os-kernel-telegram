import { Type as T } from "@sinclair/typebox";
import { StaticDecode } from "@sinclair/typebox";
import "dotenv/config";
import { StandardValidator } from "typebox-validators";

/**
 * We can restrict which updates the BotFather bot will receive.
 */

const allowedUpdates = {
  message: "message",
  poll: "poll",
  edited_message: "edited_message",
  channel_post: "channel_post",
  edited_channel_post: "edited_channel_post",
  business_connection: "business_connection",
  business_message: "business_message",
  edited_business_message: "edited_business_message",
  deleted_business_messages: "deleted_business_messages",
  message_reaction_count: "message_reaction_count",
} as const;

const botSettings = T.Object({
  /**
   * The token for the bot given by the BotFather.
   */
  TELEGRAM_BOT_TOKEN: T.String(),
  /**
   * The url to forward updates to.
   */
  TELEGRAM_BOT_WEBHOOK: T.String(),
  /**
   * The secret to use when forwarding updates.
   */
  TELEGRAM_BOT_WEBHOOK_SECRET: T.String(),
  /**
   * Ids of the users who are allowed to use admin commands.
   */
  TELEGRAM_BOT_ADMINS: T.Transform(T.Unknown())
    .Decode((str) => (Array.isArray(str) ? str.map(Number) : [Number(str)]))
    .Encode((arr) => arr.toString()),
  /**
   * Which updates the bot should receive, defaults to all.
   */
  ALLOWED_UPDATES: T.Optional(T.Array(T.Enum(allowedUpdates))),
});

const mtProtoSettings = T.Object({
  /**
   * Obtained from https://my.telegram.org/apps
   */
  TELEGRAM_APP_ID: T.Number(),
  /**
   * Obtained from https://my.telegram.org/apps
   */
  TELEGRAM_API_HASH: T.String(),
});

const TELEGRAM_BOT_ENV = T.Object({
  botSettings,
  mtProtoSettings,
});

const botEnvValidator = new StandardValidator(TELEGRAM_BOT_ENV);

export const env = T.Object({
  TELEGRAM_BOT_ENV: T.Transform(T.Union([T.String(), TELEGRAM_BOT_ENV]))
    .Decode((str) => {
      if (typeof str === "string") {
        const obj = JSON.parse(str) as StaticDecode<typeof TELEGRAM_BOT_ENV>;

        if (!botEnvValidator.test(obj)) {
          throw new Error("Invalid TELEGRAM_BOT_ENV");
        }

        return obj;
      }
      return str;
    })
    .Encode((obj) => JSON.stringify(obj)),
  STORAGE_APP_ID: T.String(),
  STORAGE_APP_PRIVATE_KEY: T.String(),
});

export type Env = StaticDecode<typeof env>;
export const envValidator = new StandardValidator(env);
