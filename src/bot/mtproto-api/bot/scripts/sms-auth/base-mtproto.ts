import { TelegramClient } from "telegram";
import { Api } from "telegram/tl";
import { TelegramClientParams } from "telegram/client/telegramBaseClient";
import dotenv from "dotenv";
import { StringSession } from "telegram/sessions";
import { Context } from "../../../../../types";
dotenv.config();

/**
 * @dev Not abstract because we need it to be instantiated for sms-auth
 *
 * Base class for initializing the Telegram client and API used for
 * handling the sms-auth aspect of configuring the bot.
 */
export class BaseMtProto {
  // @ts-expect-error properties not defined in constructor, not required in baseclass
  _client: TelegramClient;
  _api: typeof Api = Api;
  _session: StringSession | null = null;

  async initialize(env: Context["env"]["TELEGRAM_BOT_ENV"]["mtProtoSettings"], session?: string) {
    this._api = Api;
    this._session = new StringSession(session);
    this._client = await this._mtProtoInit(env, this._session);
  }

  get api() {
    return this._api;
  }

  get client() {
    return this._client;
  }

  get session() {
    return this._session;
  }

  private async _mtProtoInit(env: Context["env"]["TELEGRAM_BOT_ENV"]["mtProtoSettings"], session: StringSession) {
    const { TELEGRAM_API_HASH, TELEGRAM_APP_ID } = env;

    if (!TELEGRAM_API_HASH || !TELEGRAM_APP_ID) {
      throw new Error("Missing required environment variables for Telegram API");
    }
    const clientParams: TelegramClientParams = {
      connectionRetries: 5,
    };

    const client = new TelegramClient(session ?? "", TELEGRAM_APP_ID, TELEGRAM_API_HASH, clientParams);
    await client.connect();
    return client;
  }
}
