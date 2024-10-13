import { logger } from "../../utils/logger";
import {
  Chat,
  ChatAction,
  ChatStorage,
  HandleChatParams,
  RetrievalHelper,
  StorageTypes,
  UserBaseStorage,
  SessionStorage,
  Withsha,
} from "../../types/github-storage";
import { Context } from "../../types";
import { PluginContext } from "../../types/plugin-context-single";
import { getPluginManifestDetails } from "./utils";
import { RequestError } from "octokit";

/**
 * Uses GitHub as a storage layer, in particular, a JSON
 * based private repository.
 */
export class GithubStorage {
  octokit: Context["octokit"];
  logger = logger;

  storageRepo = "ubiquibot-config"; // always the same (until global storage is implemented)
  storageBranch = "storage"; // always the same (until branch-per-partner is implemented)

  payloadRepoOwner: string | undefined = undefined; // which partner this data belongs to
  pluginRepo: string | undefined = undefined; // is the name of this plugin's repository i.e ubiquity-os-kernel-telegram

  installID: number | null = null; // used to get the correct install octokit

  // all need prefixed with their storage path
  chatStoragePath = "chat-storage.json";
  userStoragePath = "user-base.json";
  telegramSessionPath = "session-storage.json";

  // returns a standard octokit during setup
  isEnvSetup = false;

  constructor(ctx: Context, { storageOwner, isEnvSetup }: { storageOwner?: string; isEnvSetup?: boolean } = {}) {
    this.isEnvSetup = isEnvSetup ?? false;
    this.octokit = ctx.octokit;
    this.payloadRepoOwner = storageOwner;

    if (!this.payloadRepoOwner) {
      const { payload } = ctx;

      if (payload) {
        this.getOwnerFromPayload(payload);
      }
    }

    /**
     * The assumption here is that GitHub payloads will always have this info
     * whereas Telegram payloads will not. We must centralize our Telegram storage
     * regardless, so this makes sense but could be improved upon.
     *
     * td - validate no GitHub webhook payloads are missing this info
     * (current used webhooks are safe)
     */
    if (!this.payloadRepoOwner) {
      /**
       * @DEV - Forks should update the manifest pointing to their forked repository
       *
       * in this case "ubiquity-os"
       */
      this.payloadRepoOwner = getPluginManifestDetails().name.split("/")[0];
    }

    /**
     * This would centralize all of our storage to a single organization
     * which is suitable as we are the only partner at the moment.
     *
     * this.payloadRepoOwner = getPluginManifestDetails().name.split("/")[0];
     *
     * This could also be used to centralize a storage location for
     * partner's if we had a reference to other orgs that they own,
     * via the config or storage layer.
     *
     * this.payloadRepoOwner = getPartnerStorageLocation(this.payloadRepoOwner);
     */
    this.pluginRepo = getPluginManifestDetails().name.split("/")[1];

    this.formatStoragePaths();
  }

  /**
   * Standardized storage paths for the partner's repository.
   *
   * https://github.com/ubiquity-os/plugin-template/issues/2#issuecomment-2395009642
   * https://github.com/ubiquity-os-marketplace/ubiquity-os-kernel-telegram/pull/3#issuecomment-2394941038
   *
   * e.g:
   * - ubiquibot-config/plugin-store/ubiquity-os/ubiquity-os-kernel-telegram/chat-storage.json
   * - ubiquibot-config/plugin-store/ubiquity-os/ubiquity-os-kernel-telegram/user-base.json
   * - ubiquibot-config/plugin-store/ubiquity-os/ubiquity-os-kernel-telegram/session-storage.json
   */
  formatStoragePaths() {
    this.chatStoragePath = `plugin-store/${this.payloadRepoOwner}/${this.pluginRepo}/${this.chatStoragePath}`;
    this.userStoragePath = `plugin-store/${this.payloadRepoOwner}/${this.pluginRepo}/${this.userStoragePath}`;
    this.telegramSessionPath = `plugin-store/${this.payloadRepoOwner}/${this.pluginRepo}/${this.telegramSessionPath}`;
  }

  /**
   * This is a requirement in order to fetch/push data to the
   * partner's repository. It will return an octokit instance
   * with the correct permissions.
   *
   * Storage is handled via a dedicated GitHub App with the
   * necessary permissions to read/write to the repository.
   */
  async getStorageOctokit() {
    if (this.isEnvSetup) {
      // setup pushes secrets to ubiquity-os-kernel-telegram, doesn't need the app instance
      return this.octokit;
    }

    this.octokit = PluginContext.getInstance().getStorageApp()?.octokit;

    try {
      if (this.installID) {
        return await PluginContext.getInstance().getStorageApp()?.getInstallationOctokit(this.installID);
      }

      if (!this.payloadRepoOwner) {
        throw new Error("Unable to initialize storage octokit: owner not found");
      }

      const installs = await this.octokit.request("GET /app/installations");
      const thisInstall = installs.data.find((install) => install.account?.login === this.payloadRepoOwner);

      if (!thisInstall) {
        throw new Error("Unable to initialize storage octokit: installation not found");
      }

      return await PluginContext.getInstance().getStorageApp()?.getInstallationOctokit(thisInstall.id);
    } catch (er) {
      throw this.logger.error("Failed to get install octokit", { er });
    }
  }

  // Granular Data Retrieval

  async retrieveChatByTaskNodeId(taskNodeId: string, dbObj?: ChatStorage): Promise<Chat | undefined> {
    const dbObject = dbObj ?? (await this.retrieveStorageDataObject("allChats"));

    const chat = dbObject.chats.find((chat) => chat.taskNodeId === taskNodeId);
    if (chat) {
      return {
        ...chat,
        sha: dbObject.sha,
      };
    }
  }

  async retrieveChatByChatId(chatId: number, dbObj?: ChatStorage): Promise<Chat | undefined> {
    const dbObject = dbObj ?? (await this.retrieveStorageDataObject("allChats"));

    const chat = dbObject.chats.find((chat) => chat.chatId === chatId);
    if (chat) {
      return {
        ...chat,
        sha: dbObject.sha,
      };
    }
  }

  async retrieveUserByTelegramId(telegramId: number, dbObj?: UserBaseStorage): Promise<UserBaseStorage[string] | undefined> {
    const dbObject = dbObj ?? (await this.retrieveStorageDataObject("userBase"));

    const user = dbObject[telegramId];

    if (user) {
      return {
        ...user,
        sha: dbObject.sha,
      };
    }
  }

  async retrieveUserByGithubId(githubId: number, dbObj?: UserBaseStorage): Promise<UserBaseStorage[string] | undefined> {
    const dbObject = dbObj ?? (await this.retrieveStorageDataObject("userBase"));

    const user = Object.values(dbObject).find((user) => user.githubId === githubId);

    if (user) {
      return {
        ...user,
        sha: dbObject.sha,
      };
    }
  }

  async retrieveSession() {
    const session = await this.retrieveStorageDataObject("session");

    return session.session;
  }

  // Functions for handling data

  async userSnapshot(chatId: number, userIds: number[], dbObj?: ChatStorage) {
    const dbObject = dbObj ?? (await this.retrieveStorageDataObject("allChats"));

    const chat = dbObject.chats.find((chat) => chat.chatId === chatId);

    if (!chat) {
      throw new Error("Chat not found");
    }

    dbObject.chats = dbObject.chats.map((dbChat) => {
      if (dbChat.chatId === chatId) {
        return {
          ...dbChat,
          userIds,
        };
      }

      return dbChat;
    });

    return await this.storeData(dbObject);
  }

  // Storage handlers

  /**
   * This will create | reopen | close a chat. It must be passed the full
   * chat object.
   */
  async handleChat<TAction extends ChatAction>(params: HandleChatParams<TAction>) {
    // we'll need this no matter what
    const dbObject = await this.retrieveStorageDataObject("allChats");

    const { action, chat } = params;

    if (action === "create") {
      dbObject.chats ??= [];
      dbObject.chats.push(chat);
    } else {
      const nodeId = chat.taskNodeId;
      const chatIndex = dbObject.chats.findIndex((dbChat) => nodeId === dbChat.taskNodeId);

      if (chatIndex === -1) {
        throw new Error("Chat not found");
      }

      if (action === "reopen") {
        dbObject.chats[chatIndex] = {
          ...dbObject.chats[chatIndex],
          status: "reopened",
        };
      } else {
        dbObject.chats[chatIndex] = {
          ...chat,
          status: "closed",
        };
      }
    }

    return await this.storeData(dbObject);
  }

  /**
   * Consider "create" to be update as we'll delete the old session
   * and replace it with the new one.
   *
   * "delete" will remove the session, this will break things without a new session.
   */
  async handleSession<TAction extends "create" | "delete">(session: string, action: TAction) {
    const dbObject = await this.retrieveStorageDataObject("session", true);

    if (action === "create") {
      dbObject.session = session;
    } else {
      dbObject.session = null;
    }

    return await this.storeData(dbObject);
  }

  /**
   * Updates the user bank with the new user data. If the user already exists,
   * it will overwrite the existing data or delete it if the action is "delete".
   *
   * This is a Telegram focused method, so we'll use the telegramId as the key.
   * This way notifications can only be received to the account which is subscribing,
   * them may choose to listen into other users, but cannot enable notifications for
   * another user.
   */
  async handleUserBaseStorage<TType extends "create" | "delete" | "update">(user: UserBaseStorage[string], action: TType) {
    const dbObject = await this.retrieveStorageDataObject("userBase");

    const existingUser = dbObject[user.telegramId];

    if ((action === "create" && existingUser) || (action === "delete" && !existingUser)) {
      throw new Error("User already exists or does not exist");
    }

    if (action === "create" || action === "update") {
      dbObject[user.telegramId] = user;
    } else {
      delete dbObject[user.telegramId];
    }

    return await this.storeData(dbObject);
  }

  // Low level fetching and storage

  /**
   * Stores data in the GitHub repo. It will overwrite the existing
   * data, so ensure you're passing the full object, not just the
   * updated properties, or mistakes will be made.
   *
   * Do we need a safety check to ensure we are not accidentally deleting data? Maybe, needs tested.
   */
  async storeData<TType extends StorageTypes>(data: RetrievalHelper<TType>) {
    let path;
    let type: StorageTypes;
    let { sha } = data;

    data = deleteAllShas(data);

    if (isChatsStorage(data)) {
      path = this.chatStoragePath;
      type = "allChats";
    } else if (isUserBaseStorage(data)) {
      path = this.userStoragePath;
      type = "userBase";
    } else if (isSingleChatStorage(data)) {
      path = this.chatStoragePath;
      type = "singleChat";
    } else if (isSessionStorage(data)) {
      path = this.telegramSessionPath;
      type = "session";
    } else {
      throw new Error("Invalid data type");
    }

    const content = JSON.stringify(data, null, 2);

    const owner = this.payloadRepoOwner;

    if (!owner) {
      throw new Error("Unable to store data: owner not found");
    }

    try {
      const storageOctokit = await this.getStorageOctokit();
      if (!sha) {
        const { data: shaData } = await storageOctokit.rest.repos.getContent({
          owner,
          repo: this.storageRepo,
          path,
          ref: this.storageBranch,
        });

        if ("sha" in shaData) {
          sha = shaData.sha;
        }
      }

      await storageOctokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: this.storageRepo,
        path,
        branch: this.storageBranch,
        message: `chore: updated ${type.replace(/([A-Z])/g, " $1").toLowerCase()}`,
        content: Buffer.from(content).toString("base64"),
        sha,
      });
    } catch (er) {
      this.logger.error("Failed to store data", { er });
      return false;
    }

    return true;
  }

  /**
   * Does not fetch granular data, instead obtains the DB object
   * and returns it.
   *
   * Fitted with a helper for returning the correct storage type depending on the param.
   */
  async retrieveStorageDataObject<TType extends StorageTypes = StorageTypes>(type: TType, withSha?: boolean): Promise<RetrievalHelper<TType>> {
    const storagePaths = {
      allChats: this.chatStoragePath,
      singleChat: this.chatStoragePath,
      userBase: this.userStoragePath,
      session: this.telegramSessionPath,
    };

    const path = storagePaths[type];

    if (!this.payloadRepoOwner) {
      throw logger.error("Unable to retrieve data: owner not found");
    }

    let storageOctokit, dataContent, sha;
    try {
      storageOctokit = await this.getStorageOctokit();
    } catch (er) {
      throw logger.error("Failed to retrieve storage octokit", { er });
    }

    try {
      const { data } = await storageOctokit.rest.repos.getContent({
        owner: this.payloadRepoOwner,
        repo: this.storageRepo,
        path,
        ref: this.storageBranch,
      });

      if ("content" in data) {
        dataContent = Buffer.from(data.content, "base64").toString();
        sha = data.sha;
      } else {
        throw logger.error("Data content not found");
      }
    } catch (er) {
      if (
        (er instanceof RequestError || er instanceof Error) &&
        (er.message.toLowerCase().includes("not found") || er.message.includes(`No commit found for the ref ${this.storageBranch}`))
      ) {
        return this.handleMissingStorageBranchOrFile<TType>(storageOctokit, this.payloadRepoOwner, path, type, withSha);
      } else {
        throw logger.error("Failed to retrieve storage data object", { er });
      }
    }

    try {
      const parsedData = JSON.parse(dataContent ?? "");
      return { ...parsedData, ...(withSha ? { sha } : {}) };
    } catch {
      throw new Error("Failed to parse JSON data");
    }
  }

  async handleMissingStorageBranchOrFile<TType extends StorageTypes>(
    storageOctokit: Context["octokit"],
    owner: string,
    path: string,
    type: StorageTypes,
    withSha?: boolean
  ) {
    let mostRecentDefaultHeadCommitSha;

    try {
      const { data: defaultBranchData } = await storageOctokit.rest.repos.getCommit({
        owner,
        repo: this.storageRepo,
        ref: "heads/main", // ubiquibot-config uses main as default
      });
      mostRecentDefaultHeadCommitSha = defaultBranchData.sha;
    } catch (er) {
      throw logger.error("Failed to get default branch commit sha", { er });
    }

    // Check if the branch exists
    try {
      await storageOctokit.rest.repos.getBranch({
        owner,
        repo: this.storageRepo,
        branch: this.storageBranch,
      });
    } catch (branchError) {
      if (branchError instanceof RequestError || branchError instanceof Error) {
        const { message } = branchError;
        if (message.toLowerCase().includes(`branch not found`)) {
          // Branch doesn't exist, create the branch

          try {
            await storageOctokit.rest.git.createRef({
              owner,
              repo: this.storageRepo,
              ref: `refs/heads/${this.storageBranch}`,
              sha: mostRecentDefaultHeadCommitSha,
            });
          } catch (err) {
            throw logger.error("Failed to create branch", { err });
          }
        } else {
          throw logger.error("Failed to handle missing storage branch or file", { branchError });
        }
      } else {
        throw logger.error("Failed to handle missing storage branch or file", { branchError });
      }
    }

    try {
      // Create or update the file
      await storageOctokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo: this.storageRepo,
        path,
        branch: this.storageBranch,
        message: `chore: create ${type.replace(/([A-Z])/g, " $1").toLowerCase()}`,
        content: Buffer.from("{\n}").toString("base64"),
        sha: mostRecentDefaultHeadCommitSha,
      });

      return (await this.retrieveStorageDataObject(type, withSha)) as RetrievalHelper<TType>;
    } catch (err) {
      throw logger.error("Failed to create new storage file", { err });
    }
  }

  // Helper functions

  getOwnerFromPayload(payload: Context["payload"]) {
    if ("repository" in payload && payload.repository && !this.payloadRepoOwner) {
      this.payloadRepoOwner = payload.repository.owner?.login;
    }

    if ("organization" in payload && payload.organization && !this.payloadRepoOwner) {
      this.payloadRepoOwner = payload.organization.login;
    }

    if ("sender" in payload && payload.sender && !this.payloadRepoOwner) {
      this.payloadRepoOwner = payload.sender.login;
    }

    if ("installation" in payload && payload.installation && !this.payloadRepoOwner) {
      this.installID = payload.installation.id;
    }

    if (!this.payloadRepoOwner) {
      throw new Error("Owner not found");
    }
  }
}

function deleteAllShas<T extends Withsha>(data: T) {
  Object.keys(data).forEach((key) => {
    const value = data[key as keyof typeof data];

    if (key === "sha") {
      Reflect.deleteProperty(data, key);
    }

    if (typeof value === "object" && value) {
      deleteAllShas(value);
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === "object" && item) {
          deleteAllShas(item);
        }
      });
    }
  });

  return data;
}

function isSessionStorage(data: unknown): data is SessionStorage {
  if (typeof data !== "object" || !data) return false;
  return "session" in data;
}

function isChatsStorage(data: unknown): data is ChatStorage {
  if (typeof data !== "object" || !data) return false;
  return "chats" in data;
}

function isUserBaseStorage(data: unknown): data is UserBaseStorage {
  if (typeof data !== "object" || !data) return false;
  const firstItem = Object.values(data)[0];
  if (typeof firstItem !== "object" || !firstItem) return false;
  const keys = Object.keys(firstItem);
  return keys.includes("telegramId") && keys.includes("githubId") && keys.includes("listeningTo") && keys.includes("additionalUserListeners");
}

function isSingleChatStorage(data: unknown): data is Chat {
  if (typeof data !== "object" || !data) return false;
  return "chatId" in data || "taskNodeId" in data;
}
