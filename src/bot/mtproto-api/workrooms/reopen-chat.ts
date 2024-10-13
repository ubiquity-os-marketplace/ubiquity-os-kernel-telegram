import bigInt from "big-integer";
import { Context, SupportedEvents } from "../../../types";
import { CallbackResult } from "../../../types/proxy";
import { MtProto } from "../bot/mtproto";
import { Api } from "telegram";

export async function reopenChat(context: Context<"issues.reopened", SupportedEvents["issues.reopened"]>): Promise<CallbackResult> {
  const {
    payload,
    adapters: { github },
    logger,
  } = context;

  if (payload.repository.full_name.includes("devpool-directory")) {
    return { status: 200, reason: "skipped" };
  }

  const mtProto = new MtProto(context);
  await mtProto.initialize();

  logger.info("Reopening chat with name: ", { chatName: payload.issue.title });
  const chat = await github.retrieveChatByTaskNodeId(payload.issue.node_id);

  if (!chat) {
    return { status: 500, reason: "chat_not_found" };
  }
  const chatIdBigInt = bigInt(chat.chatId);

  const fetchedChat = await mtProto.client.invoke(
    new mtProto.api.messages.GetFullChat({
      chatId: chatIdBigInt,
    })
  );

  if (!fetchedChat) {
    throw new Error("Failed to fetch chat");
  }

  // unarchive
  await mtProto.client.invoke(
    new mtProto.api.folders.EditPeerFolders({
      folderPeers: [
        new mtProto.api.InputFolderPeer({
          peer: new mtProto.api.InputPeerChat({ chatId: chatIdBigInt }),
          folderId: 0,
        }),
      ],
    })
  );

  const chatFull = fetchedChat.fullChat as Api.ChatFull;
  const participants = chatFull.participants as Api.ChatParticipantsForbidden;

  const chatCreator = participants.selfParticipant?.userId;
  if (!chatCreator) {
    throw new Error("Failed to get chat creator");
  }

  // add the creator back to obtain control of the chat
  await mtProto.client.invoke(
    new mtProto.api.messages.AddChatUser({
      chatId: chatIdBigInt,
      userId: chatCreator,
      fwdLimit: 50,
    })
  );

  await github.handleChat({
    action: "reopen",
    chat,
  });

  const { userIds } = chat;
  const chatInput = await mtProto.client.getInputEntity(chatIdBigInt);

  for (const userId of userIds) {
    /**
     * Dialogs are all of the chats, channels, and users that the account has interacted with.
     * By obtaining the dialogs, we guarantee our client (that's what we are considered to be by the MTProto API)
     * has up to date context otherwise these operations seem to fail.
     *
     * There is likely a better way to handle this, but this works for now.
     */
    await mtProto.client.getDialogs();
    try {
      // don't add the bot or the chat creator, as they are already in the chat
      if (userId === context.config.botId || userId === chatCreator.toJSNumber()) {
        continue;
      }

      await mtProto.client.invoke(
        new mtProto.api.messages.AddChatUser({
          chatId: chatInput.className === "InputPeerChat" ? chatInput.chatId : undefined,
          userId: userId,
          fwdLimit: 50,
        })
      );
    } catch (er) {
      logger.error("Failed to add chat users", { er });
    }
  }

  await mtProto.client.invoke(
    new mtProto.api.messages.SendMessage({
      message: "This task has been reopened and this chat has been unarchived.",
      peer: new mtProto.api.InputPeerChat({ chatId: chatIdBigInt }),
    })
  );
  return { status: 200, reason: "chat_reopened" };
}
