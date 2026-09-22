/** jsx/jsxs -> plain { type, props, key } nodes the test can walk. */

export function jsx(type, props, key) {
  return { type, props: props || {}, key }
}

export const jsxs = jsx
export const Fragment = Symbol('Fragment')
export default { jsx, jsxs, Fragment }
