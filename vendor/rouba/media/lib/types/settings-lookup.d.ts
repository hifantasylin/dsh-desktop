/**
 * Bridge from the roubaai settings page to the media providers: resolve which
 * provider one category currently routes to, plus that provider's API key,
 * endpoint base, and default model, out of the settings namespace the
 * `@roubaai/settings` page owns.
 *
 * The page stores one row per configured backend and marks one of them active.
 * A row's `adapter` is the registry name of the provider that serves it, so the
 * tools resolve the provider by adapter rather than taking whichever one
 * happens to be registered first — several backends may be mounted at once.
 *
 * Reads are PER OPERATION and OPTIONAL in every direction: a deployment without
 * the settings service, without the plugin, or with an unreadable document
 * falls straight through to `undefined`, and the caller keeps its registry
 * default. That is why the service is reached through `ctx.get` rather than an
 * `inject` entry — providers must keep loading on surfaces that carry no
 * settings service.
 *
 * The built-in fallbacks mirror the providers' own runtime constants
 * (`@roubaai/media-maizi` and `@roubaai/media-mxapi`); the settings page's
 * browser half carries a synced copy so its display agrees with what runs.
 * @module @roubaai/media/settings-lookup
 */
import type { Context } from '@deepseek-ai/cordis';
/**
 * Settings namespace holding the provider configuration. `@roubaai/settings`
 * owns the stored shape; this id is the shared data contract between the page
 * and the media tools, so it stays fixed across package renames.
 */
export declare const MEDIA_SETTINGS_NAMESPACE = "roubaai-video-plugin";
/** One media category the settings page manages. */
export type MediaSettingsCategory = 'image' | 'video' | 'music';
/** One provider configuration as the providers consume it. */
export interface ActiveMediaProvider {
    /** The provider in use's API key; absent when unset (callers fall back). */
    apiKey?: string;
    /** Endpoint base override from the settings page; absent when unset. */
    baseUrl?: string;
    /** Default model override from the settings page; absent when unset. */
    model?: string;
}
/**
 * Resolve the provider one category currently uses. Overrides come back
 * absent when unset, so each consumer keeps its own fallback priority
 * (settings page → deployment config → built-in default).
 * @param ctx - the plugin context (the settings service is optional).
 * @param namespace - the settings namespace the settings page owns.
 * @param category - which category's active provider to resolve.
 * @returns the key and overrides; every field absent when unconfigured.
 */
export declare function readActiveMediaProvider(ctx: Context, namespace: string, category: MediaSettingsCategory): ActiveMediaProvider;
/**
 * Registry name of the provider the settings page routes one category to, or
 * `undefined` when nothing selects one — no settings service, no namespace, or
 * a row stored before adapters existed. Callers resolve `undefined` to the
 * registry default, which is the backend an unconfigured deployment has always
 * used.
 * @param ctx - the plugin context (the settings service is optional).
 * @param category - which category's active adapter to resolve.
 * @param namespace - the settings namespace the settings page owns.
 * @returns the adapter's registry name, or `undefined` when none is configured.
 */
export declare function readActiveAdapter(ctx: Context, category: MediaSettingsCategory, namespace?: string): string | undefined;
//# sourceMappingURL=settings-lookup.d.ts.map