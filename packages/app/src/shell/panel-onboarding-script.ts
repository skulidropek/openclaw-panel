export const panelOnboardingScript = String.raw`
let activeOnboardingSessionId = "";
let onboardingReachedHandoff = false;
let terminalLiveViewport = false;
let pendingTerminalViewport = 0;

const setTerminalLiveViewport = (enabled) => {
  terminalLiveViewport = enabled;
  terminalCard.classList.toggle("live-viewport", enabled);
};
const keepTerminalLiveViewport = () => {
  if (pendingTerminalViewport) window.cancelAnimationFrame(pendingTerminalViewport);
  pendingTerminalViewport = window.requestAnimationFrame(() => {
    pendingTerminalViewport = 0;
    if (!terminalLiveViewport || !terminalEl.offsetParent) return;
    terminal.scrollToBottom();
  });
};
const observeOnboardingOutput = (text) => {
  if (text.includes("Onboarding complete") || text.includes("[finalizing OpenClaw daemon]")) {
    onboardingReachedHandoff = true;
    terminalStatus.textContent = "Finishing setup";
  }
  if (text.includes("[OpenClaw daemon ready]")) {
    onboardingReachedHandoff = true;
    terminalStatus.textContent = "Ready";
  }
  if (text.includes("[daemon finalize error]")) {
    onboardingReachedHandoff = true;
    terminalStatus.textContent = "Opening bot";
  }
};
const openSelectedBotAfterOnboarding = (bot) => {
  if (!bot || !bot.id) return;
  selectedBotId = bot.id;
  terminalStatus.textContent = "Opening bot";
  terminal.write("\r\n[opening selected bot in panel]\r\n", keepTerminalLiveViewport);
  window.setTimeout(() => {
    selectedBotId = bot.id;
    setRoute("/bots");
  }, 700);
};
const safeCopySelection = () => { const text = terminal.getSelection(); if (text && navigator.clipboard?.writeText) navigator.clipboard.writeText(text); };
terminal.attachCustomKeyEventHandler((event) => {
  const blocked = event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
  if (blocked) { if (terminal.hasSelection()) safeCopySelection(); terminalStatus.textContent = terminal.hasSelection() ? "Copied" : "Ctrl+C blocked"; return false; }
  return true;
});
terminal.onData((data) => { if (data !== "\x03") sendTerminalMessage({ type: "input", data }); });
terminal.onResize((size) => { keepTerminalLiveViewport(); sendTerminalMessage({ type: "resize", cols: size.cols, rows: size.rows }); });
if ("ResizeObserver" in window) new ResizeObserver(() => fitTerminal()).observe(terminalEl);
`
