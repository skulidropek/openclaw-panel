export const panelResponsiveStyles = String.raw`
  @media (max-width: 1900px) {
    .hero-card {
      grid-template-columns: minmax(0, 1fr);
      align-content: center;
      align-items: start;
    }
    .copy h1 {
      max-width: 760px;
      font-size: clamp(42px, 6vw, 76px);
    }
    .copy p:last-child { max-width: 560px; }
    .create-form {
      width: min(560px, 100%);
      justify-self: start;
    }
  }
  @media (max-width: 980px) {
    .shell { width: calc(100vw - 16px); padding: 8px 0; }
    .topbar {
      grid-template-columns: 1fr auto;
      align-items: start;
    }
    .nav { justify-self: end; }
    .status-strip {
      grid-column: 1 / -1;
      justify-content: flex-start;
    }
    .hero-card, .bots-page.active { grid-template-columns: 1fr; }
    .hero-card, .terminal-card, .bots-page { min-height: auto; }
    .terminal-card { height: calc(100dvh - 104px); }
    .detail-grid, .field-grid, .create-actions { grid-template-columns: 1fr; }
    .bot-list { max-height: none; }
  }
  @media (max-width: 560px) {
    .brand strong { font-size: 22px; }
    .nav {
      width: 100%;
      grid-column: 1 / -1;
    }
    .nav a {
      flex: 1;
      text-align: center;
    }
    .status-strip { display: none; }
    .hero-card, .terminal-card, .bots-sidebar, .bot-detail { border-radius: 20px; }
    .terminal-card { height: calc(100dvh - 92px); }
    .terminal-top { align-items: flex-start; }
    .terminal-actions a { display: none; }
  }
`
