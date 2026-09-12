/**
 * Package-owned invariant companion for `@roubaai/media-maizi`.
 *
 * The Maizi providers follow design constraint #6: a provider holds no
 * plaintext API key — it stores only the credential *reference name* and
 * resolves the secret per operation through `ctx.credentials`. This companion
 * pins that contract at registration time.
 *
 * @module @roubaai/media-maizi/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "roubaai-media-maizi-invariant";
/** Service required before the companion can reserve package ownership. */
export declare const inject: string[];
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map