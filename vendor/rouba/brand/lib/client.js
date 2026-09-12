window.__ModuleLoader__.load({
	id: "@roubaai/brand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/types/client/Brand.js
		/**
		* Render the Rouba mark with the presentation requested by its host surface.
		* Reuses the shared fish mark until a distinct Rouba logo is supplied.
		* @param props - Host-supplied mark presentation.
		* @returns the shared fish mark.
		*/
		function RoubaBrandMark({ size, className }) {
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FishLogo, {
				size,
				className
			});
		}
		/**
		* Render the Rouba name artwork without its independently slotted mark.
		* @returns the "Rouba DSH" name wordmark.
		*/
		function RoubaBrandName() {
			return (0, react_jsx_runtime.jsx)("span", {
				className: "dsw-rouba-brand-wordmark",
				"data-dsh-brand": "rouba",
				children: "Rouba\xA0DSH"
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Required service: the UI slot registry. */
		const inject = ["slots"];
		/**
		* Fill every shipped brand slot as one declaration-aware registration set.
		* Rouba owns the brand slots unconditionally: deployments that mount this
		* plugin are Rouba-branded and must disable the official occupant.
		* @param ctx - Client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("sidebar.brand.mark", () => ctx.slots.inject("sidebar.brand.name", () => ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, RoubaBrandMark);
				yield ctx.slots.register({ name: "sidebar.brand.name" }, RoubaBrandName);
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, RoubaBrandMark);
			})));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map