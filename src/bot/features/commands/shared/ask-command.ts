import { chatAction } from "@grammyjs/auto-chat-action";
import { Composer } from "grammy";
import { GrammyContext } from "../../../helpers/grammy-context";
import { logHandle } from "../../../helpers/logging";
import { logger } from "../../../../utils/logger";
import { PluginContext } from "../../../../types/plugin-context-single";

const composer = new Composer<GrammyContext>();

const feature = composer.chatType(["group", "private", "supergroup", "channel"]);
export interface CommentSimilaritySearchResult {
  comment_id: string;
  comment_plaintext: string;
  comment_issue_id: string;
  similarity: number;
  text_similarity: number;
}

export interface IssueSimilaritySearchResult {
  issue_id: string;
  issue_plaintext: string;
  similarity: number;
  text_similarity: number;
}

feature.command("ubiquityos", logHandle("command-ubiquityos"), chatAction("typing"), async (ctx) => {
  const {
    adapters: { ai, embeddings },
  } = ctx;
  const directives = [
    "Extract Relevant Information: Identify key pieces of information, even if they are incomplete, from the available corpus.",
    "Apply Knowledge: Use the extracted information and relevant documentation to construct an informed response.",
    "Draft Response: Compile the gathered insights into a coherent and concise response, ensuring it's clear and directly addresses the user's query.",
    "Review and Refine: Check for accuracy and completeness, filling any gaps with logical assumptions where necessary.",
  ];

  const constraints = [
    "Ensure the response is crafted from the corpus provided, without introducing information outside of what's available or relevant to the query.",
    "Consider edge cases where the corpus might lack explicit answers, and justify responses with logical reasoning based on the existing information.",
    "Replies MUST be in Markdown V1 format.",
  ];

  const outputStyle = "Concise and coherent responses in paragraphs that directly address the user's question.";

  const similarityThreshold = 0.9;
  const question = ctx.message?.text.replace("/ubiquityos", "").trim();

  if (!question) {
    return ctx.reply("Please provide a question to ask UbiquityOS.");
  }

  const similarText = await Promise.all([
    embeddings.findSimilarComments(question, 1 - similarityThreshold),
    embeddings.findSimilarIssues(question, 1 - similarityThreshold),
  ]).then(([comments, issues]) => {
    return [
      ...(comments?.map((comment: CommentSimilaritySearchResult) => comment.comment_plaintext) || []),
      ...(issues?.map((issue: IssueSimilaritySearchResult) => issue.issue_plaintext) || []),
    ];
  });
  logger.info("Similar Text:\n\n", { similarText });
  const rerankedText = similarText.length > 0 ? await embeddings.reRankResults(similarText, question) : [];
  logger.info("Reranked Text:\n\n", { rerankedText: rerankedText });
  return ctx.reply(
    await ai.createCompletion({
      directives,
      constraints,
      query: question,
      embeddingsSearch: rerankedText,
      additionalContext: [],
      outputStyle,
      model: PluginContext.getInstance().config.aiConfig.model,
    }),
    {
      parse_mode: "Markdown",
    }
  );
});

export { composer as askFeature };