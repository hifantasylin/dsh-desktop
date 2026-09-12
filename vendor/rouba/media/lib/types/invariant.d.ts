/**
 * Package-owned invariant companion for `@roubaai/media`.
 *
 * The media registry is itself the whitelist (constraint #2 / design
 * §6.3): a name returned by `listImageProviders`/`listVideoProviders` must
 * resolve back through `image(name)`/`video(name)` to a provider carrying a
 * non-empty `provider` name — otherwise the list/name-lookup surface and the
 * registration table have drifted.
 *
 * @module @roubaai/media/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "roubaai-media-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map