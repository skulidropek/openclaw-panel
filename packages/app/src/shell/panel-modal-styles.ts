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
