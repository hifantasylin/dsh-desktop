import { RoubaBrandMark, RoubaBrandName } from "./Brand.js";
/** Required service: the UI slot registry. */
export const inject = ['slots'];
/**
 * Fill every shipped brand slot as one declaration-aware registration set.
 * Rouba owns the brand slots unconditionally: deployments that mount this
 * plugin are Rouba-branded and must disable the official occupant.
 * @param ctx - Client root context.
 */
export function apply(ctx) {
    ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.inject('sidebar.brand.name', () => ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' }, RoubaBrandMark);
        yield ctx.slots.register({ name: 'sidebar.brand.name' }, RoubaBrandName);
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, RoubaBrandMark);
    })));
}
//# sourceMappingURL=index.js.map