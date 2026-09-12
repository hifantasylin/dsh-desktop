/**
 * Client half of `@roubaai/settings`: contributes the "RoubaAI" section to
 * the DSH Settings shell. The section reads and writes the provider
 * configuration through the host half's fenced route, so this half owns no
 * state of its own — it is a registration and nothing else.
 *
 * The section appears once the shell's own declaration is on the ledger
 * (`slots.inject` waits for it), which is why the registration goes through
 * `inject` rather than a bare `register`: a plugin that loads before the
 * settings shell would otherwise contribute to nothing.
 * @module @roubaai/settings/client
 */
import type { Context } from '@deepseek-ai/cordis';
/** Services required before the section can be contributed. */
export declare const inject: string[];
/**
 * Register the settings section.
 * @param ctx - the client cordis context carrying the slots service.
 */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map