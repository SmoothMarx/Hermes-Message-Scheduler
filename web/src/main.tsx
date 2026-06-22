import './index.css'
import { App } from './App'

const React = window.__HERMES_PLUGIN_SDK__?.React;

if (React && window.__HERMES_PLUGINS__) {
  window.__HERMES_PLUGINS__.register('scheduled-messages', App);
}
