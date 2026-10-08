(() => {
  "use strict";

  const selector = 'a, button, input[type="button"], input[type="submit"], input[type="image"], [role="button"]';

  function isEnterButton(element) {
    const labels = [
      element.textContent,
      element.value,
      element.getAttribute("aria-label"),
      element.getAttribute("alt"),
      ...Array.from(element.querySelectorAll("img[alt]"), (img) => img.alt),
    ];
    return labels.some((label) => label?.trim().toUpperCase() === "ENTER");
  }

  function isAvailable(element) {
    if (element.matches(':disabled, [aria-disabled="true"]') ||
        element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility === "visible" &&
      element.getClientRects().length > 0;
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.repeat ||
        event.isComposing || event.keyCode === 229 || event.ctrlKey ||
        event.altKey || event.metaKey || event.shiftKey) return;

    // 入力・編集・フォーカス中のコントロールにはブラウザ本来の Enter 操作を残す。
    const target = event.composedPath()[0];
    if (target instanceof Element && (target.isContentEditable ||
        target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])'))) return;

    const buttons = Array.from(document.querySelectorAll(selector))
      .filter((element) => isEnterButton(element) && isAvailable(element));
    // 対象が曖昧な画面では誤クリックを避ける。
    if (buttons.length !== 1) return;

    event.preventDefault();
    buttons[0].click();
  });
})();
