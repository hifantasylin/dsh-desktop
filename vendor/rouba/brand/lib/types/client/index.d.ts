/** Rouba DSH brand occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Required service: the UI slot registry. */
export declare const inject: string[];
/**
 * Fill every shipped brand slot as one declaration-aware registration set.
 * Rouba owns the brand slots unconditionally: deployments that mount this
 * plugin are Rouba-branded and must disable the official occupant.
 * @param ctx - Client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map