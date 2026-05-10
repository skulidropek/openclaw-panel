export const panelBundleModalScript = String.raw`
const bundleModal = document.getElementById("bundle-modal");
const bundleModalClose = document.getElementById("bundle-modal-close");
const bundleModalCancel = document.getElementById("bundle-modal-cancel");
const bundleCreateButton = document.getElementById("bundle-create-button");
const bundleCopyConfirm = document.getElementById("bundle-copy-confirm");
const bundleOutput = document.getElementById("bundle-output");
const bundleStatus = document.getElementById("bundle-status");
const bundleWarning = document.getElementById("bundle-warning");
let bundleBotId = "";

const selectedBundleMode = () => {
  const checked = document.querySelector("input[name='bundle-mode']:checked");
  return checked ? checked.value : "share";
};
const updateBundleWarning = () => {
  const privateMode = selectedBundleMode() === "private";
  bundleWarning.classList.toggle("muted", !privateMode);
  bundleWarning.textContent = privateMode
    ? "Private backup contains OpenClaw config, gateway tokens, provider secrets, and chat history."
    : "Share bundle excludes OpenClaw config, chat history, cache, and common secret files.";
};
const showBundleModal = (botId) => {
  bundleBotId = botId;
  bundleOutput.value = "";
  bundleStatus.textContent = "Bundle exports expire after 24 hours.";
  bundleCreateButton.disabled = false;
  bundleCopyConfirm.disabled = true;
  updateBundleWarning();
  bundleModal.classList.remove("hidden");
};
const hideBundleModal = () => bundleModal.classList.add("hidden");
const createBundleExport = async () => {
  if (!bundleBotId) return;
  bundleCreateButton.disabled = true;
  bundleCopyConfirm.disabled = true;
  bundleStatus.textContent = "Creating bundle from Docker volume...";
  const result = await api(
    "/api/bots/" + encodeURIComponent(bundleBotId) + "/export-bundle",
    new URLSearchParams({ mode: selectedBundleMode() })
  );
  bundleCreateButton.disabled = false;
  if (result.error) {
    bundleOutput.value = "";
    bundleStatus.textContent = result.error;
    return;
  }
  bundleOutput.value = result.installCommand || "";
  bundleCopyConfirm.disabled = !bundleOutput.value;
  bundleStatus.textContent = result.containsSecrets
    ? "Private bundle ready. Keep this command private."
    : "Share bundle ready. The install command can recreate the bot image.";
  bundleOutput.focus();
  bundleOutput.select();
};
const copyBundleCommand = async () => {
  const text = bundleOutput.value;
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    bundleOutput.select();
    document.execCommand("copy");
  }
  bundleCopyConfirm.textContent = "Copied";
  window.setTimeout(() => {
    bundleCopyConfirm.textContent = "Copy command";
  }, 1400);
};
for (const input of document.querySelectorAll("input[name='bundle-mode']")) {
  input.addEventListener("change", updateBundleWarning);
}
bundleModalClose.addEventListener("click", hideBundleModal);
bundleModalCancel.addEventListener("click", hideBundleModal);
bundleCreateButton.addEventListener("click", createBundleExport);
bundleCopyConfirm.addEventListener("click", copyBundleCommand);
bundleModal.addEventListener("click", (event) => {
  if (event.target === bundleModal) hideBundleModal();
});
`
