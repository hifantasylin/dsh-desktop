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
/**
 * Settings namespace holding the provider configuration. `@roubaai/settings`
 * owns the stored shape; this id is the shared data contract between the page
 * and the media tools, so it stays fixed across package renames.
 */
export const MEDIA_SETTINGS_NAMESPACE = 'roubaai-video-plugin';
/** Read one non-empty string, else ''. */
function string(entry) {
    return typeof entry === 'string' && entry.length > 0 ? entry : '';
}
/**
 * Locate the active row of one category in the settings document. Every failure
 * — no settings service, no namespace, a throwing descriptor, a malformed
 * document — resolves to an absent entry, which callers read as "unconfigured".
 * @param ctx - the plugin context (the settings service is optional).
 * @param namespace - the settings namespace the settings page owns.
 * @param category - which category's active row to locate.
 * @returns the active row, the key map, and the resolved active id.
 */
function lookupActiveEntry(ctx, namespace, category) {
    const settings = ctx.get('settings');
    if (settings === undefined)
        return { entry: undefined, keys: {}, activeId: '' };
    let value;
    try {
        value = settings.describe().find((descriptor) => descriptor.ns === namespace)?.value;
    }
    catch {
        return { entry: undefined, keys: {}, activeId: '' };
    }
    if (typeof value !== 'object' || value === null)
        return { entry: undefined, keys: {}, activeId: '' };
    const record = value;
    const categoryValue = typeof record[category] === 'object' && record[category] !== null
        ? record[category]
        : undefined;
    const keys = typeof record['keys'] === 'object' && record['keys'] !== null
        ? record['keys']
        : {};
    const providers = Array.isArray(categoryValue?.['providers']) ? categoryValue['providers'] : [];
    const activeId = string(categoryValue?.['activeId']) || `default:${category}`;
    for (const candidate of providers) {
        if (typeof candidate === 'object' && candidate !== null
            && candidate['id'] === activeId) {
            return { entry: candidate, keys, activeId };
        }
    }
    return { entry: undefined, keys, activeId };
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
export function readActiveMediaProvider(ctx, namespace, category) {
    const { entry, keys, activeId } = lookupActiveEntry(ctx, namespace, category);
    const apiKey = string(keys[activeId]);
    const baseUrl = string(entry?.['baseUrl']);
    const model = string(entry?.['model']);
    return {
        ...(apiKey === '' ? {} : { apiKey }),
        ...(baseUrl === '' ? {} : { baseUrl }),
        ...(model === '' ? {} : { model }),
    };
}
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
export function readActiveAdapter(ctx, category, namespace = MEDIA_SETTINGS_NAMESPACE) {
    const { entry } = lookupActiveEntry(ctx, namespace, category);
    const adapter = string(entry?.['adapter']);
    return adapter === '' ? undefined : adapter;
}
//# sourceMappingURL=settings-lookup.js.map