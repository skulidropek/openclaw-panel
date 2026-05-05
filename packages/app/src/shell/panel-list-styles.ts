export const panelListStyles = String.raw`
  .bot-list {
    display: grid;
    gap: 10px;
    max-height: calc(100vh - 245px);
    overflow: auto;
    padding-right: 4px;
  }
  .bot-card {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid #dce6f1;
    border-radius: 18px;
    padding: 14px;
    background: rgba(248, 251, 255, 0.78);
    color: #10233d;
    text-align: left;
    box-shadow: none;
  }
  .bot-card.active { border-color: #126ee2; box-shadow: 0 0 0 4px rgba(18, 110, 226, 0.1); }
  .bot-card-main {
    min-height: auto;
    display: grid;
    min-width: 0;
    gap: 8px;
    border: 0;
    padding: 0;
    background: transparent;
    color: #10233d;
    text-align: left;
    box-shadow: none;
  }
  .bot-card-main strong { overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
  .bot-card-main span { color: #607797; font-size: 13px; }
  .bot-card-command {
    min-height: 38px;
    border: 1px solid #cfe0f5;
    border-radius: 13px;
    padding: 0 12px;
    background: #eef5ff;
    color: #126ee2;
    box-shadow: none;
    font-size: 13px;
  }
`
