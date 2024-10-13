import { NotificationTriggers } from "../constants";

export interface Withsha {
  sha?: string;
}

export type StorageUser = {
  telegramId: number;
  githubId: number;
  githubUsername: string;
  /**
   * The user's wallet address for receiving payments. This will likely
   * exist in the global user-base storage object for the given partner.
   *
   * But we can also store it here for easy access or perhaps this will be
   * the global user-base storage object.
   */
  walletAddress: string | null;
  /**
   * These are offered the to user via the Telegram UI and work like this:
   *
   * "Notify of Reward Comment" === "Payment" -> "issue_comment.created"
   *
   * listeningTo: ["payment"]
   */
  listeningTo: NotificationTriggers[];
  /**
   * Push a GitHub username to this array to apply the same
   * listeners that your own notifications use, allowing a user
   * to track multiple GitHub accounts.
   *
   * Maybe this can be expanded to have a separate set of triggers
   * compared to the user's own notifications.
   */
  additionalUserListeners: string[];
};

/**
 * Used as our user-base storage layer. We'll demo by setting up
 * direct DMs based on webhook events/plugin outcomes.
 */
export type UserBaseStorage = {
  [telegramId: string]: StorageUser & Withsha;
} & Withsha;

export type Chat = {
  status: "open" | "closed" | "reopened";
  taskNodeId: string;
  chatName: string;
  chatId: number;
  userIds: number[];
  createdAt: string;
  modifiedAt: string;
} & Withsha;

export type ChatStorage = {
  chats: Chat[];
} & Withsha;

export type SessionStorage = {
  session: string | null;
} & Withsha;

export type StorageTypes = "allChats" | "userBase" | "singleChat" | "session";
export type ChatAction = "create" | "reopen" | "close";

export type HandleChatParams<TAction extends ChatAction = ChatAction> = {
  chat: Chat;
  action: TAction;
};

export type RetrievalHelper<TType extends StorageTypes> = TType extends "allChats"
  ? ChatStorage
  : TType extends "userBase"
    ? UserBaseStorage
    : TType extends "singleChat"
      ? Chat
      : TType extends "session"
        ? SessionStorage
        : never;
