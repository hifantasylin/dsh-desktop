import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client';
type RoubaBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps;
/**
 * Render the Rouba mark with the presentation requested by its host surface.
 * Reuses the shared fish mark until a distinct Rouba logo is supplied.
 * @param props - Host-supplied mark presentation.
 * @returns the shared fish mark.
 */
export declare function RoubaBrandMark({ size, className }: RoubaBrandMarkProps): import("react").JSX.Element;
/**
 * Render the Rouba name artwork without its independently slotted mark.
 * @returns the "Rouba DSH" name wordmark.
 */
export declare function RoubaBrandName(): import("react").JSX.Element;
export {};
//# sourceMappingURL=Brand.d.ts.map