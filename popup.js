"use strict";

const toggle = document.getElementById("auto-enter");
const status = document.getElementById("status");

chrome.storage.local.get({ autoEnter: true }, (settings) => {
  if (chrome.runtime.lastError) {
    status.textContent = "設定を読み込めませんでした。開き直してください。";
    return;
  }
  toggle.checked = Boolean(settings.autoEnter);
  toggle.disabled = false;
  status.textContent = "";
});

toggle.addEventListener("change", () => {
  const enabled = toggle.checked;
  toggle.disabled = true;
  chrome.storage.local.set({ autoEnter: enabled }, () => {
    if (chrome.runtime.lastError) {
      toggle.checked = !enabled;
      status.textContent = "保存できませんでした。もう一度お試しください。";
    } else {
      status.textContent = "保存しました。CLASS のページを再読み込みしてください。";
    }
    toggle.disabled = false;
  });
});
