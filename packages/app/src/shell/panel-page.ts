import type { PanelConfig } from "../core/bot.js"
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
        <p>Give it a name. The panel creates an isolated Docker container and opens the native onboarding terminal.</p>
      </div>
      <form id="create-form" class="create-form">
        <label for="bot-name">Bot name</label>
        <div class="create-row">
          <input id="bot-name" name="name" placeholder="sales-helper" autocomplete="off" required />
        </div>
        <details class="advanced-fields">
          <summary>Advanced CLI settings</summary>
          <div class="field-grid">
            <label>LLM base URL
              <input name="connectorBaseUrl" placeholder="https://api.openai.com/v1" autocomplete="off" />
            </label>
            <label>Model ID
              <input name="connectorModelId" placeholder="gpt-5.4" autocomplete="off" />
            </label>
            <label>API key
              <input name="connectorApiKey" placeholder="sk-..." autocomplete="off" />
            </label>
            <label>Provider ID
              <input name="connectorProviderId" placeholder="custom-openai" autocomplete="off" />
            </label>
            <label>Compatibility
              <select name="connectorCompatibility">
                <option value="openai">OpenAI-compatible</option>
                <option value="anthropic">Anthropic-compatible</option>
              </select>
            </label>
            <label>Telegram bot token
              <input name="telegramBotToken" placeholder="123456:telegram-secret" autocomplete="off" />
            </label>
          </div>
          <label>Bot intent
            <textarea name="rawIntent" rows="4" placeholder="Describe what this bot should do."></textarea>
          </label>
        </details>
        <div class="create-actions">
          <button id="create-button" type="submit">Create bot</button>
          <button id="copy-command-button" class="secondary" type="button">Copy CLI command</button>
        </div>
        <p id="deployment-status" class="form-note">Ready to create.</p>
      </form>
    </div>
    <section id="terminal-card" class="terminal-card hidden">
      <div class="terminal-top">
        <div>
          <p class="eyebrow">Onboarding</p>
          <h2 id="terminal-title">Interactive terminal</h2>
        </div>
        <div class="terminal-actions">
          <span id="terminal-status">Idle</span>
          <a href="/bots" data-route="/bots">View bots</a>
        </div>
      </div>
      <div id="terminal" class="terminal" tabindex="0"></div>
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

const pageSections = (config: PanelConfig): string =>
  String.raw`${appHeader(config)}
${createPage}
${botsPage}
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

export const panelPage = (config: PanelConfig): string => `${pageHead}${pageSections(config)}${panelScript}`
