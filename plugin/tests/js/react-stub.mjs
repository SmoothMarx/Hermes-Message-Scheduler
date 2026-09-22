/** Minimal React: enough for a component function to run outside a renderer. */

export function useCallback(fn) {
  return fn
}

export function useMemo(fn) {
  return fn()
}

export function useState(initial) {
  return [typeof initial === 'function' ? initial() : initial, () => {}]
}

export function useRef(value) {
  return { current: value }
}

export function useEffect() {
  /* effects are exercised explicitly by the test, not on render */
}

export function useContext() {
  return {}
}

export function createContext() {
  return {}
}

export class Component {
  constructor(props) {
    this.props = props
    this.state = {}
  }

  setState(next) {
    this.state = { ...this.state, ...next }
  }
}

export default { useCallback, useMemo, useState, useRef, useEffect, Component }
