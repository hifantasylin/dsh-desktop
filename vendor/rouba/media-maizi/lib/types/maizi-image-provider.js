/**
 * MaiziAI image provider — v2 synchronous (OpenAI-compatible) with a 202 →
 * poll fallback, rewritten in TypeScript from autovideo's
 * `MaiziImageClient`. The provider holds no API key: every operation resolves
 * `MAIZI_API_KEY` through `ctx.credentials` and lands the image bytes through
 * `ctx.attachments.saveImage`, so base64 never leaks into the canonical value
 * or the model context.
 *
 * @module @roubaai/media-maizi/maizi-image-provider
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { ImageProvider, readActiveMediaProvider } from '@roubaai/media';
import { getJson, postJson, downloadBytes, MaiziHttpError } from "./http.js";
import { DEFAULT_SETTINGS_NAMESPACE } from "./settings-config.js";
/**
 * Default Maizi image base URL (v1 asynchronous). We submit image generation
 * through the v1 async endpoint (returns a `task_id` immediately) and poll
 * `GET /v1/tasks/{id}` to completion — the v2 synchronous endpoint instead
 * blocks the HTTP response until the server has generated the image (which can
 * take minutes), which a background job should not wait on.
 */
export const MAIZI_IMAGE_BASE_URL = 'https://www.maizitech.xyz/v1';
/** Credential reference for the Maizi API key. */
export const MAIZI_API_KEY_REF = 'MAIZI_API_KEY';
/** Default image model (GPT Image 2, best quality/cost balance; supports 1K/2K/4K). */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
/** Foreground poll ceiling for the 202 → poll path (default 6min, matching autovideo's Maizi client which waits 360s for image tasks). */
export const DEFAULT_IMAGE_POLL_TIMEOUT_MS = 360_000;
/** Poll interval for the 202 → poll path (Maizi docs suggest 5-10s). */
const IMAGE_POLL_INTERVAL_MS = 5_000;
/** Max reference images (Maizi hard cap). */
const MAX_REF_IMAGES = 9;
/**
 * USD per image, keyed `model/resolution`. A matching `any` entry covers a
 * model Maizi prices flat across resolution tiers.
 */
const IMAGE_COST_USD = {
    'gpt-image-2/1k': 0.009,
    'gpt-image-2/2k': 0.029,
    'gpt-image-2/4k': 0.044,
    'nano-banana-fast/1k': 0.009,
    'nano-banana-2/any': 0.018,
};
/** Upper bound on a downloaded image result (Maizi results are a few MB). */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/**
 * Sniff the image media type from its magic bytes, defaulting to PNG for an
 * unrecognized payload. Used instead of hard-coding `image/png` so a JPEG/GIF/
 * WebP result is persisted with its real type.
 */
function sniffImageMediaType(bytes) {
    if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png';
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    // GIF is normalized to PNG (the result mediaType contract has no gif).
    if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        return 'image/png';
    }
    if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
        return 'image/webp';
    }
    return 'image/png';
}
/** Raised when the 202 poll exceeds the foreground timeout; carries `taskId`. */
export class ImagePollTimeoutError extends Error {
    code = 'IMAGE_POLL_TIMEOUT';
    taskId;
    constructor(taskId) {
        super(`image generation timed out before completion (task ${taskId}); retry or poll the task later`);
        this.name = 'ImagePollTimeoutError';
        this.taskId = taskId;
    }
}
/** Raised when the credential resolve returns `undefined` (distinct from NO_PROVIDER). */
export class MissingCredentialError extends Error {
    code = 'MISSING_CREDENTIAL';
    constructor(ref) {
        super(`no API key resolved for "${ref}"; store it through the credentials service or export it in the environment`);
        this.name = 'MissingCredentialError';
    }
}
/**
 * Decode a base64 payload into bytes. Accepts a bare base64 string or a
 * `data:image/...;base64,...` data URI.
 */
function decodeBase64(payload) {
    const comma = payload.indexOf(',');
    const raw = comma >= 0 && payload.startsWith('data:') ? payload.slice(comma + 1) : payload;
    return new Uint8Array(Buffer.from(raw, 'base64'));
}
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal === undefined) {
            setTimeout(resolve, ms);
            return;
        }
        if (signal.aborted) {
            reject(new Error('aborted'));
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/**
 * Maizi image provider (v2 sync + 202 poll fallback). Lands images through
 * `ctx.attachments.saveImage`; never returns raw base64.
 */
export class MaiziImageProvider extends ImageProvider {
    ctx;
    provider = 'maizi';
    defaultModel;
    baseUrl;
    apiKeyEnv;
    pollTimeoutMs;
    settingsNamespace;
    constructor(ctx, config = {}) {
        super();
        this.ctx = ctx;
        this.baseUrl = config.baseUrl ?? MAIZI_IMAGE_BASE_URL;
        this.defaultModel = config.model ?? DEFAULT_IMAGE_MODEL;
        this.apiKeyEnv = config.apiKeyEnv ?? MAIZI_API_KEY_REF;
        this.pollTimeoutMs = config.pollTimeoutMs ?? DEFAULT_IMAGE_POLL_TIMEOUT_MS;
        this.settingsNamespace = config.settingsNamespace ?? DEFAULT_SETTINGS_NAMESPACE;
    }
    /**
     * Resolve the API key per operation. The Settings page's active provider
     * wins over the credential store: it is the deployment's explicit
     * per-install choice, and the one surface a person can edit without touching
     * the environment. The credential store — and through it `MAIZI_API_KEY` —
     * stays the fallback, so a deployment that never opens the Settings page is
     * unaffected.
     * @throws {MissingCredentialError} when neither source holds a key.
     */
    async resolveKey() {
        const configured = readActiveMediaProvider(this.ctx, this.settingsNamespace, 'image').apiKey;
        if (configured !== undefined)
            return configured;
        const credentials = this.ctx.get('credentials');
        if (credentials !== undefined) {
            const hit = await credentials.resolve(credentialRef(this.apiKeyEnv));
            if (hit !== undefined && hit.value.length > 0)
                return hit.value;
        }
        throw new MissingCredentialError(this.apiKeyEnv);
    }
    /**
     * Endpoint base: the Settings page's active-provider override when one is
     * stored, else the deployment-configured base. A trailing slash is trimmed
     * so a pasted URL cannot produce a `//` path segment.
     */
    resolveBaseUrl() {
        const override = readActiveMediaProvider(this.ctx, this.settingsNamespace, 'image').baseUrl;
        return (override ?? this.baseUrl).replace(/\/+$/, '');
    }
    /**
     * Default image model: the Settings page's active-provider override when one
     * is stored, else the deployment-configured model. `ImageGenerateInput`
     * carries no model field, so this value is the only thing that decides which
     * model runs — which is exactly why it has to be re-read per operation.
     */
    resolveModel() {
        return readActiveMediaProvider(this.ctx, this.settingsNamespace, 'image').model ?? this.defaultModel;
    }
    async generate(input, signal, onProgress) {
        const apiKey = await this.resolveKey();
        // Resolved once per generation so the request, the landed attachment name,
        // and the reported `providerMeta` can never disagree about the model.
        const model = this.resolveModel();
        const payload = {
            model,
            prompt: input.prompt,
            response_format: 'b64_json',
            n: 1,
        };
        if (input.refImages !== undefined && input.refImages.length > 0) {
            payload['images'] = input.refImages.slice(0, MAX_REF_IMAGES);
        }
        if (input.width !== undefined && input.height !== undefined) {
            payload['size'] = `${input.width}x${input.height}`;
        }
        else if (input.aspectRatio !== undefined) {
            payload['size'] = input.aspectRatio;
        }
        else {
            payload['size'] = '1:1';
        }
        payload['image_size'] = input.resolution ?? '1K';
        payload['quality'] = input.quality ?? 'low';
        // Submit through the v1 async endpoint: it returns a `task_id` immediately
        // (fast), then we poll `GET /v1/tasks/{id}` to completion. The v2
        // synchronous endpoint would instead block the HTTP response until the
        // server has generated the image (which can take minutes), which a
        // background job must not wait on.
        const { status, data } = await postJson(`${this.resolveBaseUrl()}/images/generations`, apiKey, payload, signal);
        if (status !== 200 && status !== 202) {
            throw new MaiziHttpError(`Maizi image generation failed [${status}]`, status);
        }
        const response = data;
        // v1 async nests the task id under `data[0].task_id`; some responses also
        // surface it at the top level, so accept either shape.
        const taskId = response.data?.[0]?.task_id ?? response.task_id ?? response.id;
        if (taskId === undefined) {
            throw new MaiziHttpError('Maizi returned no task id for image generation', status);
        }
        const { url, bytes } = await this.pollTask(taskId, apiKey, signal, onProgress);
        // The image exists server-side (a result URL was returned). Degrade to a
        // URL reference when we cannot land the bytes locally — never fail the job
        // or force a regenerate: "has a URL" already means the image exists.
        if (bytes === undefined) {
            if (url === undefined) {
                throw new MaiziHttpError(`Maizi task ${taskId} completed with no result`, 200);
            }
            return this.urlRef(url, model);
        }
        try {
            return await this.land(bytes, model, url);
        }
        catch {
            if (url === undefined)
                throw new MaiziHttpError(`Maizi task ${taskId} result could not be saved`, 200);
            return this.urlRef(url, model);
        }
    }
    /**
     * Degrade a generated-but-not-landed image to a URL-only reference. The
     * model is passed in (not re-resolved) so the reported `providerMeta` names
     * the model this generation actually used.
     */
    urlRef(url, model) {
        return {
            kind: 'image',
            mediaType: 'image/png',
            mediaRef: {
                url,
                mediaType: 'image/png',
                expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            },
            providerMeta: { provider: this.provider, model: model },
        };
    }
    /**
     * Poll a 202-submitted task until `completed`/`failed`/`violation`, under the
     * foreground timeout ceiling. On timeout, throws {@link ImagePollTimeoutError}
     * carrying the task id (so the model may retry or query later), rather than
     * blocking the foreground indefinitely.
     */
    async pollTask(taskId, apiKey, signal, onProgress) {
        const deadline = Date.now() + this.pollTimeoutMs;
        for (;;) {
            if (Date.now() >= deadline) {
                throw new ImagePollTimeoutError(taskId);
            }
            await sleep(IMAGE_POLL_INTERVAL_MS, signal);
            const { status, data } = await getJson(`${this.resolveBaseUrl()}/tasks/${taskId}`, apiKey, signal);
            if (status !== 200)
                continue;
            const task = data;
            const taskStatus = task.status;
            if (taskStatus === 'completed') {
                const urls = task.result_urls ?? [];
                const firstUrl = urls[0];
                if (firstUrl !== undefined) {
                    try {
                        const bytes = await this.downloadResult(firstUrl, signal, onProgress);
                        return { url: firstUrl, bytes };
                    }
                    catch {
                        // The image exists server-side; degrade to a URL-only ref rather
                        // than failing the task (the caller must not regenerate).
                        return { url: firstUrl };
                    }
                }
                // A completed task may embed its data inline.
                const inline = task.data?.[0];
                if (inline?.b64_json !== undefined)
                    return { bytes: decodeBase64(inline.b64_json) };
                if (inline?.url !== undefined) {
                    try {
                        const bytes = await this.downloadResult(inline.url, signal, onProgress);
                        return { url: inline.url, bytes };
                    }
                    catch {
                        return { url: inline.url };
                    }
                }
                throw new MaiziHttpError(`Maizi task ${taskId} completed with no result`, 200);
            }
            if (taskStatus === 'failed' || taskStatus === 'violation') {
                throw new MaiziHttpError(`Maizi task ${taskId} ${taskStatus}: ${task.error_msg ?? 'no error message'}`);
            }
        }
    }
    /** Download a completed result URL, reporting download progress. */
    async downloadResult(url, signal, onProgress) {
        onProgress?.({ phase: 'downloading', percent: 0 });
        const bytes = await downloadBytes(url, signal, {
            // Cap the result so a huge or malicious CDN payload cannot be buffered
            // in full; Maizi image results are at most a few MB.
            maxBytes: MAX_IMAGE_BYTES,
            onProgress: (received, total) => {
                onProgress?.({
                    phase: 'downloading',
                    percent: total !== undefined && total > 0 ? Math.round((received / total) * 100) : 0,
                });
            },
        });
        onProgress?.({ phase: 'saving', percent: 100 });
        return bytes;
    }
    /** Persist image bytes and return the unified result reference. */
    async land(bytes, model, resultUrl) {
        const attachments = this.ctx.get('attachments');
        if (attachments === undefined) {
            throw new Error('media-maizi: ctx.attachments is missing; cannot persist the generated image');
        }
        const mediaType = sniffImageMediaType(bytes);
        const extension = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/webp' ? 'webp' : 'png';
        const ref = await attachments.saveImage({
            data: bytes,
            mediaType,
            name: `generated.${extension}`,
        });
        return {
            kind: 'image',
            attachmentRef: ref.attachmentId,
            attachment: ref,
            // Use the sniffed type (no gif) rather than the attachment's mediaType,
            // which `saveImage` may widen to include `image/gif`.
            mediaType,
            // Keep the provider's 24h result URL on the landed path too: the
            // completion message surfaces it so `media_asset_save` can fetch it as
            // a fallback when the attachment reference cannot be resolved.
            ...resultUrl !== undefined ? { resultUrl } : {},
            providerMeta: {
                provider: this.provider,
                model,
            },
        };
    }
    /** Reference images Maizi accepts on one image request. */
    caps() {
        return { maxRefImages: MAX_REF_IMAGES };
    }
    /**
     * Maizi's image rates, in USD per image, keyed `model/resolution`. A matching
     * `any` entry covers a model Maizi prices flat across tiers; a model absent
     * from both is unpriced and returns `undefined`.
     */
    estimateCostUsd(model, resolution) {
        return IMAGE_COST_USD[`${model}/${resolution.toLowerCase()}`] ?? IMAGE_COST_USD[`${model}/any`];
    }
    /**
     * Probe the endpoint and key the configuration form holds. A read-only task
     * lookup: an unknown id answers a business 404, which proves reachability and
     * key acceptance without submitting a billable generation.
     */
    async probe(draft) {
        if (draft.apiKey.trim() === '')
            return { ok: false, message: '未填写 API Key' };
        const base = draft.baseUrl.trim().replace(/\/+$/, '');
        if (base === '')
            return { ok: false, message: '未填写接口地址' };
        try {
            const { status } = await getJson(`${base}/tasks/nonexistent-probe-connection`, draft.apiKey);
            if (status < 500 && status !== 401 && status !== 403) {
                return { ok: true, message: `连接成功（HTTP ${status}）` };
            }
            return {
                ok: false,
                message: status === 401 || status === 403
                    ? `API Key 被拒绝（HTTP ${status}）`
                    : `端点返回 HTTP ${status}`,
            };
        }
        catch (error) {
            return { ok: false, message: `无法连接端点：${error instanceof Error ? error.message : String(error)}` };
        }
    }
    async testConnection() {
        try {
            const apiKey = await this.resolveKey();
            // A read-only probe: GET an obviously nonexistent task id. This verifies
            // the key (401/403) and service reachability (5xx) without submitting a
            // real, billable generation — the previous probe POSTed `/images/
            // generations` and caused a paid side effect every time it ran.
            const { status } = await getJson(`${this.resolveBaseUrl()}/tasks/nonexistent-probe-connection`, apiKey);
            // 2xx or 404 both prove the key authenticated and the service is up
            // (404 just means the probe task does not exist). 401/403 mean a bad
            // key; 5xx means the service is down. Anything else is inconclusive.
            return status < 500 && status !== 401 && status !== 403;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=maizi-image-provider.js.map