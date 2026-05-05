export const panelScript = String.raw`</main>
<script src="/assets/xterm.js"></script>
<script src="/assets/xterm-addon-fit.js"></script>
<script>
const routeLinks = document.querySelectorAll("[data-route]");
const createPage = document.getElementById("page-create");
const botsPage = document.getElementById("page-bots");
const createStart = document.getElementById("create-start");
const terminalCard = document.getElementById("terminal-card");
const createForm = document.getElementById("create-form");
const createButton = document.getElementById("create-button");
const copyCommandButton = document.getElementById("copy-command-button");
const deploymentStatus = document.getElementById("deployment-status");
const terminalEl = document.getElementById("terminal");
const terminalTitle = document.getElementById("terminal-title");
const terminalStatus = document.getElementById("terminal-status");
const botsEl = document.getElementById("bots");
const botDetailEl = document.getElementById("bot-detail");
const navBotCount = document.getElementById("nav-bot-count");
const commandModal = document.getElementById("command-modal");
const commandOutput = document.getElementById("command-output");
const openClawCommandOutput = document.getElementById("openclaw-command-output");
const commandCopyConfirm = document.getElementById("command-copy-confirm");
const commandModalClose = document.getElementById("command-modal-close");
const commandModalCancel = document.getElementById("command-modal-cancel");
let bots = [];
let selectedBotId = "";
let socket = null;

const terminal = new Terminal({
  convertEol: true, cursorBlink: true,
  cursorStyle: "block",
  fontFamily: "JetBrains Mono, Menlo, Monaco, Consolas, monospace",
  fontSize: 22, fontWeight: 600, fontWeightBold: 800,
  letterSpacing: 0.1, lineHeight: 1.28, scrollback: 5000,
  theme: { background: "#07111f", cursor: "#ffffff", foreground: "#e6f0ff", selectionBackground: "#27466a" }
});
const fitAddon = new FitAddon.FitAddon();
terminal.loadAddon(fitAddon);
terminal.open(terminalEl);

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
})[character]);
const botUrl = (bot) => bot.adminUrl || ("/bot-admin/" + encodeURIComponent(bot.id) + "/");
const socketReady = () => socket && socket.readyState === WebSocket.OPEN;
let pendingTerminalFit = 0;
const fitTerminal = () => {
  if (pendingTerminalFit) window.cancelAnimationFrame(pendingTerminalFit);
  pendingTerminalFit = window.requestAnimationFrame(() => {
    pendingTerminalFit = 0;
    if (!terminalEl.offsetParent) return;
    fitAddon.fit();
    sendTerminalMessage({ type: "resize", cols: terminal.cols, rows: terminal.rows });
  });
};
const sendTerminalMessage = (message) => {
  if (socketReady()) socket.send(JSON.stringify(message));
};
const safeCopySelection = () => { const text = terminal.getSelection(); if (text && navigator.clipboard?.writeText) navigator.clipboard.writeText(text); };
terminal.attachCustomKeyEventHandler((event) => {
  const blocked = event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
  if (blocked) { if (terminal.hasSelection()) safeCopySelection(); terminalStatus.textContent = terminal.hasSelection() ? "Copied" : "Ctrl+C blocked"; return false; }
  return true;
});
terminal.onData((data) => { if (data !== "\x03") sendTerminalMessage({ type: "input", data }); });
terminal.onResize((size) => sendTerminalMessage({ type: "resize", cols: size.cols, rows: size.rows }));
if ("ResizeObserver" in window) new ResizeObserver(() => fitTerminal()).observe(terminalEl);

const formParams = () => new URLSearchParams(new FormData(createForm));

const api = async (path, body) => (await fetch(path, {
  method: body ? "POST" : "GET",
  headers: body ? { "content-type": "application/x-www-form-urlencoded" } : {},
  body
})).json();

const showCommandModal = (result) => {
  commandOutput.value = result.error || result.command || "";
  openClawCommandOutput.value = result.error ? "" : (result.openClawCommand || "");
  commandModal.classList.remove("hidden");
  commandOutput.focus();
  commandOutput.select();
};
const hideCommandModal = () => commandModal.classList.add("hidden");
const copyCommandText = async () => {
  const text = commandOutput.value;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    commandOutput.select();
    document.execCommand("copy");
  }
  commandCopyConfirm.textContent = "Copied";
  window.setTimeout(() => {
    commandCopyConfirm.textContent = "Copy full command";
  }, 1400);
};
commandModalClose.addEventListener("click", hideCommandModal);
commandModalCancel.addEventListener("click", hideCommandModal);
commandCopyConfirm.addEventListener("click", () => { copyCommandText(); });
commandModal.addEventListener("click", (event) => {
  if (event.target === commandModal) hideCommandModal();
});

const pageName = () => location.pathname === "/bots" ? "bots" : "create";
const setRoute = (path) => {
  history.pushState({}, "", path);
  renderRoute();
};
const resetCreateForm = () => {
  createPage.classList.remove("onboarding-active"); createStart.classList.remove("hidden"); terminalCard.classList.add("hidden");
  deploymentStatus.textContent = "Ready to create.";
};
const renderRoute = () => {
  const current = pageName();
  document.body.classList.toggle("create-route", current === "create");
  createPage.classList.toggle("active", current === "create");
  botsPage.classList.toggle("active", current === "bots");
  for (const link of routeLinks) link.classList.toggle("active", link.getAttribute("href") === location.pathname);
  if (current === "bots") loadBots();
  if (current === "create" && !socketReady() && terminalStatus.textContent === "Closed") resetCreateForm();
  if (current === "create") fitTerminal();
};
for (const link of routeLinks) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setRoute(link.getAttribute("href") || "/create");
  });
}
window.addEventListener("popstate", renderRoute);
window.addEventListener("resize", fitTerminal);

const loadDiagnostics = async () => {
  const result = await api("/api/diagnostics");
  const docker = result.docker || {};
  document.getElementById("diagnostics").textContent = docker.ok ? "Docker ready" : "Docker unavailable";
};

const statusClass = (bot) => "badge " + (bot.status === "running" ? "ok" : "warn");
const renderBotList = () => {
  navBotCount.textContent = String(bots.length);
  if (bots.length === 0) {
    botsEl.innerHTML = "<div class='empty-state'><p>No bots yet.</p></div>";
    renderBotDetail(null);
    return;
  }
  if (!selectedBotId || !bots.some((bot) => bot.id === selectedBotId)) selectedBotId = bots[0].id;
  botsEl.innerHTML = bots.map((bot) =>
    "<div class='bot-card " + (bot.id === selectedBotId ? "active" : "") + "' data-id='" + escapeHtml(bot.id) + "'>" +
    "<button class='bot-card-main' type='button' data-id='" + escapeHtml(bot.id) + "'>" +
    "<strong>" + escapeHtml(bot.name) + "</strong><span>" + escapeHtml(bot.status) + " · :" +
    escapeHtml(bot.hostGatewayPort) + "</span></button>" +
    "<button class='bot-card-command' type='button' data-list-command-id='" + escapeHtml(bot.id) + "'>CLI</button></div>"
  ).join("");
  renderBotDetail(bots.find((bot) => bot.id === selectedBotId) || bots[0]);
};

const detailMetric = (label, value) =>
  "<div class='metric'><small>" + escapeHtml(label) + "</small><strong>" + escapeHtml(value) + "</strong></div>";
const renderBotDetail = (bot) => {
  if (!bot) {
    botDetailEl.innerHTML = "<div class='empty-state'><h2>No bots yet</h2><p>Create your first bot to manage it here.</p></div>";
    return;
  }
  botDetailEl.innerHTML =
    "<div class='detail-title'><div><p class='eyebrow'>Selected bot</p><h1>" + escapeHtml(bot.name) +
    "</h1></div><span class='" + statusClass(bot) + "'>" + escapeHtml(bot.status) + "</span></div>" +
    "<div class='detail-grid'>" +
    detailMetric("Gateway", ":" + bot.hostGatewayPort) +
    detailMetric("Created", bot.createdAt || "unknown") +
    detailMetric("Updated", bot.updatedAt || "unknown") +
    detailMetric("Bot ID", bot.id) +
    "</div><div class='actions'>" +
    "<a class='primary-link' target='_blank' rel='noreferrer' href='" + escapeHtml(botUrl(bot)) + "'>Open OpenClaw</a>" +
    "<button class='secondary' data-command-id='" + escapeHtml(bot.id) + "'>CLI command</button>" +
    "<button class='secondary' data-action='onboard' data-id='" + escapeHtml(bot.id) + "'>Onboard</button>" +
    "<button class='secondary' data-action='status' data-id='" + escapeHtml(bot.id) + "'>Status</button>" +
    "<button class='secondary' data-action='restart' data-id='" + escapeHtml(bot.id) + "'>Restart</button>" +
    "<button class='secondary' data-action='logs' data-id='" + escapeHtml(bot.id) + "'>Logs</button>" +
    "<button class='danger' data-action='delete' data-id='" + escapeHtml(bot.id) + "'>Delete</button>" +
    "</div><pre id='bot-logs' class='logs'>Logs will appear here.</pre>";
};

const loadBots = async () => {
  const result = await api("/api/bots");
  bots = result.bots || [];
  renderBotList();
};

botsEl.addEventListener("click", (event) => {
  const commandButton = event.target.closest("[data-list-command-id]");
  if (commandButton) {
    const commandId = commandButton.dataset.listCommandId || "";
    if (commandId) api("/api/bots/" + encodeURIComponent(commandId) + "/export-command").then(showCommandModal);
    return;
  }
  const card = event.target.closest(".bot-card");
  if (!card) return;
  selectedBotId = card.dataset.id || "";
  renderBotList();
});

const showTerminal = (bot) => {
  createPage.classList.add("onboarding-active"); createStart.classList.add("hidden"); terminalCard.classList.remove("hidden");
  window.scrollTo(0, 0);
  terminalTitle.textContent = bot ? "Onboarding · " + bot.name : "Interactive terminal";
  window.requestAnimationFrame(() => {
    fitTerminal();
    terminal.focus();
  });
};

const connectOnboarding = (sessionId, bot) => {
  if (socket) socket.close();
  showTerminal(bot);
  terminal.clear();
  terminal.reset();
  terminalStatus.textContent = "Connecting";
  socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/onboarding/" + sessionId);
  socket.onmessage = (event) => terminal.write(event.data);
  socket.onclose = () => {
    terminalStatus.textContent = "Closed";
    terminal.write("\r\n[session closed]\r\n");
    loadBots();
  };
  socket.onopen = () => {
    terminalStatus.textContent = "Interactive";
    fitTerminal();
    terminal.focus();
    sendTerminalMessage({ type: "resize", cols: terminal.cols, rows: terminal.rows });
  };
};

const runAction = async (id, name) => {
  if (name === "delete" && !confirm("Delete this bot and its volume?")) return;
  const result = await api("/api/bots/" + encodeURIComponent(id) + "/actions", new URLSearchParams({ action: name }));
  if (result.sessionId) {
    setRoute("/create");
    connectOnboarding(result.sessionId, result.bot);
    return;
  }
  await loadBots();
  const logsEl = document.getElementById("bot-logs");
  if (logsEl && result.logs) logsEl.textContent = result.logs;
};

botDetailEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const commandId = target.dataset.commandId;
  if (commandId) {
    api("/api/bots/" + encodeURIComponent(commandId) + "/export-command").then(showCommandModal);
    return;
  }
  const id = target.dataset.id;
  const action = target.dataset.action;
  if (id && action) runAction(id, action);
});

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  createButton.disabled = true;
  deploymentStatus.textContent = "Creating container and opening onboarding...";
  const result = await api("/api/bots", formParams());
  createButton.disabled = false;
  if (result.error) {
    deploymentStatus.textContent = result.error;
    return;
  }
  selectedBotId = result.bot.id;
  deploymentStatus.textContent = "Container is running.";
  connectOnboarding(result.sessionId, result.bot);
});

copyCommandButton.addEventListener("click", async () => {
  copyCommandButton.disabled = true;
  deploymentStatus.textContent = "Generating reproducible CLI command...";
  const result = await api("/api/bots/preview-command", formParams());
  copyCommandButton.disabled = false;
  if (result.error) {
    deploymentStatus.textContent = result.error;
    return;
  }
  deploymentStatus.textContent = "CLI command generated.";
  showCommandModal(result);
});

loadDiagnostics();
loadBots();
renderRoute();
</script>
</body>
</html>`
