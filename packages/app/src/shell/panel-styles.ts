import { panelListStyles } from "./panel-list-styles.js"
import { panelModalStyles } from "./panel-modal-styles.js"
import { panelResponsiveStyles } from "./panel-responsive-styles.js"

export const panelStyles = String.raw`
  :root {
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #eef3f8;
    color: #10233d;
  }
  * { box-sizing: border-box; }
  html, body {
    min-height: 100%;
    overflow-x: hidden;
  }
  body {
    margin: 0;
    background:
      radial-gradient(circle at 8% 4%, rgba(158, 218, 255, 0.22), transparent 30%),
      linear-gradient(135deg, #f7fbff 0%, #e7edf4 100%);
  }
  a { color: inherit; text-decoration: none; }
  h1, h2, p { margin: 0; }
  button, input, select, textarea { font: inherit; }
  .shell {
    width: calc(100vw - clamp(16px, 2.5vw, 40px));
    min-height: 100vh;
    margin: 0 auto;
    padding: clamp(10px, 1.8vh, 20px) 0;
  }
  .topbar {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) auto minmax(220px, 1fr);
    gap: 12px;
    align-items: center;
    margin-bottom: clamp(10px, 1.8vh, 18px);
    min-width: 0;
  }
  .brand {
    display: inline-grid;
    width: fit-content;
    color: #10233d;
    letter-spacing: -0.04em;
  }
  .brand span { color: #5d7598; font-size: 12px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; }
  .brand strong { font-size: 28px; line-height: 1; }
  .nav {
    display: flex;
    gap: 6px;
    padding: 6px;
    border: 1px solid #d8e2ee;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.66);
  }
  .nav a, .small-link, .primary-link, .terminal-actions a {
    border-radius: 13px;
    padding: 10px 14px;
    color: #4d6688;
    font-weight: 800;
  }
  .nav a.active {
    background: #10233d;
    color: #fff;
    box-shadow: 0 10px 24px rgba(16, 35, 61, 0.18);
  }
  .status-strip { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .status-strip span, .badge, #terminal-status {
    border: 1px solid #d8e2ee;
    border-radius: 999px;
    padding: 8px 11px;
    background: rgba(255, 255, 255, 0.72);
    color: #526b8d;
    font-size: 13px;
    font-weight: 800;
  }
  .page { display: none; }
  .page.active { display: block; }
  .page, .topbar > *, .hero-card, .terminal-card, .bots-page, .bots-sidebar, .bot-detail {
    min-width: 0;
  }
  .hero-card, .terminal-card, .bots-sidebar, .bot-detail {
    border: 1px solid #dce6f1;
    border-radius: 28px;
    background: rgba(255, 255, 255, 0.78);
    box-shadow: 0 24px 70px rgba(52, 72, 96, 0.12);
  }
  .hero-card {
    min-height: calc(100dvh - 124px);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 470px);
    gap: clamp(20px, 3vw, 42px);
    align-items: center;
    padding: clamp(22px, 4vw, 58px);
  }
  .copy h1 {
    max-width: 680px;
    color: #10233d;
    font-size: clamp(44px, 7vw, 88px);
    line-height: 0.94;
    letter-spacing: -0.07em;
  }
  .copy p:last-child { max-width: 570px; margin-top: 20px; color: #526b8d; font-size: 18px; line-height: 1.55; }
  .eyebrow {
    margin-bottom: 10px;
    color: #6b82a2;
    font: 800 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.22em;
    text-transform: uppercase;
  }
  .create-form {
    display: grid;
    gap: 12px;
    border: 1px solid #d8e2ee;
    border-radius: 24px;
    padding: 18px;
    background: rgba(248, 251, 255, 0.86);
  }
  label { display: grid; gap: 8px; color: #526b8d; font-size: 13px; font-weight: 850; }
  .create-row { display: grid; gap: 10px; }
  input, select, textarea {
    width: 100%;
    border: 1px solid #cfdbe9;
    border-radius: 16px;
    outline: none;
    background: #fff;
    color: #10233d;
  }
  input, select {
    height: 52px;
    padding: 0 16px;
  }
  textarea {
    min-height: 104px;
    padding: 14px 16px;
    resize: vertical;
  }
  input:focus, select:focus, textarea:focus {
    border-color: #126ee2;
    box-shadow: 0 0 0 4px rgba(18, 110, 226, 0.12);
  }
  .create-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .advanced-fields {
    border: 1px solid #d8e2ee;
    border-radius: 18px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.64);
  }
  .advanced-fields summary {
    cursor: pointer;
    color: #10233d;
    font-weight: 900;
  }
  .advanced-fields[open] summary { margin-bottom: 14px; }
  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }
  button {
    min-height: 52px;
    border: 0;
    border-radius: 16px;
    padding: 0 18px;
    background: #126ee2;
    color: #fff;
    cursor: pointer;
    font-weight: 900;
    box-shadow: 0 16px 32px rgba(18, 110, 226, 0.22);
  }
  button.secondary { border: 1px solid #d8e2ee; background: #fff; color: #10233d; box-shadow: none; }
  button.danger { background: #ef5f72; box-shadow: 0 14px 28px rgba(239, 95, 114, 0.2); }
  button:disabled { cursor: progress; opacity: 0.58; }
  .form-note { color: #5d7598; font-size: 14px; }
  .hidden { display: none !important; }
  .terminal-card {
    height: calc(100dvh - 124px);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }
  .terminal-top {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    min-width: 0;
  }
  .terminal-top h2 {
    overflow: hidden;
    font-size: clamp(19px, 2vw, 24px);
    letter-spacing: -0.03em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .terminal-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; align-items: center; }
  .terminal-actions a { background: #eef5ff; color: #126ee2; }
  .terminal {
    min-height: 0;
    min-width: 0;
    margin: 0 8px 8px;
    overflow: hidden;
    border-radius: 18px;
    background: #07111f;
  }
  .terminal:focus-within, .terminal:focus {
    outline: 3px solid rgba(18, 110, 226, 0.26);
    outline-offset: -3px;
  }
  .terminal .xterm {
    width: 100%;
    max-width: 100%;
    height: 100%;
    padding: 6px;
  }
  .terminal .xterm-screen {
    max-width: 100%;
  }
  .terminal .xterm-viewport {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scrollbar-color: #41526b #07111f;
    scrollbar-width: thin;
  }
  .bots-page {
    min-height: calc(100dvh - 124px);
    display: none;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    gap: 14px;
  }
  .bots-page.active { display: grid; }
  .bots-sidebar, .bot-detail { padding: 18px; }
  .section-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 16px; }
  .section-head h1 { font-size: 32px; letter-spacing: -0.05em; }
  .small-link { background: #eef5ff; color: #126ee2; }
  .primary-link { background: #126ee2; color: #fff; box-shadow: 0 16px 32px rgba(18, 110, 226, 0.18); }
  .detail-title {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 18px;
  }
  .detail-title h1 {
    font-size: clamp(34px, 5vw, 58px);
    line-height: 1;
    letter-spacing: -0.07em;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 14px;
  }
  .metric {
    min-height: 96px;
    border: 1px solid #dce6f1;
    border-radius: 18px;
    padding: 14px;
    background: rgba(248, 251, 255, 0.78);
  }
  .metric small {
    color: #6b82a2;
    font: 800 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .metric strong { display: block; margin-top: 8px; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0; }
  .logs {
    min-height: 170px;
    margin: 0;
    overflow: auto;
    border-radius: 18px;
    padding: 14px;
    background: #07111f;
    color: #d8e8ff;
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .empty-state {
    display: grid;
    min-height: 360px;
    place-content: center;
    color: #5d7598;
    text-align: center;
  }
${panelListStyles}
${panelModalStyles}
${panelResponsiveStyles}`
