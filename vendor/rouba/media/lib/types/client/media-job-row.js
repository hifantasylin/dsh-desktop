import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useState } from 'react';
import { jobOutputMedia } from "./job-output-media.js";
/** Tertiary caption style shared by every branch's label line. */
const captionStyle = {
    fontSize: '12px',
    lineHeight: '18px',
    color: 'var(--dsw-alias-label-tertiary, #6b7280)',
};
/** Whether the browser prefers Chinese (any zh-* tag). */
function isChinese() {
    return (navigator.language ?? '').toLowerCase().startsWith('zh');
}
/** Raw result text of a settled block (the fallback body). */
function resultText(block) {
    const content = block?.content;
    if (!Array.isArray(content))
        return '';
    return content
        .map((part) => typeof part === 'object' && part !== null && part['type'] === 'text'
        ? part['text']
        : '')
        .filter((line) => line !== '')
        .join('\n');
}
/** Label per media kind (Chinese label when the browser prefers it). */
function mediaLabel(media) {
    const zh = isChinese();
    switch (media.kind) {
        case 'image':
            return zh ? '生成的图片' : 'Generated image';
        case 'video':
            return zh ? '生成的视频' : 'Generated video';
        case 'music':
            return media.title === undefined
                ? zh ? '生成的音乐' : 'Generated music'
                : `${zh ? '生成的音乐' : 'Generated music'} · ${media.title}`;
    }
}
/** Resolve the loader from the opaque owner prop (no-op when absent). */
function loaderOf(loadImage) {
    return typeof loadImage === 'function' ? loadImage : undefined;
}
/** Load a session-authorized image URL, seeding from the loader's sync cache. */
function useAuthorizedImageUrl(loader, attachment) {
    const [url, setUrl] = useState(() => loader === undefined || attachment === undefined ? undefined : loader.peek?.(attachment));
    useEffect(() => {
        if (loader === undefined || attachment === undefined) {
            setUrl(undefined);
            return;
        }
        let alive = true;
        setUrl(loader.peek?.(attachment));
        loader(attachment).then((next) => { if (alive)
            setUrl(next); }, () => { if (alive)
            setUrl(undefined); });
        return () => { alive = false; };
    }, [loader, attachment]);
    return url;
}
/** The direct-link fallback line under a settled media (the URL can expire). */
function MediaLinkHint({ media }) {
    const url = media.kind === 'music' ? media.audioUrl : media.url;
    if (url === undefined)
        return _jsx(_Fragment, {});
    const isLocal = url.startsWith('/');
    return (_jsxs("div", { style: { ...captionStyle, marginTop: '6px' }, children: [isLocal
                ? (isChinese() ? '已缓存本地 · 可离线播放' : 'cached locally · plays offline')
                : (isChinese() ? '链接 24 小时内有效' : 'link valid for 24h'), isLocal ? null : (_jsxs(_Fragment, { children: [' · ', _jsx("a", { href: url, target: "_blank", rel: "noreferrer", style: { color: 'var(--dsw-alias-link-normal, #2563eb)' }, children: isChinese() ? '打开链接' : 'Open link' })] }))] }));
}
/** Image body: session-authorized local URL when the attachment + loader exist, else the CDN URL. */
function ImageBody({ media, loadImage }) {
    const loader = loaderOf(loadImage);
    const authorized = useAuthorizedImageUrl(loader, media.attachment);
    const [cdnFailed, setCdnFailed] = useState(false);
    const src = authorized ?? (cdnFailed ? undefined : media.url);
    if (src === undefined) {
        return (_jsx("div", { style: { ...captionStyle, padding: '8px 0' }, children: mediaLabel(media) }));
    }
    return (_jsxs("div", { children: [_jsx("img", { src: src, alt: mediaLabel(media), onError: () => setCdnFailed(true), style: { maxWidth: '100%', maxHeight: '480px', borderRadius: '8px', display: 'block' } }), _jsx(MediaLinkHint, { media: media })] }));
}
/** Video body: plays the provider URL immediately, switches to the local stream when cached. */
function VideoBody({ media }) {
    return (_jsxs("div", { children: [_jsx("video", { src: media.url, controls: true, playsInline: true, preload: "auto", style: { maxWidth: '100%', maxHeight: '480px', borderRadius: '8px', display: 'block' } }), _jsx(MediaLinkHint, { media: media })] }));
}
/** Music body: cover + player; plays the provider URL immediately, switches to the local stream when cached. */
function MusicBody({ media }) {
    return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '12px' }, children: [media.coverUrl !== undefined ? (_jsx("img", { src: media.coverUrl, alt: mediaLabel(media), style: { width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0 } })) : null, _jsx("audio", { src: media.audioUrl, controls: true, preload: "auto", style: { width: 'min(100%, 480px)', display: 'block' } })] }), _jsx("div", { style: { ...captionStyle, marginTop: '4px' }, children: mediaLabel(media) }), _jsx(MediaLinkHint, { media: media })] }));
}
/**
 * Render the row: rich inline media for a settled media-generation job, raw
 * result text otherwise. The media body lives in this tool-result card — the
 * model never copies URLs into its reply text.
 * @param props - the owner slice the keyed slot supplies.
 * @returns the row element.
 */
export function MediaJobRow(props) {
    const { block, loadImage } = props;
    const media = jobOutputMedia(block);
    // ── Settled media generation: inline media body. ──
    if (media !== null) {
        return (_jsx("div", { style: { padding: '8px 0' }, children: media.kind === 'image' ? _jsx(ImageBody, { media: media, loadImage: loadImage })
                : media.kind === 'video' ? _jsx(VideoBody, { media: media })
                    : _jsx(MusicBody, { media: media }) }));
    }
    // ── Fallback: raw result text. ──
    const text = resultText(block);
    return (_jsx("div", { style: { padding: '8px 0' }, children: _jsx("pre", { style: { margin: 0, fontSize: '12px', lineHeight: '18px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--dsw-alias-label-tertiary, #6b7280)' }, children: text === '' ? (isChinese() ? '（无输出）' : '(no output)') : text }) }));
}
//# sourceMappingURL=media-job-row.js.map