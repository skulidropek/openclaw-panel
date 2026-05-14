export const panelModalStyles = String.raw`
  .modal {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(16, 35, 61, 0.34);
    backdrop-filter: blur(8px);
  }
  .modal-panel {
    width: min(920px, 100%);
    max-height: calc(100vh - 40px);
    overflow: auto;
    border: 1px solid #dce6f1;
    border-radius: 26px;
    padding: 18px;
    background: #f8fbff;
    box-shadow: 0 28px 90px rgba(16, 35, 61, 0.24);
  }
  .modal-head, .modal-actions {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
  }
  .modal-head { margin-bottom: 12px; }
  .modal-head h2 { font-size: 30px; letter-spacing: -0.05em; }
  .icon-button {
    width: 44px;
    min-height: 44px;
    padding: 0;
    border: 1px solid #d8e2ee;
    background: #fff;
    color: #10233d;
    box-shadow: none;
    font-size: 24px;
  }
  .secret-warning {
    margin-bottom: 12px;
    border: 1px solid #f1c8aa;
    border-radius: 16px;
    padding: 12px 14px;
    background: #fff7ed;
    color: #9a4b19;
    font-weight: 800;
  }
  .secret-warning.muted {
    border-color: #cfe0f3;
    background: #eef6ff;
    color: #31577f;
  }
  .bundle-mode-group {
    display: grid;
    gap: 10px;
    margin: 0 0 12px;
    border: 1px solid #d8e2ee;
    border-radius: 18px;
    padding: 12px;
    background: #fff;
  }
  .bundle-mode-group legend {
    padding: 0 6px;
    color: #526b8d;
    font-size: 13px;
    font-weight: 850;
  }
  .bundle-mode-option {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    border: 1px solid #d8e2ee;
    border-radius: 14px;
    padding: 12px;
    background: #f8fbff;
    color: #10233d;
  }
  .bundle-mode-option input {
    width: 18px;
    height: 18px;
    padding: 0;
  }
  .bundle-mode-option span {
    display: grid;
    gap: 3px;
    min-width: 0;
  }
  .bundle-mode-option small {
    color: #5d7598;
    font-size: 12px;
    font-weight: 750;
    overflow-wrap: anywhere;
  }
  .bundle-mode-option.danger-option {
    border-color: #f1c8aa;
    background: #fff7ed;
  }
  .command-output {
    min-height: 300px;
    margin-bottom: 12px;
    background: #07111f;
    color: #d8e8ff;
    font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow-x: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .command-output.compact { min-height: 108px; }
  .modal-actions { justify-content: flex-end; }
`
