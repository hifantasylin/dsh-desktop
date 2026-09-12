window.__ModuleLoader__.load({
	id: "@roubaai/media",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/types/client/job-output-media.js
		/**
		* Pure derivation: the media one settled `job_output` carries when the job
		* behind it is a completed media generation (image / video / music).
		*
		* `generate_*` tools run as background jobs whose output is
		* `JSON.stringify(<GenerationResult>)`. The model reads that JSON through
		* `job_output` as plain text — the chat stream has no media block to render —
		* so this module recovers the displayable media from the text and lets the
		* client half show it without a follow-up round trip.
		*
		* - image: a landed attachment reference plus the provider's 24h result URL.
		*   The card renders the attachment through the session-authorized image
		*   loader when one is supplied (fast, local) and falls back to the CDN URL.
		* - video / music: a provider CDN https URL (24h validity) rendered by direct
		*   `<video>`/`<audio>` playback. When the generation job cached the media
		*   locally it also carries `mediaCacheUrl` — a signed loopback stream URL the
		*   card prefers (fast); the CDN URL remains as the fallback.
		*
		* Every field arrives unvalidated (an old log, a failed job, a different job
		* kind), so any mismatch declines to null and the toolview falls back to the
		* raw result text. Attachment ids are checked for existence only: they are
		* opaque and provider-owned.
		* @module @roubaai/media/client/job-output-media
		*/
		/** Whether a wire value is a public https URL the browser can render directly. */
		function publicHttpsUrl(value) {
			return typeof value === "string" && value.startsWith("https://") && value.length > 8 ? value : void 0;
		}
		/**
		* Whether a wire value is the host's same-origin local media stream URL
		* (`/api/roubaai-media/media?...`). The generation tools put this in
		* `mediaRef.localUrl` / `track.localUrl` once the bytes are cached on disk.
		*/
		function localStreamUrl(value) {
			return typeof value === "string" && value.startsWith("/api/roubaai-media/media") ? value : void 0;
		}
		/**
		* Whether a finite positive integer (a bogus duration declines to undefined).
		* @param value - the unvalidated wire value.
		* @returns true when the value is a finite positive integer.
		*/
		function positiveInteger(value) {
			return typeof value === "number" && Number.isInteger(value) && Number.isFinite(value) && value > 0;
		}
		/** Join the text of every text block of a settled result. */
		function contentText(block) {
			const content = block["content"];
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const part of content) if (typeof part === "object" && part !== null && part["type"] === "text" && typeof part["text"] === "string") parts.push(part["text"]);
			return parts.join("\n");
		}
		/**
		* Narrow the image branch: the landed attachment (loader path) plus the
		* provider's original result URL (CDN fallback). The toolview renders the
		* attachment through the session-authorized loader when it can.
		*/
		function imageOf(result) {
			if (result["kind"] !== "image") return null;
			const mediaRef = result["mediaRef"];
			const mediaUrl = typeof mediaRef === "object" && mediaRef !== null ? mediaRef["url"] : void 0;
			const url = publicHttpsUrl(result["resultUrl"]) ?? publicHttpsUrl(mediaUrl);
			const rawAttachment = result["attachment"];
			const attachment = typeof rawAttachment === "object" && rawAttachment !== null && typeof rawAttachment["attachmentId"] === "string" && typeof rawAttachment["mediaType"] === "string" ? {
				attachmentId: rawAttachment["attachmentId"],
				mediaType: rawAttachment["mediaType"]
			} : void 0;
			if (attachment === void 0 && url === void 0) return null;
			return {
				kind: "image",
				...attachment === void 0 ? {} : { attachment },
				...url === void 0 ? {} : { url }
			};
		}
		/** Narrow the video branch: a provider CDN mp4 URL behind `mediaRef`, plus the cached local stream when present. */
		function videoOf(result) {
			if (result["kind"] !== "video") return null;
			const mediaRef = result["mediaRef"];
			if (typeof mediaRef !== "object" || mediaRef === null) return null;
			const record = mediaRef;
			const url = localStreamUrl(record["localUrl"]) ?? publicHttpsUrl(record["url"]);
			if (url === void 0) return null;
			return {
				kind: "video",
				url,
				mediaType: typeof record["mediaType"] === "string" && record["mediaType"] !== "" ? record["mediaType"] : "video/mp4"
			};
		}
		/** Narrow the music branch: a Suno CDN mp3 behind `track.audioUrl`, plus the cached local stream when present. */
		function musicOf(result) {
			if (result["kind"] !== "music") return null;
			const track = result["track"];
			if (typeof track !== "object" || track === null) return null;
			const record = track;
			const audioUrl = localStreamUrl(record["localUrl"]) ?? publicHttpsUrl(record["audioUrl"]);
			if (audioUrl === void 0) return null;
			const coverUrl = publicHttpsUrl(record["coverUrl"]);
			const title = typeof record["title"] === "string" && record["title"] !== "" ? record["title"] : void 0;
			const durationSeconds = positiveInteger(record["durationSeconds"]) ? record["durationSeconds"] : void 0;
			return {
				kind: "music",
				audioUrl,
				...coverUrl === void 0 ? {} : { coverUrl },
				...title === void 0 ? {} : { title },
				...durationSeconds === void 0 ? {} : { durationSeconds }
			};
		}
		/**
		* Recover the displayable media one settled `job_output` carries.
		* @param block - the frozen settled result node (a record with `content`).
		* @returns the media outcome, or null when this output is not a completed
		*   media generation.
		*/
		function jobOutputMedia(block) {
			if (block["isError"] === true) return null;
			const text = contentText(block);
			const start = text.indexOf("{");
			const end = text.lastIndexOf("}");
			if (start < 0 || end <= start) return null;
			let parsed;
			try {
				parsed = JSON.parse(text.slice(start, end + 1));
			} catch {
				return null;
			}
			if (typeof parsed !== "object" || parsed === null) return null;
			const result = parsed;
			return imageOf(result) ?? videoOf(result) ?? musicOf(result);
		}
		//#endregion
		//#region lib/types/client/media-job-row.js
		/**
		* The `job_output` media row: renders a settled media-generation job's media
		* inline in the tool result card — an image through the session-authorized
		* loader (fast local attachment) or the provider URL, an inline
		* `<video controls>` for video, an `<audio controls>` player for music.
		* Video/audio prefer the generation job's signed local stream URL
		* (`mediaCacheUrl`) and fall back to the provider CDN link if that stream is
		* gone (host restarted) or unreachable.
		*
		* The model does not need to embed URLs or call read_image: reading the
		* completed job through `job_output` displays the media here. Every other
		* `job_output` shape falls back to the raw result text (a claimed keyed view
		* suppresses the generic card, so the text must stay visible here).
		* @module @roubaai/media/client/media-job-row
		*/
		/** Tertiary caption style shared by every branch's label line. */
		const captionStyle = {
			fontSize: "12px",
			lineHeight: "18px",
			color: "var(--dsw-alias-label-tertiary, #6b7280)"
		};
		/** Whether the browser prefers Chinese (any zh-* tag). */
		function isChinese() {
			return (navigator.language ?? "").toLowerCase().startsWith("zh");
		}
		/** Raw result text of a settled block (the fallback body). */
		function resultText(block) {
			const content = block?.content;
			if (!Array.isArray(content)) return "";
			return content.map((part) => typeof part === "object" && part !== null && part["type"] === "text" ? part["text"] : "").filter((line) => line !== "").join("\n");
		}
		/** Label per media kind (Chinese label when the browser prefers it). */
		function mediaLabel(media) {
			const zh = isChinese();
			switch (media.kind) {
				case "image": return zh ? "生成的图片" : "Generated image";
				case "video": return zh ? "生成的视频" : "Generated video";
				case "music": return media.title === void 0 ? zh ? "生成的音乐" : "Generated music" : `${zh ? "生成的音乐" : "Generated music"} · ${media.title}`;
			}
		}
		/** Resolve the loader from the opaque owner prop (no-op when absent). */
		function loaderOf(loadImage) {
			return typeof loadImage === "function" ? loadImage : void 0;
		}
		/** Load a session-authorized image URL, seeding from the loader's sync cache. */
		function useAuthorizedImageUrl(loader, attachment) {
			const [url, setUrl] = (0, react.useState)(() => loader === void 0 || attachment === void 0 ? void 0 : loader.peek?.(attachment));
			(0, react.useEffect)(() => {
				if (loader === void 0 || attachment === void 0) {
					setUrl(void 0);
					return;
				}
				let alive = true;
				setUrl(loader.peek?.(attachment));
				loader(attachment).then((next) => {
					if (alive) setUrl(next);
				}, () => {
					if (alive) setUrl(void 0);
				});
				return () => {
					alive = false;
				};
			}, [loader, attachment]);
			return url;
		}
		/** The direct-link fallback line under a settled media (the URL can expire). */
		function MediaLinkHint({ media }) {
			const url = media.kind === "music" ? media.audioUrl : media.url;
			if (url === void 0) return (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {});
			const isLocal = url.startsWith("/");
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					...captionStyle,
					marginTop: "6px"
				},
				children: [isLocal ? isChinese() ? "已缓存本地 · 可离线播放" : "cached locally · plays offline" : isChinese() ? "链接 24 小时内有效" : "link valid for 24h", isLocal ? null : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · ", (0, react_jsx_runtime.jsx)("a", {
					href: url,
					target: "_blank",
					rel: "noreferrer",
					style: { color: "var(--dsw-alias-link-normal, #2563eb)" },
					children: isChinese() ? "打开链接" : "Open link"
				})] })]
			});
		}
		/** Image body: session-authorized local URL when the attachment + loader exist, else the CDN URL. */
		function ImageBody({ media, loadImage }) {
			const authorized = useAuthorizedImageUrl(loaderOf(loadImage), media.attachment);
			const [cdnFailed, setCdnFailed] = (0, react.useState)(false);
			const src = authorized ?? (cdnFailed ? void 0 : media.url);
			if (src === void 0) return (0, react_jsx_runtime.jsx)("div", {
				style: {
					...captionStyle,
					padding: "8px 0"
				},
				children: mediaLabel(media)
			});
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("img", {
				src,
				alt: mediaLabel(media),
				onError: () => setCdnFailed(true),
				style: {
					maxWidth: "100%",
					maxHeight: "480px",
					borderRadius: "8px",
					display: "block"
				}
			}), (0, react_jsx_runtime.jsx)(MediaLinkHint, { media })] });
		}
		/** Video body: plays the provider URL immediately, switches to the local stream when cached. */
		function VideoBody({ media }) {
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("video", {
				src: media.url,
				controls: true,
				playsInline: true,
				preload: "auto",
				style: {
					maxWidth: "100%",
					maxHeight: "480px",
					borderRadius: "8px",
					display: "block"
				}
			}), (0, react_jsx_runtime.jsx)(MediaLinkHint, { media })] });
		}
		/** Music body: cover + player; plays the provider URL immediately, switches to the local stream when cached. */
		function MusicBody({ media }) {
			return (0, react_jsx_runtime.jsxs)("div", { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "12px"
					},
					children: [media.coverUrl !== void 0 ? (0, react_jsx_runtime.jsx)("img", {
						src: media.coverUrl,
						alt: mediaLabel(media),
						style: {
							width: "64px",
							height: "64px",
							objectFit: "cover",
							borderRadius: "8px",
							flexShrink: 0
						}
					}) : null, (0, react_jsx_runtime.jsx)("audio", {
						src: media.audioUrl,
						controls: true,
						preload: "auto",
						style: {
							width: "min(100%, 480px)",
							display: "block"
						}
					})]
				}),
				(0, react_jsx_runtime.jsx)("div", {
					style: {
						...captionStyle,
						marginTop: "4px"
					},
					children: mediaLabel(media)
				}),
				(0, react_jsx_runtime.jsx)(MediaLinkHint, { media })
			] });
		}
		/**
		* Render the row: rich inline media for a settled media-generation job, raw
		* result text otherwise. The media body lives in this tool-result card — the
		* model never copies URLs into its reply text.
		* @param props - the owner slice the keyed slot supplies.
		* @returns the row element.
		*/
		function MediaJobRow(props) {
			const { block, loadImage } = props;
			const media = jobOutputMedia(block);
			if (media !== null) return (0, react_jsx_runtime.jsx)("div", {
				style: { padding: "8px 0" },
				children: media.kind === "image" ? (0, react_jsx_runtime.jsx)(ImageBody, {
					media,
					loadImage
				}) : media.kind === "video" ? (0, react_jsx_runtime.jsx)(VideoBody, { media }) : (0, react_jsx_runtime.jsx)(MusicBody, { media })
			});
			const text = resultText(block);
			return (0, react_jsx_runtime.jsx)("div", {
				style: { padding: "8px 0" },
				children: (0, react_jsx_runtime.jsx)("pre", {
					style: {
						margin: 0,
						fontSize: "12px",
						lineHeight: "18px",
						whiteSpace: "pre-wrap",
						overflowWrap: "anywhere",
						color: "var(--dsw-alias-label-tertiary, #6b7280)"
					},
					children: text === "" ? isChinese() ? "（无输出）" : "(no output)" : text
				})
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Client half of `@roubaai/media`: renders settled media-generation jobs
		* inline on their `job_output` tool-result card. The generated picture is a
		* large `<img>`, video an inline `<video controls>` player, music an
		* `<audio controls>` player — so the user sees the media right where the job
		* settles, and the model never has to copy URLs into its reply text (or call
		* read_image) to "show" a generated asset.
		*
		* The view claims the keyed `job_output` toolview. A claimed key suppresses
		* the generic fallback for EVERY `job_output` result, so the row must cover
		* all of the tool's shapes (see `media-job-row.tsx`: media by kind, raw text
		* otherwise).
		* @module @roubaai/media/client
		*/
		/** Services required before the keyed view can register. */
		const inject = ["slots"];
		/**
		* Register the `job_output` keyed view.
		* @param ctx - the client cordis context carrying the slots service.
		*/
		function apply(ctx) {
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "job_output"
			}, MediaJobRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map