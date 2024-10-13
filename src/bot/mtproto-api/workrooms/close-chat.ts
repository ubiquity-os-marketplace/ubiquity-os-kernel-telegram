import { MtProto } from "../bot/mtproto";
import { Api } from "telegram";
import bigInt from "big-integer";
import { Context, SupportedEvents } from "../../../types";
import { CallbackResult } from "../../../types/proxy";

export async function closeChat(context: Context<"issues.closed", SupportedEvents["issues.closed"]>): Promise<CallbackResult> {
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

  logger.info("Closing chat with name: ", { chatName: payload.issue.title });
  const chat = await github.retrieveChatByTaskNodeId(payload.issue.node_id);

  if (!chat) {
    return { status: 500, reason: "chat_not_found" };
  }

  await mtProto.client.getDialogs();
  const fetchedChat = await mtProto.client.invoke(
    new mtProto.api.messages.GetFullChat({
      chatId: bigInt(chat.chatId),
    })
  );

  if (!fetchedChat) {
    throw new Error("Failed to fetch chat");
  }

  let chatParticipants;

  if ("participants" in fetchedChat.fullChat) {
    chatParticipants = fetchedChat.fullChat.participants;
  } else {
    throw new Error("Failed to fetch chat participants");
  }

  // archive it
  await mtProto.client.invoke(
    new mtProto.api.folders.EditPeerFolders({
      folderPeers: [
        new mtProto.api.InputFolderPeer({
          peer: new mtProto.api.InputPeerChat({ chatId: bigInt(chat.chatId) }),
          folderId: 1, // 0 is active, 1 is archived
        }),
      ],
    })
  );

  if (chatParticipants.className === "ChatParticipants") {
    await mtProto.client.invoke(
      new mtProto.api.messages.SendMessage({
        message: "This task has been closed and this chat has been archived.",
        peer: new mtProto.api.InputPeerChat({ chatId: bigInt(chat.chatId) }),
      })
    );

    const participants = chatParticipants.participants;
    let creatorId;

    const userIds = participants
      .map((participant) => {
        if (participant.className === "ChatParticipantCreator") {
          creatorId = participant.userId;
          return undefined;
        }
        return participant.userId;
      })
      .filter((id) => id !== undefined);

    if (!creatorId) {
      throw new Error("Failed to get chat creator");
    }

    userIds.push(creatorId);
    const chatInput = await mtProto.client.getInputEntity(chat.chatId);

    await github.userSnapshot(
      chat.chatId,
      userIds.map((id) => id.toJSNumber())
    );

    let generator = deleteChatUsers(mtProto, userIds, context, chatInput);
    let result = await generator.next();

    while (!result.done) {
      if (!result.value.success) {
        const seconds = result.value.error?.seconds ?? 300;
        logger.info("Retrying...", { seconds, er: result.value.error });

        await intervalLogger(seconds, 60, logger, new Promise((resolve) => setTimeout(resolve, seconds * 1000)));

        generator = deleteChatUsers(mtProto, userIds.slice(result.value.index), context, chatInput);
      }
      result = await generator.next();
    }
  }

  await github.handleChat({ action: "close", chat });
  return { status: 200, reason: "chat_closed" };
}

async function* deleteChatUsers(
  mtProto: MtProto,
  userIds: bigInt.BigInteger[],
  context: Context,
  chatInput: Api.TypeInputPeer
): AsyncGenerator<{ success: boolean; index: number; error?: { errorMessage: string; seconds: number } }> {
  for (let i = 0; i < userIds.length; i++) {
    // don't kick our friendly bot
    if (userIds[i].toJSNumber() === context.config.botId) {
      continue;
    }

    try {
      await mtProto.client.invoke(
        new mtProto.api.messages.DeleteChatUser({
          revokeHistory: false,
          chatId: chatInput.className === "InputPeerChat" ? chatInput.chatId : undefined,
          userId: userIds[i],
        })
      );
      yield { success: true, index: i };
    } catch (error) {
      yield { success: false, index: i, error } as { success: false; index: number; error: { errorMessage: string; seconds: number } };
    }
  }
}

// Gives feedback while we wait for the FLOOD error to expire
async function intervalLogger(seconds: number, interval: number, logger: Context["logger"], promise: Promise<void>) {
  let timeLeft = seconds;
  const intervalId = setInterval(() => {
    timeLeft -= interval;
    logger.info(`Retrying in ${timeLeft} seconds...`);
  }, interval * 1000);

  // by this point the initial promise has resolved, this is a formality
  // as without it this function will not be async
  await promise;
  clearInterval(intervalId);
}
