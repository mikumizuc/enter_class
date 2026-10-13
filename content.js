(() => {
  "use strict";

  const selector = 'a, button, input[type="button"], input[type="submit"], input[type="image"], [role="button"]';

  function hasLabel(element, expected) {
    const labels = [
      element.textContent,
      element.value,
      element.getAttribute("aria-label"),
      element.getAttribute("alt"),
      ...Array.from(element.querySelectorAll("img[alt]"), (img) => img.alt),
    ];
    return labels.some((label) => label?.trim().replace(/^[✓✔✅\s]+/u, "").replace(/\s+/gu, "").toUpperCase() === expected);
  }

  function isAvailable(element) {
    if (element.matches(':disabled, [aria-disabled="true"]') ||
        element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility === "visible" &&
      element.getClientRects().length > 0;
  }

  function isCodeInput(input) {
    if (!(input instanceof Element) || !input.closest("input") ||
        !["text", "tel", "number"].includes(input.type) || input.disabled || input.readOnly) return false;
    const scope = input.form || document;
    if (!/認証コード/u.test(scope.textContent || scope.body?.textContent || "")) return false;
    return Array.from(document.querySelectorAll(selector)).some((button) =>
      hasLabel(button, "出席登録する") &&
      (!input.form || (button.form || button.closest("form")) === input.form));
  }

  const composing = new WeakSet();
  function normalizeCode(input, notify = false) {
    if (!isCodeInput(input) || composing.has(input)) return;
    const converted = input.value.replace(/[０-９]/gu,
      (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
    if (converted === input.value) return;
    const { selectionStart, selectionEnd, selectionDirection } = input;
    input.value = converted;
    if (selectionStart !== null && selectionStart !== undefined) {
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
    }
    if (notify) input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // サイトの入力ハンドラーより前に補正し、IME の未確定文字は変更しない。
  document.addEventListener("compositionstart", (event) => {
    const input = event.composedPath()[0];
    if (input instanceof Element) composing.add(input);
  }, true);
  document.addEventListener("compositionend", (event) => {
    const input = event.composedPath()[0];
    if (!(input instanceof Element)) return;
    composing.delete(input);
    normalizeCode(input, true);
  }, true);
  document.addEventListener("input", (event) => {
    if (!event.isComposing) normalizeCode(event.composedPath()[0]);
  }, true);

  function normalizeBeforeRegister(button) {
    for (const input of document.querySelectorAll("input")) {
      if (!input.form || (button.form || button.closest("form")) === input.form) {
        normalizeCode(input, true);
      }
    }
  }
  document.addEventListener("click", (event) => {
    const target = event.composedPath()[0];
    const button = target instanceof Element && target.closest(selector);
    if (button && hasLabel(button, "出席登録する") && isAvailable(button)) {
      normalizeBeforeRegister(button);
    }
  }, true);

  // 入口だけをページごとに一度、自動で進める。遅れて表示されるボタンも待つ。
  let entryClicked = false;
  let observer;
  let timeout;
  function stopWaiting() {
    observer?.disconnect();
    clearTimeout(timeout);
    window.removeEventListener("load", enterAutomatically);
  }
  function enterAutomatically() {
    if (entryClicked) return;
    const buttons = Array.from(document.querySelectorAll(selector))
      .filter((element) => hasLabel(element, "ENTER") && isAvailable(element));
    if (buttons.length !== 1) return;
    entryClicked = true;
    stopWaiting();
    buttons[0].click();
  }
  chrome.storage.local.get({ autoEnter: true }, (settings) => {
    // 設定の読み込みに失敗した場合は手動操作を残す。
    if (chrome.runtime.lastError || !settings.autoEnter) return;
    observer = new MutationObserver(enterAutomatically);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
    window.addEventListener("load", enterAutomatically);
    timeout = setTimeout(stopWaiting, 15000);
    enterAutomatically();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.repeat ||
        event.isComposing || event.keyCode === 229 || event.ctrlKey ||
        event.altKey || event.metaKey || event.shiftKey) return;

    const target = event.composedPath()[0];
    const available = Array.from(document.querySelectorAll(selector)).filter(isAvailable);
    const attendance = available.filter((element) => hasLabel(element, "出席登録する"));
    // 認証コード画面ではテキスト入力中にも登録ボタンを選ぶ。
    // フォームがある場合は入力と登録ボタンが同じフォームに属することを確認する。
    const input = target instanceof Element && target.closest('input');
    if (isCodeInput(input) && attendance.length === 1 &&
        (!input.form || (attendance[0].form || attendance[0].closest('form')) === input.form)) {
      event.preventDefault();
      normalizeBeforeRegister(attendance[0]);
      attendance[0].click();
      return;
    }

    // その他の入力・編集・フォーカス中のコントロールには本来の操作を残す。
    if (target instanceof Element && (target.isContentEditable ||
        target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])'))) return;

    const buttons = available.filter((element) =>
      hasLabel(element, "ENTER") || hasLabel(element, "出席登録する"));
    // 対象が曖昧な画面では誤クリックを避ける。
    if (buttons.length !== 1) return;

    event.preventDefault();
    if (hasLabel(buttons[0], "出席登録する")) normalizeBeforeRegister(buttons[0]);
    buttons[0].click();
  });
})();
