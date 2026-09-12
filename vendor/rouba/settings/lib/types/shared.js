/**
 * Dependency-free half of the plugin's configuration contract: the namespace
 * id, the per-category provider settings shape, and the wire view the fenced
 * route returns.
 *
 * This module exists so the CLIENT bundle can import the contract without
 * pulling in `schemastery` — a schema library is a host-side concern and has
 * no business in a browser bundle (`verify-client-bundle-purity` refuses it).
 * `config.ts` layers the schema on top of this file; the browser half imports
 * only this one.
 *
 * Structure: three categories (image / video / music), each holding a
 * provider list plus the id of the provider currently in use. Every category
 * carries one built-in default provider (`id: 'default'`) whose endpoint and
 * model are fixed by this module's constants; users may add custom providers
 * and switch the active one. API keys live OUTSIDE the per-category trees in
 * one top-level `keys` dict (`providerId -> key`) so the wire redaction has a
 * flat secret surface and a deep-merge patch can update one key without
 * restating the others.
 * @module @roubaai/settings/shared
 */
/** The user-settings namespace holding the provider configuration. */
export const ROUBAAI_SETTINGS_NS = 'roubaai-video-plugin';
/** Empty string means "unset": the consumer falls back to its own default. */
export const UNSET = '';
/** All categories, in display order. */
export const MEDIA_CATEGORIES = ['image', 'video', 'music'];
/** The built-in provider id every category is seeded with. */
export const DEFAULT_PROVIDER_ID = 'default';
/**
 * Registry name of the provider each category falls back to when an entry
 * carries no adapter: the backend an unconfigured deployment has always used.
 * A deployment that mounts a different backend set changes these through the
 * Settings page rather than here.
 */
export const MEDIA_CATEGORY_DEFAULT_ADAPTERS = {
    image: 'maizi',
    video: 'maizi',
    music: 'mxapi',
};
/** Registration page the built-in image/video providers' key comes from. */
export const ROUBAAI_REGISTER_URL = 'https://www.maizitech.net/register?invite_code=664KPT';
/**
 * Built-in per-category endpoint/model defaults. Must stay in sync with the
 * providers' own runtime constants (`@roubaai/media-maizi`'s
 * `MAIZI_*_BASE_URL` / `DEFAULT_*_MODEL` and `@roubaai/media-mxapi`'s
 * `MXAPI_MUSIC_BASE_URL` / `DEFAULT_MUSIC_MODEL`) — this copy exists so the
 * browser can display them without a cross-package dependency.
 */
export const MEDIA_CATEGORY_DEFAULTS = {
    image: { baseUrl: 'https://www.maizitech.xyz/v1', model: 'gpt-image-2' },
    video: { baseUrl: 'https://www.maizitech.xyz/v1', model: 'doubao-seedance-2.0-mini' },
    music: { baseUrl: 'https://open.mxapi.org/api/v2/music', model: 'chirp-bluejay' },
};
/** Build the built-in default provider entry for one category. */
export function defaultProviderEntry(category) {
    return {
        id: `${DEFAULT_PROVIDER_ID}:${category}`,
        name: '',
        custom: false,
        adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category],
        baseUrl: UNSET,
        model: UNSET,
    };
}
/**
 * Narrow one untrusted value into the fully-resolved shape. A namespace the
 * schema has already validated still needs this: redaction strips the `keys`
 * values, an old document may miss fields, and every consumer would rather
 * read '' than branch on `undefined`. Guarantees: each category exists, its
 * `providers` contains the built-in default, `activeId` points at an existing
 * provider, and `keys` maps ids to strings.
 * @param value - the resolved namespace value (untrusted shape).
 * @returns every field present as strings.
 */
export function resolveRoubaaiMediaSettings(value) {
    const source = typeof value === 'object' && value !== null ? value : {};
    const keys = normalizeKeys(source['keys']);
    const categories = {};
    for (const category of MEDIA_CATEGORIES) {
        categories[category] = resolveCategory(source[category], category, keys);
    }
    return categories;
}
/** Normalize the secret dict: keep string entries only. */
function normalizeKeys(value) {
    if (typeof value !== 'object' || value === null)
        return {};
    const out = {};
    for (const [id, entry] of Object.entries(value)) {
        if (typeof entry === 'string')
            out[id] = entry;
    }
    return out;
}
/** Resolve one category: seed the default entry and validate `activeId`. */
function resolveCategory(value, category, keys) {
    const defaults = MEDIA_CATEGORY_DEFAULTS[category];
    const builtIn = defaultProviderEntry(category);
    const source = typeof value === 'object' && value !== null ? value : {};
    const rawProviders = Array.isArray(source['providers']) ? source['providers'] : [];
    const providers = [];
    for (const raw of rawProviders) {
        const entry = resolveEntry(raw, keys, category);
        if (entry !== undefined && !providers.some((existing) => existing.id === entry.id)) {
            providers.push(entry);
        }
    }
    if (!providers.some((entry) => entry.id === builtIn.id)) {
        providers.unshift({ ...builtIn, apiKey: keys[builtIn.id] ?? UNSET });
    }
    const activeId = typeof source['activeId'] === 'string' && providers.some((entry) => entry.id === source['activeId'])
        ? source['activeId']
        : providers[0].id;
    // A built-in provider's empty endpoint/model resolve to the category's
    // built-in constants so consumers and the display agree on what runs.
    for (const entry of providers) {
        if (!entry.custom) {
            entry.baseUrl = entry.baseUrl === UNSET ? defaults.baseUrl : entry.baseUrl;
            entry.model = entry.model === UNSET ? defaults.model : entry.model;
        }
    }
    return { activeId, providers };
}
/** Narrow one provider entry; `undefined` rejects a non-object row. */
function resolveEntry(value, keys, category) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const record = value;
    const id = typeof record['id'] === 'string' && record['id'].length > 0 ? record['id'] : undefined;
    if (id === undefined)
        return undefined;
    const string = (key) => typeof record[key] === 'string' ? record[key] : UNSET;
    const adapter = string('adapter');
    return {
        id,
        name: string('name'),
        custom: record['custom'] === true,
        // An entry stored before adapters existed carries none; it resolves to the
        // category default, which is the backend such a document has always run.
        adapter: adapter === UNSET ? MEDIA_CATEGORY_DEFAULT_ADAPTERS[category] : adapter,
        baseUrl: string('baseUrl'),
        model: string('model'),
        apiKey: keys[id] ?? UNSET,
    };
}
//# sourceMappingURL=shared.js.map