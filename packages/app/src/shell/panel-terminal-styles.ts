export const panelTerminalStyles = String.raw`
  .terminal-card {
    height: calc(100dvh - 124px);
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(244, 249, 255, 0.84)),
      radial-gradient(circle at 0% 0%, rgba(18, 110, 226, 0.08), transparent 34%);
  }
  body.create-route .terminal-card {
    height: 100%;
    min-height: 0;
  }
  .terminal-top {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: flex-start;
    min-width: 0;
    padding: 18px 20px 10px;
  }
  .terminal-heading {
    display: grid;
    min-width: 0;
    gap: 6px;
  }
  .terminal-heading .eyebrow { margin-bottom: 0; }
  .terminal-top h2 {
    overflow: hidden;
    font-size: clamp(22px, 2.4vw, 32px);
    line-height: 1;
    letter-spacing: -0.05em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .terminal-heading p:last-child {
    max-width: 680px;
    color: #5d7598;
    font-size: 15px;
    line-height: 1.45;
  }
  .terminal-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    align-items: center;
  }
  .terminal-actions a {
    background: #eef5ff;
    color: #126ee2;
  }
  .terminal-help {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 20px 14px;
  }
  .terminal-help span {
    border: 1px solid #d8e5f4;
    border-radius: 999px;
    padding: 7px 10px;
    background: rgba(255, 255, 255, 0.74);
    color: #526b8d;
    font-size: 13px;
    font-weight: 850;
  }
  .terminal {
    display: grid;
    grid-template-rows: 10px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    margin: 0 14px 14px;
    overflow: hidden;
    border: 1px solid rgba(111, 139, 175, 0.34);
    border-radius: 24px;
    background: #07111f;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.07),
      0 24px 60px rgba(7, 17, 31, 0.2);
  }
  .terminal::before {
    display: block;
    height: 10px;
    background: linear-gradient(90deg, #193452, #0d1b2d);
    content: "";
  }
  .terminal:focus-within, .terminal:focus {
    outline: 4px solid rgba(18, 110, 226, 0.18);
    outline-offset: -4px;
  }
  .terminal .xterm {
    min-height: 0;
    width: 100%;
    max-width: 100%;
    height: 100%;
    padding: 18px 20px 20px;
  }
  .terminal .xterm-screen {
    max-width: 100%;
  }
  .terminal .xterm-viewport {
    overflow-x: hidden !important;
    overflow-y: auto !important;
    scrollbar-color: #536986 #07111f;
    scrollbar-width: thin;
  }
`
