import { jsx as _jsx } from "react/jsx-runtime";
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * Render the Rouba mark with the presentation requested by its host surface.
 * Reuses the shared fish mark until a distinct Rouba logo is supplied.
 * @param props - Host-supplied mark presentation.
 * @returns the shared fish mark.
 */
export function RoubaBrandMark({ size, className }) {
    return _jsx(FishLogo, { size: size, className: className });
}
/**
 * Render the Rouba name artwork without its independently slotted mark.
 * @returns the "Rouba DSH" name wordmark.
 */
export function RoubaBrandName() {
    return (_jsx("span", { className: "dsw-rouba-brand-wordmark", "data-dsh-brand": "rouba", children: "Rouba\u00A0DSH" }));
}
//# sourceMappingURL=Brand.js.map