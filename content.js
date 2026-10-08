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
    const scope = input?.form || document;
    const isCodeInput = input && ["text", "tel", "number"].includes(input.type) &&
      !input.disabled && !input.readOnly && /認証コード/u.test(scope.textContent || scope.body?.textContent || "");
    if (isCodeInput && attendance.length === 1 &&
        (!input.form || (attendance[0].form || attendance[0].closest('form')) === input.form)) {
      event.preventDefault();
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
    buttons[0].click();
  });
})();
