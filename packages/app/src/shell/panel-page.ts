import type { PanelConfig } from "@effect-template/lib"

import { panelScript } from "./panel-script.js"
import { panelStyles } from "./panel-styles.js"

const pageHead = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OpenClaw Panel</title>
  <link rel="stylesheet" href="/assets/xterm.css" />
  <style>${panelStyles}</style>
</head>
<body>
<main class="shell">
`

const appHeader = (config: PanelConfig): string =>
  String.raw`
  <header class="topbar">
    <a class="brand" href="/create" data-route="/create">
      <span>OpenClaw</span>
      <strong>Panel</strong>
    </a>
    <nav class="nav" aria-label="Primary">
      <a href="/create" data-route="/create">Create</a>
      <a href="/bots" data-route="/bots">Bots <span id="nav-bot-count">0</span></a>
    </nav>
    <div class="status-strip">
      <span id="diagnostics">Checking Docker...</span>
      <span>Gateway ${config.baseGatewayPort}+</span>
    </div>
  </header>`

const createPage = String.raw`
  <section id="page-create" class="page create-page">
    <div id="create-start" class="hero-card">
      <div class="copy">
        <p class="eyebrow">New instance</p>
        <h1>Create OpenClaw bot</h1>
        <p>Give it a name and intent. The panel creates an isolated Docker container, then OpenClaw handles model setup in its native onboarding terminal.</p>
      </div>
      <form id="create-form" class="create-form">
        <label for="bot-name">Bot name</label>
        <div class="create-row">
          <input id="bot-name" name="name" placeholder="sales-helper" autocomplete="off" required />
        </div>
        <label>Bot intent
          <textarea name="rawIntent" rows="5" placeholder="Describe what this bot should do."></textarea>
        </label>
        <div class="create-actions">
          <button id="create-button" type="submit">Create bot</button>
          <button id="copy-command-button" class="secondary" type="button">Copy CLI command</button>
        </div>
        <p id="deployment-status" class="form-note">OpenClaw will guide model and channel setup after the container starts.</p>
      </form>
    </div>
    <section id="terminal-card" class="terminal-card hidden">
      <div class="terminal-top">
        <div class="terminal-heading">
          <p class="eyebrow">Guided onboarding</p>
          <h2 id="terminal-title">Interactive terminal</h2>
          <p>Answer OpenClaw prompts here. This is the native OpenClaw terminal, wrapped for easier setup.</p>
        </div>
        <div class="terminal-actions">
          <span id="terminal-status">Idle</span>
          <a href="/bots" data-route="/bots">View bots</a>
        </div>
      </div>
      <div class="terminal-help" aria-label="Terminal usage tips">
        <span>Click inside to type</span>
        <span>Enter submits</span>
        <span>Arrows navigate</span>
        <span>Paste works</span>
      </div>
      <div id="setup-progress" class="setup-progress hidden" aria-live="polite">
        <span class="setup-spinner" aria-hidden="true"></span>
        <div>
          <strong id="setup-progress-title">Loading...</strong>
          <p id="setup-progress-detail">Waiting for OpenClaw setup.</p>
        </div>
      </div>
      <div id="terminal" class="terminal" tabindex="0" aria-label="OpenClaw onboarding terminal"></div>
    </section>
  </section>`

const botsPage = String.raw`
  <section id="page-bots" class="page bots-page">
    <aside class="bots-sidebar">
      <div class="section-head">
        <div>
          <p class="eyebrow">Instances</p>
          <h1>Bots</h1>
        </div>
        <a class="small-link" href="/create" data-route="/create">New</a>
      </div>
      <div id="bots" class="bot-list">Loading...</div>
    </aside>
    <section id="bot-detail" class="bot-detail">
      <div class="empty-state">
        <h2>Select a bot</h2>
        <p>Choose an instance from the list to view status, logs, and actions.</p>
      </div>
    </section>
  </section>`

const commandModal = String.raw`
  <div id="command-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="command-modal-title">
    <div class="modal-panel">
      <div class="modal-head">
        <div>
          <p class="eyebrow">Reproducible deploy</p>
          <h2 id="command-modal-title">CLI command</h2>
        </div>
        <button id="command-modal-close" class="icon-button" type="button" aria-label="Close">×</button>
      </div>
      <p class="secret-warning">This command contains inline gateway/API secrets. Do not send it to chats or tickets.</p>
      <label>Full Docker + OpenClaw bootstrap
        <textarea id="command-output" class="command-output" rows="16" readonly></textarea>
      </label>
      <label>Native OpenClaw part
        <textarea id="openclaw-command-output" class="command-output compact" rows="4" readonly></textarea>
      </label>
      <div class="modal-actions">
        <button id="command-copy-confirm" type="button">Copy full command</button>
        <button id="command-modal-cancel" class="secondary" type="button">Close</button>
      </div>
    </div>
  </div>
`

const bundleModal = String.raw`
  <div id="bundle-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="bundle-modal-title">
    <div class="modal-panel">
      <div class="modal-head">
        <div>
          <p class="eyebrow">Portable bot image</p>
          <h2 id="bundle-modal-title">Copy bot</h2>
        </div>
        <button id="bundle-modal-close" class="icon-button" type="button" aria-label="Close">×</button>
      </div>
      <p id="bundle-warning" class="secret-warning muted">Share bundle excludes OpenClaw config, chat history, cache, and common secret files.</p>
      <fieldset class="bundle-mode-group">
        <legend>Export mode</legend>
        <label class="bundle-mode-option">
          <input id="bundle-mode-share" type="radio" name="bundle-mode" value="share" checked />
          <span><strong>Share</strong><small>Role and workspace state without OpenClaw secrets.</small></span>
        </label>
        <label class="bundle-mode-option danger-option">
          <input id="bundle-mode-private" type="radio" name="bundle-mode" value="private" />
          <span><strong>Private backup</strong><small>Full .openclaw state with tokens and history.</small></span>
        </label>
      </fieldset>
      <label>One-line install command
        <textarea id="bundle-output" class="command-output compact" rows="5" readonly></textarea>
      </label>
      <p id="bundle-status" class="form-note">Bundle exports expire after 24 hours.</p>
      <div class="modal-actions">
        <button id="bundle-create-button" type="button">Create bundle</button>
        <button id="bundle-copy-confirm" class="secondary" type="button">Copy command</button>
        <button id="bundle-modal-cancel" class="secondary" type="button">Close</button>
      </div>
    </div>
  </div>
`

const pageModals = `${commandModal}${bundleModal}`

const pageSections = (config: PanelConfig): string =>
  String.raw`${appHeader(config)}
${createPage}
${botsPage}
${pageModals}`

export const panelPage = (config: PanelConfig): string => `${pageHead}${pageSections(config)}${panelScript}`
