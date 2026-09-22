/**
 * Resolve hook: maps the two specifiers a desktop plugin may import (plus the
 * jsx runtime) onto local stubs, so plugin.js can be imported and rendered in
 * plain Node. Mirrors the procedure the desktop-plugin docs prescribe.
 */
export async function resolve(specifier, context, nextResolve) {
  const map = {
    '@hermes/plugin-sdk': './sdk-stub.mjs',
    react: './react-stub.mjs',
    'react/jsx-runtime': './jsx-stub.mjs'
  }
  const target = map[specifier]
  if (target) {
    return { url: new URL(target, import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
