/**
 * Host half of the bundle.
 *
 * The plugin lives entirely in the browser module (`client.js`): it reads the
 * ready-made session projections and adds nothing to the session journal, the
 * tools, or the agent context. The host half exists only because the profile
 * loader loads the package as a whole plugin.
 */
export function apply() {}
