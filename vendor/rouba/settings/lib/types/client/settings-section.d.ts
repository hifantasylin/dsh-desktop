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
import { type JSX } from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Full section props: the settings shell's runtime share. */
export type RoubaaiVideoSettingsSectionProps = PropsRuntime<'settings.section'>;
/**
 * Render the provider configuration section.
 * @param _props - the settings shell's runtime share (unused: this section
 * reads its state from the plugin's own route).
 * @returns the section element tree.
 */
export declare function RoubaaiVideoSettingsSection(_props: RoubaaiVideoSettingsSectionProps): JSX.Element;
//# sourceMappingURL=settings-section.d.ts.map