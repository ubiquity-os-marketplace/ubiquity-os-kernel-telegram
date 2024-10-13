import { GithubStorage } from "./github/storage-layer";
import { Context } from "../types";

export function createAdapters(ctx: Context, storageOwner?: string) {
  return {
    github: new GithubStorage(ctx, { storageOwner }),
  };
}
