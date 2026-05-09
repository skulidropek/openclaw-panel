export const panelOnboardingScript = String.raw`
let activeOnboardingSessionId = "";
let onboardingAccessLocked = false;
let onboardingFinalizeFailed = false;
let onboardingReadyForAccess = false;
let onboardingReachedHandoff = false;
let terminalLiveViewport = false;
let pendingTerminalViewport = 0;

const setupStageDetails = {
  "gateway-restart": "Applying gateway settings and restarting OpenClaw.",
  "identity-files": "Saving the bot role inside the OpenClaw workspace.",
  "identity-ready": "OpenClaw identity bootstrap is complete.",
  "role-chat": "Sending the role to OpenClaw chat and waiting for the identity response."
};
const setOnboardingAccessLocked = (locked) => {
  onboardingAccessLocked = locked;
  document.body.classList.toggle("onboarding-locked", locked);
  for (const link of routeLinks) {
    if (link.getAttribute("href") === "/bots") link.setAttribute("aria-disabled", locked ? "true" : "false");
  }
};
const setSetupProgress = (title, detail, complete = false) => {
  setupProgress.classList.remove("hidden");
  setupProgress.classList.toggle("complete", complete);
  setupProgressTitle.textContent = title;
  setupProgressDetail.textContent = detail;
};
const resetSetupProgress = () => {
  setupProgress.classList.add("hidden");
  setupProgress.classList.remove("complete");
  setupProgressTitle.textContent = "Loading...";
  setupProgressDetail.textContent = "Waiting for OpenClaw setup.";
};
const showSetupBlockedMessage = () => {
  setSetupProgress("Loading...", "Finish setup first. Bots and OpenClaw access unlock after the role is sent and identity bootstrap completes.");
  terminalStatus.textContent = "Loading...";
};
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
    setOnboardingAccessLocked(true);
    setSetupProgress("Loading...", "Native onboarding is complete. Finalizing OpenClaw before access is enabled.");
    terminalStatus.textContent = "Loading...";
  }
  const stageMatch = /\[setup-stage:([^\]]+)\]\s*([^\r\n]+)/u.exec(text);
  if (stageMatch) {
    const stage = stageMatch[1] || "";
    const fallback = stageMatch[2] || "Continuing setup.";
    const detail = setupStageDetails[stage] || fallback;
    const complete = stage === "identity-ready";
    onboardingReadyForAccess = complete;
    setSetupProgress(complete ? "Ready" : "Loading...", detail, complete);
    terminalStatus.textContent = complete ? "Ready" : "Loading...";
  }
  if (text.includes("[OpenClaw daemon ready]")) {
    onboardingReachedHandoff = true;
    if (onboardingReadyForAccess) {
      setSetupProgress("Ready", "OpenClaw is ready. Opening the bot panel.", true);
      terminalStatus.textContent = "Ready";
    }
  }
  if (text.includes("[daemon finalize error]")) {
    onboardingAccessLocked = false;
    onboardingFinalizeFailed = true;
    setOnboardingAccessLocked(false);
    setSetupProgress("Setup failed", "OpenClaw did not finish setup. Check the terminal output before opening the bot.", true);
    terminalStatus.textContent = "Setup failed";
  }
};
const openSelectedBotAfterOnboarding = (bot) => {
  if (!bot || !bot.id) return;
  if (!onboardingReadyForAccess) {
    showSetupBlockedMessage();
    return;
  }
  selectedBotId = bot.id;
  terminalStatus.textContent = "Opening bot";
  terminal.write("\r\n[opening selected bot in panel]\r\n", keepTerminalLiveViewport);
  window.setTimeout(() => {
    selectedBotId = bot.id;
    setOnboardingAccessLocked(false);
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
