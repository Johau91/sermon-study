/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as bible from "../bible.js";
import type * as chat from "../chat.js";
import type * as embeddings from "../embeddings.js";
import type * as embeddingsHelpers from "../embeddingsHelpers.js";
import type * as http from "../http.js";
import type * as lib_asrPatterns from "../lib/asrPatterns.js";
import type * as lib_bibleParser from "../lib/bibleParser.js";
import type * as migration from "../migration.js";
import type * as openrouter from "../openrouter.js";
import type * as quiz from "../quiz.js";
import type * as search from "../search.js";
import type * as searchHelpers from "../searchHelpers.js";
import type * as sermons from "../sermons.js";
import type * as settings from "../settings.js";
import type * as transcriptCleanup from "../transcriptCleanup.js";
import type * as transcriptCleanupHelpers from "../transcriptCleanupHelpers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  bible: typeof bible;
  chat: typeof chat;
  embeddings: typeof embeddings;
  embeddingsHelpers: typeof embeddingsHelpers;
  http: typeof http;
  "lib/asrPatterns": typeof lib_asrPatterns;
  "lib/bibleParser": typeof lib_bibleParser;
  migration: typeof migration;
  openrouter: typeof openrouter;
  quiz: typeof quiz;
  search: typeof search;
  searchHelpers: typeof searchHelpers;
  sermons: typeof sermons;
  settings: typeof settings;
  transcriptCleanup: typeof transcriptCleanup;
  transcriptCleanupHelpers: typeof transcriptCleanupHelpers;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
