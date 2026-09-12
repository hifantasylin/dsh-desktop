window.__ModuleLoader__.load({
	id: "@roubaai/settings",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/api.js
		/**
		* Typed `fetch` wrapper over the plugin's fenced JSON route. Every call posts
		* to `<API_PREFIX>/<method>` and returns the envelope's `value`; a non-ok
		* envelope or a transport failure surfaces as {@link RoubaaiApiError} carrying
		* the wire code, so the settings surface can show the reason inline instead of
		* failing silently.
		* @module @roubaai/settings/client/api
		*/
		/** The host route prefix (kept in sync with the host half's `API_PREFIX`). */
		const API_PREFIX = "/api/roubaai-video";
		/** One wire failure. */
		var RoubaaiApiError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "RoubaaiApiError";
			}
		};
		/**
		* Post one method and unwrap its value.
		* @param method - the route method name (`settings.get`, `test`, …).
		* @param payload - the JSON body.
		* @returns the envelope's `value`.
		*/
		async function call(method, payload) {
			let response;
			try {
				response = await fetch(`${API_PREFIX}/${method}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
			} catch (error) {
				throw new RoubaaiApiError("network", error instanceof Error ? error.message : String(error));
			}
			const parsed = await response.json().catch(() => null);
			if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === void 0) throw new RoubaaiApiError(parsed?.error?.code ?? "http", parsed?.error?.message ?? `HTTP ${String(response.status)}`);
			return parsed.value;
		}
		/** The route surface used by the settings section. */
		const api = {
			/** Read the redacted configuration and its revision. */
			settingsGet: () => call("settings.get", {}),
			/**
			* Merge a patch into the configuration.
			* @param patch - partial settings (a `secret` field is written, never read back here).
			* @param expectedRevision - the revision the caller read; a namespace that
			* moved past it is refused so a concurrent edit is never overwritten.
			*/
			settingsUpdate: (patch, expectedRevision) => call("settings.update", {
				patch,
				...expectedRevision !== void 0 ? { expectedRevision } : {}
			}),
			/**
			* Probe one endpoint with one key — the values the caller is looking at, an
			* unsaved key included. Nothing is persisted by this call.
			* @param draft - the endpoint, key, category, adapter, and model the card shows.
			* @returns the probe's outcome.
			*/
			test: (draft) => call("test", {
				baseUrl: draft.baseUrl,
				apiKey: draft.apiKey,
				kind: draft.category,
				...draft.adapter === void 0 || draft.adapter === "" ? {} : { adapter: draft.adapter },
				...draft.model === void 0 || draft.model === "" ? {} : { model: draft.model }
			})
		};
		//#endregion
		//#region lib/types/client/locales.js
		/**
		* Dictionaries for the settings section. The plugin follows the browser's
		* language preference through `navigator.language`: the two dictionaries are
		* keyed identically and `t()` picks one, falling back to English for any
		* language the pair does not cover.
		*
		* Deliberately dependency-free — no locale service, no registration order to
		* get right — so a deployment that needs a third language swaps this module,
		* not the section.
		* @module @roubaai/settings/client/locales
		*/
		/** The dictionary key union: both languages carry exactly these keys. */
		const zh = {
			intro: "配置图片 / 视频 / 音乐生成服务的提供方。API Key 只写入、不回显。",
			categoryImage: "图片",
			categoryVideo: "视频",
			categoryMusic: "音乐",
			defaultProviderName: "默认",
			customBadge: "自定义",
			activeLabel: "使用中",
			useAction: "使用",
			editAction: "编辑",
			deleteAction: "删除",
			addProvider: "添加自定义提供方",
			apiKeyTitle: "API Key",
			apiKeyDesc: "保存后不再显示",
			apiKeySaved: "已保存，留空表示不修改",
			apiKeyUnset: "尚未设置",
			adapterTitle: "适配器",
			adapterHint: "由哪个已安装的后端处理这一行。可选值来自本次部署实际挂载的插件。",
			baseUrlTitle: "接口地址",
			baseUrlReadonly: "内置默认端点，不可修改。",
			getApiKey: "获取专属 API Key",
			modelTitle: "模型",
			modelReadonly: "内置默认模型，不可修改",
			nameTitle: "名称",
			namePlaceholder: "提供方名称",
			cancel: "取消",
			save: "保存",
			saving: "保存中…",
			test: "测试连接",
			testing: "测试中…",
			saveFailed: "保存失败：",
			testFailed: "测试失败：",
			conflict: "配置已被其他端修改，请刷新后重试。",
			untitledProvider: "未命名提供方"
		};
		const en = {
			intro: "Configure providers for the image / video / music generation services. API keys are write-only and are never shown back.",
			categoryImage: "Image",
			categoryVideo: "Video",
			categoryMusic: "Music",
			defaultProviderName: "Default",
			customBadge: "Custom",
			activeLabel: "In use",
			useAction: "Use",
			editAction: "Edit",
			deleteAction: "Delete",
			addProvider: "Add custom provider",
			apiKeyTitle: "API key",
			apiKeyDesc: "Hidden once saved",
			apiKeySaved: "Saved — leave empty to keep it unchanged",
			apiKeyUnset: "Not set yet",
			adapterTitle: "Adapter",
			adapterHint: "Which installed backend serves this row. The choices are the plugins this deployment actually mounted.",
			baseUrlTitle: "Endpoint",
			baseUrlReadonly: "Built-in default endpoint (read-only).",
			getApiKey: "Get an exclusive API key",
			modelTitle: "Model",
			modelReadonly: "Built-in default model (read-only)",
			nameTitle: "Name",
			namePlaceholder: "Provider name",
			cancel: "Cancel",
			save: "Save",
			saving: "Saving…",
			test: "Test connection",
			testing: "Testing…",
			saveFailed: "Save failed: ",
			testFailed: "Test failed: ",
			conflict: "The configuration changed elsewhere; refresh and try again.",
			untitledProvider: "Untitled provider"
		};
		/** Whether the browser prefers Chinese (any zh-* tag). */
		function isChinese() {
			return (navigator.language ?? "").toLowerCase().startsWith("zh");
		}
		/**
		* Look up one message in the active language.
		* @param key - the dictionary key.
		* @returns the localized string.
		*/
		function t(key) {
			return isChinese() ? zh[key] : en[key];
		}
		/** All categories, in display order. */
		const MEDIA_CATEGORIES = [
			"image",
			"video",
			"music"
		];
		/** The built-in provider id every category is seeded with. */
		const DEFAULT_PROVIDER_ID = "default";
		/**
		* Registry name of the provider each category falls back to when an entry
		* carries no adapter: the backend an unconfigured deployment has always used.
		* A deployment that mounts a different backend set changes these through the
		* Settings page rather than here.
		*/
		const MEDIA_CATEGORY_DEFAULT_ADAPTERS = {
			image: "maizi",
			video: "maizi",
			music: "mxapi"
		};
		/**
		* Built-in per-category endpoint/model defaults. Must stay in sync with the
		* providers' own runtime constants (`@roubaai/media-maizi`'s
		* `MAIZI_*_BASE_URL` / `DEFAULT_*_MODEL` and `@roubaai/media-mxapi`'s
		* `MXAPI_MUSIC_BASE_URL` / `DEFAULT_MUSIC_MODEL`) — this copy exists so the
		* browser can display them without a cross-package dependency.
		*/
		const MEDIA_CATEGORY_DEFAULTS = {
			image: {
				baseUrl: "https://www.maizitech.xyz/v1",
				model: "gpt-image-2"
			},
			video: {
				baseUrl: "https://www.maizitech.xyz/v1",
				model: "doubao-seedance-2.0-mini"
			},
			music: {
				baseUrl: "https://open.mxapi.org/api/v2/music",
				model: "chirp-bluejay"
			}
		};
		/** Build the built-in default provider entry for one category. */
		function defaultProviderEntry(category) {
			return {
				id: `${DEFAULT_PROVIDER_ID}:${category}`,
				name: "",
				custom: false,
				adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category],
				baseUrl: "",
				model: ""
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
		function resolveRoubaaiMediaSettings(value) {
			const source = typeof value === "object" && value !== null ? value : {};
			const keys = normalizeKeys(source["keys"]);
			const categories = {};
			for (const category of MEDIA_CATEGORIES) categories[category] = resolveCategory(source[category], category, keys);
			return categories;
		}
		/** Normalize the secret dict: keep string entries only. */
		function normalizeKeys(value) {
			if (typeof value !== "object" || value === null) return {};
			const out = {};
			for (const [id, entry] of Object.entries(value)) if (typeof entry === "string") out[id] = entry;
			return out;
		}
		/** Resolve one category: seed the default entry and validate `activeId`. */
		function resolveCategory(value, category, keys) {
			const defaults = MEDIA_CATEGORY_DEFAULTS[category];
			const builtIn = defaultProviderEntry(category);
			const source = typeof value === "object" && value !== null ? value : {};
			const rawProviders = Array.isArray(source["providers"]) ? source["providers"] : [];
			const providers = [];
			for (const raw of rawProviders) {
				const entry = resolveEntry(raw, keys, category);
				if (entry !== void 0 && !providers.some((existing) => existing.id === entry.id)) providers.push(entry);
			}
			if (!providers.some((entry) => entry.id === builtIn.id)) providers.unshift({
				...builtIn,
				apiKey: keys[builtIn.id] ?? ""
			});
			const activeId = typeof source["activeId"] === "string" && providers.some((entry) => entry.id === source["activeId"]) ? source["activeId"] : providers[0].id;
			for (const entry of providers) if (!entry.custom) {
				entry.baseUrl = entry.baseUrl === "" ? defaults.baseUrl : entry.baseUrl;
				entry.model = entry.model === "" ? defaults.model : entry.model;
			}
			return {
				activeId,
				providers
			};
		}
		/** Narrow one provider entry; `undefined` rejects a non-object row. */
		function resolveEntry(value, keys, category) {
			if (typeof value !== "object" || value === null) return void 0;
			const record = value;
			const id = typeof record["id"] === "string" && record["id"].length > 0 ? record["id"] : void 0;
			if (id === void 0) return void 0;
			const string = (key) => typeof record[key] === "string" ? record[key] : "";
			const adapter = string("adapter");
			return {
				id,
				name: string("name"),
				custom: record["custom"] === true,
				adapter: adapter === "" ? MEDIA_CATEGORY_DEFAULT_ADAPTERS[category] : adapter,
				baseUrl: string("baseUrl"),
				model: string("model"),
				apiKey: keys[id] ?? ""
			};
		}
		//#endregion
		//#region \0dsh-css:F:\dsh-dev\plugins\roubaai-media\packages\settings\src\client\settings-section.module.css.mjs
		const css = ".aehn5q_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}.aehn5q_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}.aehn5q_group,.aehn5q_cards{flex-direction:column;gap:8px;display:flex}.aehn5q_groupHeading{color:var(--dsw-alias-label-primary);margin:4px 0 0;font-size:16px;font-weight:500;line-height:24px}.aehn5q_card{border:.5px solid var(--dsw-alias-border-l4);border-radius:16px;flex-direction:column;gap:12px;padding:12px 14px;display:flex}.aehn5q_cardHeader{align-items:center;gap:10px;display:flex}.aehn5q_cardTitleArea{align-items:center;gap:6px;min-width:0;display:inline-flex}.aehn5q_cardTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}.aehn5q_badge{border:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;padding:1px 6px;font-size:11px;line-height:16px}.aehn5q_credentialDot{box-sizing:border-box;border-radius:50%;flex:none;width:8px;height:8px;display:inline-block}.aehn5q_credentialDotConfigured{background:var(--dsw-alias-state-success-primary)}.aehn5q_credentialDotMissing{background:var(--dsw-alias-state-error-primary)}.aehn5q_activeLabel{color:var(--dsw-alias-state-success-primary);flex:none;font-size:12px;font-weight:500;line-height:18px}.aehn5q_cardActions{align-items:center;gap:4px;margin-left:auto;display:inline-flex}.aehn5q_primaryButton,.aehn5q_secondaryButton,.aehn5q_dangerButton,.aehn5q_addButton,.aehn5q_linkButton{box-sizing:border-box;height:36px;font:inherit;cursor:pointer;border:none;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}.aehn5q_primaryButton{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.aehn5q_primaryButton:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.aehn5q_secondaryButton,.aehn5q_addButton{border:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);background:0 0}.aehn5q_secondaryButton:hover:not(:disabled),.aehn5q_addButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}.aehn5q_dangerButton{color:var(--dsw-alias-state-error-primary);background:0 0}.aehn5q_dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.aehn5q_linkButton{color:var(--dsw-alias-label-primary);background:0 0}.aehn5q_linkButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.aehn5q_cardActions .aehn5q_secondaryButton,.aehn5q_cardActions .aehn5q_dangerButton,.aehn5q_cardActions .aehn5q_linkButton{border-radius:14px;height:28px;padding:0 10px;font-size:12px;line-height:18px}.aehn5q_primaryButton:disabled,.aehn5q_secondaryButton:disabled,.aehn5q_dangerButton:disabled,.aehn5q_addButton:disabled,.aehn5q_linkButton:disabled{opacity:.4;cursor:default}.aehn5q_primaryButton:focus-visible,.aehn5q_secondaryButton:focus-visible,.aehn5q_dangerButton:focus-visible,.aehn5q_addButton:focus-visible,.aehn5q_linkButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3);outline:none}.aehn5q_cardBody{background:var(--dsw-alias-bg-module-platform);border-radius:12px;flex-direction:column;gap:12px;padding:14px 16px;display:flex}.aehn5q_field{flex-direction:column;gap:6px;display:flex}.aehn5q_fieldLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:10px;font-size:12px;font-weight:500;line-height:18px;display:inline-flex}.aehn5q_fieldHint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}.aehn5q_input{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);width:100%;height:32px;font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:14px;line-height:22px}.aehn5q_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.aehn5q_input::placeholder{color:var(--dsw-alias-label-dimmed)}.aehn5q_readonlyValue{color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;font-size:14px;line-height:22px}.aehn5q_getApiKey{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);width:fit-content;height:28px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border-radius:14px;align-items:center;margin-top:-4px;padding:0 10px;font-size:12px;line-height:18px;text-decoration:none;display:inline-flex}.aehn5q_getApiKey:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}.aehn5q_cardFooter{justify-content:flex-end;gap:8px;display:flex}.aehn5q_addButton{border:1px dashed var(--dsw-alias-border-l3);border-radius:16px;justify-content:center;align-self:stretch;height:44px}.aehn5q_noticeOk,.aehn5q_noticeFail{margin:0;font-size:12px;line-height:18px}.aehn5q_noticeOk{color:var(--dsw-alias-state-success-primary)}.aehn5q_noticeFail{color:var(--dsw-alias-state-error-primary)}";
		const tagId = "@roubaai/settings/settings-section.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@roubaai/settings";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var settings_section_module_css_default = {
			"activeLabel": "aehn5q_activeLabel",
			"addButton": "aehn5q_addButton",
			"badge": "aehn5q_badge",
			"card": "aehn5q_card",
			"cardActions": "aehn5q_cardActions",
			"cardBody": "aehn5q_cardBody",
			"cardFooter": "aehn5q_cardFooter",
			"cardHeader": "aehn5q_cardHeader",
			"cardTitle": "aehn5q_cardTitle",
			"cardTitleArea": "aehn5q_cardTitleArea",
			"cards": "aehn5q_cards",
			"credentialDot": "aehn5q_credentialDot",
			"credentialDotConfigured": "aehn5q_credentialDotConfigured",
			"credentialDotMissing": "aehn5q_credentialDotMissing",
			"dangerButton": "aehn5q_dangerButton",
			"field": "aehn5q_field",
			"fieldHint": "aehn5q_fieldHint",
			"fieldLabel": "aehn5q_fieldLabel",
			"getApiKey": "aehn5q_getApiKey",
			"group": "aehn5q_group",
			"groupHeading": "aehn5q_groupHeading",
			"input": "aehn5q_input",
			"intro": "aehn5q_intro",
			"linkButton": "aehn5q_linkButton",
			"noticeFail": "aehn5q_noticeFail",
			"noticeOk": "aehn5q_noticeOk",
			"primaryButton": "aehn5q_primaryButton",
			"readonlyValue": "aehn5q_readonlyValue",
			"secondaryButton": "aehn5q_secondaryButton",
			"section": "aehn5q_section"
		};
		//#endregion
		//#region lib/types/client/settings-section.js
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
		/** Wire code of a refused stale write (mirrors the host's mapping). */
		const CONFLICT_CODE = "settings-conflict";
		/** Map one wire failure to an inline message. */
		function messageOf(error) {
			if (error instanceof RoubaaiApiError && error.code === CONFLICT_CODE) return t("conflict");
			return error instanceof Error ? error.message : String(error);
		}
		/** Extract the ids whose API key the redacted view reports as set. */
		function keySetIdsOf(view) {
			const ids = /* @__PURE__ */ new Set();
			for (const slot of view.secrets ?? []) if (slot.set && slot.path.length === 2 && slot.path[0] === "keys") ids.add(slot.path[1]);
			return ids;
		}
		/** Display name of one provider: the stored name, or the localized default. */
		function displayName(provider) {
			if (provider.name !== "") return provider.name;
			return provider.custom ? t("untitledProvider") : t("defaultProviderName");
		}
		/**
		* Render the provider configuration section.
		* @param _props - the settings shell's runtime share (unused: this section
		* reads its state from the plugin's own route).
		* @returns the section element tree.
		*/
		function RoubaaiVideoSettingsSection(_props) {
			const [settings, setSettings] = (0, react.useState)(null);
			/** Ids whose API key the redacted read reports as stored. */
			const [keySetIds, setKeySetIds] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [editing, setEditing] = (0, react.useState)(null);
			const [draft, setDraft] = (0, react.useState)({
				name: "",
				apiKey: "",
				baseUrl: "",
				model: "",
				adapter: ""
			});
			/** Adapters this deployment mounted, per category: a row's available choices. */
			const [adapterChoices, setAdapterChoices] = (0, react.useState)({
				image: [],
				video: [],
				music: []
			});
			const [error, setError] = (0, react.useState)(null);
			const [outcome, setOutcome] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const revisionRef = (0, react.useRef)(void 0);
			/** Providers added locally whose save has not succeeded yet. */
			const unsavedIds = (0, react.useRef)(/* @__PURE__ */ new Set());
			/** Adopt one route result: values, revision, and the key slots' state. */
			const adopt = (0, react.useCallback)((view) => {
				revisionRef.current = view.revision;
				setSettings(resolveRoubaaiMediaSettings(view.value));
				setKeySetIds(keySetIdsOf(view));
				setAdapterChoices(view.adapters ?? {
					image: [],
					video: [],
					music: []
				});
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				api.settingsGet().then((view) => {
					if (!cancelled) adopt(view);
				}).catch((caught) => {
					if (!cancelled) setError(messageOf(caught));
				});
				return () => {
					cancelled = true;
				};
			}, [adopt]);
			if (settings === null) return (0, react_jsx_runtime.jsx)("div", {
				className: settings_section_module_css_default.section,
				children: error !== null && (0, react_jsx_runtime.jsx)("p", {
					className: settings_section_module_css_default.noticeFail,
					role: "alert",
					children: error
				})
			});
			/** Send one full-shape patch (categories wholesale, keys sparse-merged). */
			const commit = (patch) => api.settingsUpdate(patch, revisionRef.current).then((view) => {
				adopt(view);
				return true;
			}).catch((caught) => {
				setError(messageOf(caught));
				return false;
			}).finally(() => {
				setBusy(false);
			});
			/** Switch the provider one category uses. */
			const useProvider = (category, providerId) => {
				if (busy) return;
				setBusy(true);
				setError(null);
				setOutcome(null);
				commit({ [category]: { activeId: providerId } });
			};
			/** Remove one custom provider; a removed active provider falls back to default. */
			const removeProvider = (category, providerId) => {
				if (busy) return;
				setBusy(true);
				setError(null);
				setOutcome(null);
				const categoryView = settings[category];
				const providers = categoryView.providers.filter((entry) => entry.id !== providerId);
				const activeId = categoryView.activeId === providerId ? `${DEFAULT_PROVIDER_ID}:${category}` : categoryView.activeId;
				commit({ [category]: {
					activeId,
					providers
				} });
			};
			/** Enter edit mode on one provider, seeding the draft from what is shown. */
			const startEdit = (category, provider) => {
				setEditing({
					category,
					providerId: provider.id
				});
				setOutcome(null);
				setDraft({
					name: provider.name,
					apiKey: "",
					adapter: provider.adapter,
					baseUrl: provider.custom ? provider.baseUrl : "",
					model: provider.custom ? provider.model : ""
				});
			};
			/**
			* Leave edit mode. A provider added but not yet saved exists only in this
			* component's state, so cancelling drops it — nothing persists until
			* "保存" succeeds.
			*/
			const cancelEdit = () => {
				if (editing === null) return;
				const { category, providerId } = editing;
				if (unsavedIds.current.has(providerId)) {
					unsavedIds.current.delete(providerId);
					setSettings((previous) => previous === null ? previous : {
						...previous,
						[category]: {
							...previous[category],
							providers: previous[category].providers.filter((entry) => entry.id !== providerId)
						}
					});
				}
				setEditing(null);
			};
			/** Save the edited card: categories wholesale, the key only when typed. */
			const saveEdit = () => {
				if (editing === null || busy) return;
				setBusy(true);
				setError(null);
				setOutcome(null);
				const { category, providerId } = editing;
				const providers = settings[category].providers.map((entry) => entry.id !== providerId ? entry : {
					...entry,
					name: draft.name.trim(),
					adapter: draft.adapter,
					baseUrl: entry.custom ? draft.baseUrl.trim() : "",
					model: entry.custom ? draft.model.trim() : ""
				});
				const keysPatch = {};
				if (draft.apiKey.trim() !== "") keysPatch[providerId] = draft.apiKey.trim();
				commit({
					[category]: { providers },
					...Object.keys(keysPatch).length === 0 ? {} : { keys: keysPatch }
				}).then((saved) => {
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
				if (busy) return;
				setError(null);
				setOutcome(null);
				const id = `custom:${crypto.randomUUID()}`;
				unsavedIds.current.add(id);
				setSettings((previous) => previous === null ? previous : {
					...previous,
					[category]: {
						...previous[category],
						providers: [...previous[category].providers, {
							id,
							name: "",
							custom: true,
							adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category],
							baseUrl: "",
							model: "",
							apiKey: ""
						}]
					}
				});
				setEditing({
					category,
					providerId: id
				});
				setDraft({
					name: "",
					apiKey: "",
					adapter: MEDIA_CATEGORY_DEFAULT_ADAPTERS[category],
					baseUrl: "",
					model: ""
				});
			};
			/** Probe the edited card's endpoint with its draft key. */
			const testDraft = () => {
				if (editing === null || busy) return;
				setBusy(true);
				setError(null);
				setOutcome(null);
				const edited = settings[editing.category].providers.find((entry) => entry.id === editing.providerId);
				const defaults = MEDIA_CATEGORY_DEFAULTS[editing.category];
				const base = edited?.custom === true && draft.baseUrl.trim() !== "" ? draft.baseUrl.trim() : edited?.baseUrl ?? defaults.baseUrl;
				api.test({
					baseUrl: base,
					apiKey: draft.apiKey,
					category: editing.category,
					adapter: draft.adapter,
					model: draft.model.trim() !== "" ? draft.model.trim() : edited?.model ?? defaults.model
				}).then((result) => {
					setOutcome(result);
				}).catch((caught) => {
					setError(`${t("testFailed")}${messageOf(caught)}`);
				}).finally(() => {
					setBusy(false);
				});
			};
			/**
			* The adapter choices for one row: what the deployment mounted, plus the
			* row's stored value when it is not among them — editing a row whose adapter
			* plugin is not currently mounted must not silently retarget it.
			*/
			const adapterOptions = (category, current) => {
				const choices = adapterChoices[category];
				return current !== "" && !choices.includes(current) ? [current, ...choices] : [...choices];
			};
			/** The control one field renders: a select over `options`, else a text input. */
			const control = (props) => props.options === void 0 ? (0, react_jsx_runtime.jsx)("input", {
				className: settings_section_module_css_default.input ?? "",
				type: props.type ?? "text",
				value: props.value,
				...props.placeholder === void 0 ? {} : { placeholder: props.placeholder },
				"aria-label": props.label,
				onChange: (event) => {
					props.onChange(event.currentTarget.value);
				}
			}) : (0, react_jsx_runtime.jsx)("select", {
				className: settings_section_module_css_default.input ?? "",
				value: props.value,
				"aria-label": props.label,
				onChange: (event) => {
					props.onChange(event.currentTarget.value);
				},
				children: props.options.map((option) => (0, react_jsx_runtime.jsx)("option", {
					value: option,
					children: option
				}, option))
			});
			/** One labeled field on the editor module: caption above, control below. */
			const field = (props) => (0, react_jsx_runtime.jsxs)("div", {
				className: settings_section_module_css_default.field,
				children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: settings_section_module_css_default.fieldLabel,
						children: props.label
					}),
					props.onChange === void 0 ? props.value === "" ? null : (0, react_jsx_runtime.jsx)("span", {
						className: settings_section_module_css_default.readonlyValue,
						children: props.value
					}) : control({
						label: props.label,
						value: props.value,
						...props.placeholder === void 0 ? {} : { placeholder: props.placeholder },
						...props.type === void 0 ? {} : { type: props.type },
						...props.options === void 0 ? {} : { options: props.options },
						onChange: props.onChange
					}),
					props.hint === void 0 || props.hint === "" ? null : (0, react_jsx_runtime.jsx)("p", {
						className: settings_section_module_css_default.fieldHint,
						children: props.hint
					})
				]
			});
			/** One category's provider cards plus its add affordance. */
			const categoryBlock = (category) => {
				const categoryView = settings[category];
				const defaults = MEDIA_CATEGORY_DEFAULTS[category];
				const heading = category === "image" ? t("categoryImage") : category === "video" ? t("categoryVideo") : t("categoryMusic");
				return (0, react_jsx_runtime.jsxs)("div", {
					className: settings_section_module_css_default.group,
					children: [
						(0, react_jsx_runtime.jsx)("div", {
							className: settings_section_module_css_default.groupHeading,
							children: heading
						}),
						(0, react_jsx_runtime.jsx)("div", {
							className: settings_section_module_css_default.cards,
							children: categoryView.providers.map((provider) => {
								const active = categoryView.activeId === provider.id;
								const isEditing = editing !== null && editing.category === category && editing.providerId === provider.id;
								const keySet = keySetIds.has(provider.id);
								const displayModel = provider.model !== "" ? provider.model : defaults.model;
								const choices = adapterOptions(category, provider.adapter);
								return (0, react_jsx_runtime.jsxs)("div", {
									className: settings_section_module_css_default.card,
									children: [(0, react_jsx_runtime.jsxs)("div", {
										className: settings_section_module_css_default.cardHeader,
										children: [(0, react_jsx_runtime.jsxs)("span", {
											className: settings_section_module_css_default.cardTitleArea,
											children: [
												(0, react_jsx_runtime.jsx)("span", { className: `${settings_section_module_css_default.credentialDot} ${keySet ? settings_section_module_css_default.credentialDotConfigured : settings_section_module_css_default.credentialDotMissing}` }),
												(0, react_jsx_runtime.jsx)("span", {
													className: settings_section_module_css_default.cardTitle,
													children: displayName(provider)
												}),
												provider.custom && (0, react_jsx_runtime.jsx)("span", {
													className: settings_section_module_css_default.badge,
													children: t("customBadge")
												}),
												active ? (0, react_jsx_runtime.jsx)("span", {
													className: settings_section_module_css_default.activeLabel,
													children: t("activeLabel")
												}) : (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: settings_section_module_css_default.linkButton,
													disabled: busy,
													onClick: () => {
														useProvider(category, provider.id);
													},
													children: t("useAction")
												})
											]
										}), (0, react_jsx_runtime.jsxs)("span", {
											className: settings_section_module_css_default.cardActions,
											children: [!isEditing && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: settings_section_module_css_default.secondaryButton,
												disabled: busy,
												onClick: () => {
													startEdit(category, provider);
												},
												children: t("editAction")
											}), provider.custom && !isEditing && (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: settings_section_module_css_default.dangerButton,
												disabled: busy,
												onClick: () => {
													removeProvider(category, provider.id);
												},
												children: t("deleteAction")
											})]
										})]
									}), isEditing && (0, react_jsx_runtime.jsxs)("div", {
										className: settings_section_module_css_default.cardBody,
										children: [
											choices.length === 0 ? field({
												label: t("adapterTitle"),
												hint: t("adapterHint"),
												value: provider.adapter
											}) : field({
												label: t("adapterTitle"),
												hint: t("adapterHint"),
												value: draft.adapter,
												options: choices,
												onChange: (next) => {
													setDraft((previous) => ({
														...previous,
														adapter: next
													}));
												}
											}),
											provider.custom && field({
												label: t("nameTitle"),
												value: draft.name,
												placeholder: t("namePlaceholder"),
												onChange: (next) => {
													setDraft((previous) => ({
														...previous,
														name: next
													}));
												}
											}),
											field({
												label: t("apiKeyTitle"),
												hint: t("apiKeyDesc"),
												type: "password",
												value: draft.apiKey,
												placeholder: keySet ? t("apiKeySaved") : t("apiKeyUnset"),
												onChange: (next) => {
													setDraft((previous) => ({
														...previous,
														apiKey: next
													}));
												}
											}),
											provider.custom ? field({
												label: t("baseUrlTitle"),
												value: draft.baseUrl,
												placeholder: defaults.baseUrl,
												onChange: (next) => {
													setDraft((previous) => ({
														...previous,
														baseUrl: next
													}));
												}
											}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [field({
												label: t("baseUrlTitle"),
												hint: t("baseUrlReadonly"),
												value: ""
											}), category === "music" ? null : (0, react_jsx_runtime.jsx)("a", {
												className: settings_section_module_css_default.getApiKey,
												href: "https://www.maizitech.net/register?invite_code=664KPT",
												target: "_blank",
												rel: "noreferrer",
												children: t("getApiKey")
											})] }),
											provider.custom ? field({
												label: t("modelTitle"),
												value: draft.model,
												placeholder: defaults.model,
												onChange: (next) => {
													setDraft((previous) => ({
														...previous,
														model: next
													}));
												}
											}) : field({
												label: t("modelTitle"),
												hint: t("modelReadonly"),
												value: displayModel
											}),
											(0, react_jsx_runtime.jsxs)("div", {
												className: settings_section_module_css_default.cardFooter,
												children: [
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: settings_section_module_css_default.secondaryButton,
														disabled: busy,
														onClick: cancelEdit,
														children: t("cancel")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: settings_section_module_css_default.secondaryButton,
														disabled: busy,
														onClick: testDraft,
														children: busy ? t("testing") : t("test")
													}),
													(0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: settings_section_module_css_default.primaryButton,
														disabled: busy,
														onClick: saveEdit,
														children: busy ? t("saving") : t("save")
													})
												]
											})
										]
									})]
								}, provider.id);
							})
						}),
						(0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: settings_section_module_css_default.addButton,
							disabled: busy,
							onClick: () => {
								addProvider(category);
							},
							children: ["+ ", t("addProvider")]
						})
					]
				}, category);
			};
			return (0, react_jsx_runtime.jsxs)("div", {
				className: settings_section_module_css_default.section,
				children: [
					(0, react_jsx_runtime.jsx)("p", {
						className: settings_section_module_css_default.intro,
						children: t("intro")
					}),
					MEDIA_CATEGORIES.map((category) => categoryBlock(category)),
					outcome !== null && (0, react_jsx_runtime.jsx)("p", {
						className: outcome.ok ? settings_section_module_css_default.noticeOk : settings_section_module_css_default.noticeFail,
						role: "status",
						children: outcome.message
					}),
					error !== null && (0, react_jsx_runtime.jsx)("p", {
						className: settings_section_module_css_default.noticeFail,
						role: "alert",
						children: error
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
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
		/** Services required before the section can be contributed. */
		const inject = ["slots"];
		/** The settings nav label (the shell localizes its own chrome, not ours). */
		function label() {
			return "RoubaAI";
		}
		/**
		* Register the settings section.
		* @param ctx - the client cordis context carrying the slots service.
		*/
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "roubaai-settings",
				order: 100,
				label
			}, RoubaaiVideoSettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map