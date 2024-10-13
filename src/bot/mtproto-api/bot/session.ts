import { StringSession } from "telegram/sessions";
import { Context } from "../../../types";
import { GithubStorage } from "../../../adapters/github/storage-layer";

/**
 * This class extends the StringSession class from the Telegram library.
 *
 * It adds the ability to save and load the session data from GitHub storage.
 */
export class GithubSession extends StringSession {
  github: GithubStorage;
  context: Context;
  session?: string;

  constructor(github: GithubStorage, context: Context, session?: string) {
    super(session);
    this.github = github;
    this.context = context;
    this.session = session;
  }

  async saveSession(): Promise<void> {
    if (!this.session) {
      throw new Error("No session found. Please run the SMS Login script first.");
    }
    await this.github.handleSession(this.session, "create");
  }

  async loadSession() {
    const session = await this.github.retrieveSession();

    if (session) {
      return new GithubSession(this.github, this.context, session);
    } else {
      throw new Error("No session found. Please run the SMS Login script first.");
    }
  }

  async getSession(): Promise<string> {
    const session = await this.github.retrieveSession();

    if (session) {
      return session;
    } else {
      throw new Error("No session found. Please run the SMS Login script first.");
    }
  }

  async deleteSession(): Promise<void> {
    if (!this.session) {
      throw new Error("No session found. Please run the SMS Login script first.");
    }
    await this.github.handleSession(this.session, "delete");
  }
}
