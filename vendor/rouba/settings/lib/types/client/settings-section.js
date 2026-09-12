import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * "RoubaAI" settings section: the per-category provider configuration for the
 * media providers, rendered natively in the DSH Settings shell.
 *
 * Three categories — image, video, music — each render a card list of their
 * providers. Every category carries one built-in default provider whose
 * endpoint and model are read-only; users may add custom providers (endpoint
 * and model editable), switch the provider in use ("使用" turns green
 * "使用中"), and delete custom ones. Writes go through the plugin's own
 * fenced route, never the generic settings RPC.
 *
 * Properties the shell depends on:
 *
 *  - API keys are WRITE-ONLY. The route returns a redacted view, so a key
 *    never exists in this component's state after a save; an untouched key
 *    input is omitted from the patch so saving other fields cannot clear it.
 *  - Writes are revision-guarded. The revision the last read returned is sent
 *    back, so a concurrent edit from another surface is refused (and reported)
 *    instead of being silently overwritten.
 *  - A failure is inline. A broken route or a refused write shows a line under
 *    the controls and reverts nothing optimistically — the form never claims a
 *    save it did not make.
 *
 * The markup and styling mirror the models settings section: the same
 * `--dsw-alias-*` theme tokens, the same 14/13/12px type scale, provider row
 * cards that expand into filled editor modules, dense capsule row actions, and
 * a dashed add affordance closing each list.
 * @module @roubaai/settings/client/settings-section
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { RoubaaiApiError, api } from "./api.js";
import { t } from "./locales.js";
import { DEFAULT_PROVIDER_ID, MEDIA_CATEGORIES, MEDIA_CATEGORY_DEFAULT_ADAPTERS, MEDIA_CATEGORY_DEFAULTS, ROUBAAI_REGISTER_URL, resolveRoubaaiMediaSettings, } from "../shared.js";
import css from './settings-section.module.css';
/** Wire code of a refused stale write (mirrors the host's mapping). */
const CONFLICT_CODE = 'settings-conflict';
/** Map one wire failure to an inline message. */
function messageOf(error) {
    if (error instanceof RoubaaiApiError && error.code === CONFLICT_CODE)
        return t('conflict');
    return error instanceof Error ? error.message : String(error);
}
/** Extract the ids whose API key the redacted view reports as set. */
function keySetIdsOf(view) {
    const ids = new Set();
    for (const slot of view.secrets ?? []) {
        if (slot.set && slot.path.length === 2 && slot.path[0] === 'keys')
            ids.add(slot.path[1]);
    }
    return ids;
}
/** Display name of one provider: the stored name, or the localized default. */
function displayName(provider) {
    if (provider.name !== '')
        return provider.name;
    return provider.custom ? t('untitledProvider') : t('defaultProviderName');
}
/**
 * Render the provider configuration section.
 * @param _props - the settings shell's runtime share (unused: this section
 * reads its state from the plugin's own route).
 * @returns the section element tree.
 */
export function RoubaaiVideoSettingsSection(_props) {
    const [settings, setSettings] = useState(null);
    /** Ids whose API key the redacted read reports as stored. */
    const [keySetIds, setKeySetIds] = useState(new Set());
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState({ name: '', apiKey: '', baseUrl: '', model: '', adapter: '' });
    /** Adapters this deployment mounted, per category: a row's available choices. */
    const [adapterChoices, setAdapterChoices] = useState({
        image: [], video: [], music: [],
    });
    const [error, setError] = useState(null);
    const [outcome, setOutcome] = useState(null);
    const [busy, setBusy] = useState(false);
    // The freshest revision, read at commit time: a queued write must observe
    // the previous write's revision, and re-rendering on it is unnecessary.
    const revisionRef = useRef(undefined);
    /** Providers added locally whose save has not succeeded yet. */
    const unsavedIds = useRef(new Set());
    /** Adopt one route result: values, revision, and the key slots' state. */
    const adopt = useCallback((view) => {
        revisionRef.current = view.revision;
        setSettings(resolveRoubaaiMediaSettings(view.value));
        setKeySetIds(keySetIdsOf(view));
        setAdapterChoices(view.adapters ?? { image: [], video: [], music: [] });
    }, []);
    // Sync once on mount: another surface may have edited the section since the
    // page loaded, and the revision the first write echoes must be the current
    // one — otherwise that write is refused out of the gate.
    useEffect(() => {
        let cancelled = false;
        api.settingsGet()
            .then((view) => { if (!cancelled)
            adopt(view); })
            .catch((caught) => { if (!cancelled)
            setError(messageOf(caught)); });
        return () => { cancelled = true; };
    }, [adopt]);
    if (settings === null) {
        return (_jsx("div", { className: css.section, children: error !== null && _jsx("p", { className: css.noticeFail, role: "alert", children: error }) }));
    }
    /** Send one full-shape patch (categories wholesale, keys sparse-merged). */
    const commit = (patch) => api.settingsUpdate(patch, revisionRef.current)
        .then((view) => {
        adopt(view);
        return true;
    })
        .catch((caught) => {
        setError(messageOf(caught));
        return false;
    })
        .finally(() => { setBusy(false); });
    /** Switch the provider one category uses. */
    const useProvider = (category, providerId) => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        setOutcome(null);
        void commit({ [category]: { activeId: providerId } });
    };
    /** Remove one custom provider; a removed active provider falls back to default. */
    const removeProvider = (category, providerId) => {
        if (busy)
            return;
        setBusy(true);
        setError(null);
        setOutcome(null);
        const categoryView = settings[category];
        const providers = categoryView.providers.filter((entry) => entry.id !== providerId);
        const activeId = categoryView.activeId === providerId
            ? `${DEFAULT_PROVIDER_ID}:${category}`
            : categoryView.activeId;
        void commit({ [category]: { activeId, providers } });
    };
    /** Enter edit mode on one provider, seeding the draft from what is shown. */
    const startEdit = (category, provider) => {
        setEditing({ category, providerId: provider.id });
        setOutcome(null);
        setDraft({
            name: provider.name,
            apiKey: '',
            adapter: provider.adapter,
            // A built-in provider's read-only endpoint/model resolve to the
            // category constants; a custom provider edits its stored overrides.
            baseUrl: provider.custom ? provider.baseUrl : '',
            model: provider.custom ? provider.model : '',
        });
    };
    /**
     * Leave edit mode. A provider added but not yet saved exists only in this
     * component's state, so cancelling drops it — nothing persists until
     * "保存" succeeds.
     */
    const cancelEdit = () => {
        if (editing === null)
            return;
        const { category, providerId } = editing;
        if (unsavedIds.current.has(providerId)) {
            unsavedIds.current.delete(providerId);
            setSettings((previous) => previous === null ? previous : {
                ...previous,
                [category]: {
                    ...previous[category],
                    providers: previous[category].providers.filter((entry) => entry.id !== providerId),
                },
            });
        }
        setEditing(null);
    };
    /** Save the edited card: categories wholesale, the key only when typed. */
    const saveEdit = () => {
        if (editing === null || busy)
            return;
        setBusy(true);
        setError(null);
        setOutcome(null);
        const { category, providerId } = editing;
        const categoryView = settings[category];
        const providers = categoryView.providers.map((entry) => entry.id !== providerId ? entry : {
            ...entry,
            name: draft.name.trim(),
            // The adapter is the routing choice for every row, built-in included.
            adapter: draft.adapter,
            baseUrl: entry.custom ? draft.baseUrl.trim() : '',
            model: entry.custom ? draft.model.trim() : '',
        });
        const keysPatch = {};
        if (draft.apiKey.trim() !== '')
            keysPatch[providerId] = draft.apiKey.trim();
        void commit({
            [category]: { providers },
            ...(Object.keys(keysPatch).length === 0 ? {} : { keys: keysPatch }),
        }).then((saved) => {
            // A failed save keeps the editor open with the draft intact; a saved
            // addition is now durable, so cancelling must no longer drop it.
            if (saved) {
                unsavedIds.current.delete(providerId);
                setEditing(null);
            }
        });
    };
    /**
     * Add one custom provider to a category and open it for editing. The entry
     * is LOCAL ONLY until "保存" succeeds: cancelling drops it, and a reload
     * never shows it.
     */
    const addProvider = (category) => {
        if (busy)
            return;
        setError(null);
        setOutcome(null);
        const id = `custom:${crypto.randomUUID()}`;
        unsavedIds.current.add(id);
        setSettings((previous) => previous === null ? previous : {
            ...previous,
            [category]: {
                ...previous[category],
                providers: [
                    ...previous[category].providers,
                    // A new card starts on the category's built-in backend; retargeting
                    // it at another one is a separate choice the editor owns.
                    { id, name: '', custom: true, adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category], baseUrl: '', model: '', apiKey: '' },
                ],
            },
        });
        setEditing({ category, providerId: id });
        setDraft({ name: '', apiKey: '', adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category], baseUrl: '', model: '' });
    };
    /** Probe the edited card's endpoint with its draft key. */
    const testDraft = () => {
        if (editing === null || busy)
            return;
        setBusy(true);
        setError(null);
        setOutcome(null);
        const edited = settings[editing.category].providers.find((entry) => entry.id === editing.providerId);
        const defaults = MEDIA_CATEGORY_DEFAULTS[editing.category];
        const custom = edited?.custom === true;
        const base = custom && draft.baseUrl.trim() !== '' ? draft.baseUrl.trim() : edited?.baseUrl ?? defaults.baseUrl;
        void api.test({
            baseUrl: base,
            apiKey: draft.apiKey,
            category: editing.category,
            // The row's adapter owns the probe, so it must know which backend — and
            // which model — the card is being edited for.
            adapter: draft.adapter,
            model: draft.model.trim() !== '' ? draft.model.trim() : edited?.model ?? defaults.model,
        })
            .then((result) => { setOutcome(result); })
            .catch((caught) => { setError(`${t('testFailed')}${messageOf(caught)}`); })
            .finally(() => { setBusy(false); });
    };
    /**
     * The adapter choices for one row: what the deployment mounted, plus the
     * row's stored value when it is not among them — editing a row whose adapter
     * plugin is not currently mounted must not silently retarget it.
     */
    const adapterOptions = (category, current) => {
        const choices = adapterChoices[category];
        return current !== '' && !choices.includes(current) ? [current, ...choices] : [...choices];
    };
    /** The control one field renders: a select over `options`, else a text input. */
    const control = (props) => props.options === undefined
        ? (_jsx("input", { className: css.input ?? '', type: props.type ?? 'text', value: props.value, ...(props.placeholder === undefined ? {} : { placeholder: props.placeholder }), "aria-label": props.label, onChange: (event) => { props.onChange(event.currentTarget.value); } }))
        : (_jsx("select", { className: css.input ?? '', value: props.value, "aria-label": props.label, onChange: (event) => { props.onChange(event.currentTarget.value); }, children: props.options.map((option) => _jsx("option", { value: option, children: option }, option)) }));
    /** One labeled field on the editor module: caption above, control below. */
    const field = (props) => (_jsxs("div", { className: css.field, children: [_jsx("span", { className: css.fieldLabel, children: props.label }), props.onChange === undefined
                ? props.value === '' ? null : _jsx("span", { className: css.readonlyValue, children: props.value })
                : control({
                    label: props.label,
                    value: props.value,
                    ...props.placeholder === undefined ? {} : { placeholder: props.placeholder },
                    ...props.type === undefined ? {} : { type: props.type },
                    ...props.options === undefined ? {} : { options: props.options },
                    onChange: props.onChange,
                }), props.hint === undefined || props.hint === '' ? null : _jsx("p", { className: css.fieldHint, children: props.hint })] }));
    /** One category's provider cards plus its add affordance. */
    const categoryBlock = (category) => {
        const categoryView = settings[category];
        const defaults = MEDIA_CATEGORY_DEFAULTS[category];
        const heading = category === 'image' ? t('categoryImage')
            : category === 'video' ? t('categoryVideo') : t('categoryMusic');
        return (_jsxs("div", { className: css.group, children: [_jsx("div", { className: css.groupHeading, children: heading }), _jsx("div", { className: css.cards, children: categoryView.providers.map((provider) => {
                        const active = categoryView.activeId === provider.id;
                        const isEditing = editing !== null && editing.category === category && editing.providerId === provider.id;
                        const keySet = keySetIds.has(provider.id);
                        const displayModel = provider.model !== '' ? provider.model : defaults.model;
                        const choices = adapterOptions(category, provider.adapter);
                        return (_jsxs("div", { className: css.card, children: [_jsxs("div", { className: css.cardHeader, children: [_jsxs("span", { className: css.cardTitleArea, children: [_jsx("span", { className: `${css.credentialDot} ${keySet ? css.credentialDotConfigured : css.credentialDotMissing}` }), _jsx("span", { className: css.cardTitle, children: displayName(provider) }), provider.custom && _jsx("span", { className: css.badge, children: t('customBadge') }), active
                                                    ? _jsx("span", { className: css.activeLabel, children: t('activeLabel') })
                                                    : (_jsx("button", { type: "button", className: css.linkButton, disabled: busy, onClick: () => { useProvider(category, provider.id); }, children: t('useAction') }))] }), _jsxs("span", { className: css.cardActions, children: [!isEditing && (_jsx("button", { type: "button", className: css.secondaryButton, disabled: busy, onClick: () => { startEdit(category, provider); }, children: t('editAction') })), provider.custom && !isEditing && (_jsx("button", { type: "button", className: css.dangerButton, disabled: busy, onClick: () => { removeProvider(category, provider.id); }, children: t('deleteAction') }))] })] }), isEditing && (_jsxs("div", { className: css.cardBody, children: [choices.length === 0
                                            // Nothing mounted and nothing stored: show the value the
                                            // row resolves to rather than an empty select.
                                            ? field({ label: t('adapterTitle'), hint: t('adapterHint'), value: provider.adapter })
                                            : field({
                                                label: t('adapterTitle'),
                                                hint: t('adapterHint'),
                                                value: draft.adapter,
                                                options: choices,
                                                onChange: (next) => { setDraft((previous) => ({ ...previous, adapter: next })); },
                                            }), provider.custom && field({
                                            label: t('nameTitle'),
                                            value: draft.name,
                                            placeholder: t('namePlaceholder'),
                                            onChange: (next) => { setDraft((previous) => ({ ...previous, name: next })); },
                                        }), field({
                                            label: t('apiKeyTitle'),
                                            hint: t('apiKeyDesc'),
                                            type: 'password',
                                            value: draft.apiKey,
                                            placeholder: keySet ? t('apiKeySaved') : t('apiKeyUnset'),
                                            onChange: (next) => { setDraft((previous) => ({ ...previous, apiKey: next })); },
                                        }), provider.custom
                                            ? field({
                                                label: t('baseUrlTitle'),
                                                value: draft.baseUrl,
                                                placeholder: defaults.baseUrl,
                                                onChange: (next) => { setDraft((previous) => ({ ...previous, baseUrl: next })); },
                                            })
                                            : (_jsxs(_Fragment, { children: [field({ label: t('baseUrlTitle'), hint: t('baseUrlReadonly'), value: '' }), category === 'music' ? null : (_jsx("a", { className: css.getApiKey, href: ROUBAAI_REGISTER_URL, target: "_blank", rel: "noreferrer", children: t('getApiKey') }))] })), provider.custom
                                            ? field({
                                                label: t('modelTitle'),
                                                value: draft.model,
                                                placeholder: defaults.model,
                                                onChange: (next) => { setDraft((previous) => ({ ...previous, model: next })); },
                                            })
                                            : field({ label: t('modelTitle'), hint: t('modelReadonly'), value: displayModel }), _jsxs("div", { className: css.cardFooter, children: [_jsx("button", { type: "button", className: css.secondaryButton, disabled: busy, onClick: cancelEdit, children: t('cancel') }), _jsx("button", { type: "button", className: css.secondaryButton, disabled: busy, onClick: testDraft, children: busy ? t('testing') : t('test') }), _jsx("button", { type: "button", className: css.primaryButton, disabled: busy, onClick: saveEdit, children: busy ? t('saving') : t('save') })] })] }))] }, provider.id));
                    }) }), _jsxs("button", { type: "button", className: css.addButton, disabled: busy, onClick: () => { addProvider(category); }, children: ["+ ", t('addProvider')] })] }, category));
    };
    return (_jsxs("div", { className: css.section, children: [_jsx("p", { className: css.intro, children: t('intro') }), MEDIA_CATEGORIES.map((category) => categoryBlock(category)), outcome !== null && (_jsx("p", { className: outcome.ok ? css.noticeOk : css.noticeFail, role: "status", children: outcome.message })), error !== null && (_jsx("p", { className: css.noticeFail, role: "alert", children: error }))] }));
}
//# sourceMappingURL=settings-section.js.map