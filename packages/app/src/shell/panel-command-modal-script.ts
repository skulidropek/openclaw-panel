export const panelCommandModalScript = String.raw`
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
`
