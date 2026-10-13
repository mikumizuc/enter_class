const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../popup.js'), 'utf8');

function openPopup(saved = {}, { readError = false, writeError = false } = {}) {
  let change;
  const toggle = { disabled: true, checked: false, addEventListener: (_, cb) => { change = cb; } };
  const status = { textContent: '' };
  const runtime = {};
  vm.runInNewContext(source, {
    document: { getElementById: (id) => id === 'auto-enter' ? toggle : status },
    chrome: {
      runtime,
      storage: { local: {
        get: (defaults, callback) => {
          runtime.lastError = readError ? { message: 'Read failed' } : undefined;
          callback({ ...defaults, ...saved });
        },
        set: (values, callback) => {
          runtime.lastError = writeError ? { message: 'Write failed' } : undefined;
          if (!writeError) Object.assign(saved, values);
          callback();
        },
      } },
    },
  });
  return { toggle, status, change };
}

test('default is automatic and switching persists across popup reopen', () => {
  const saved = {};
  const popup = openPopup(saved);
  assert.equal(popup.toggle.checked, true);
  assert.equal(popup.toggle.disabled, false);
  popup.toggle.checked = false;
  popup.change();
  assert.equal(saved.autoEnter, false);
  assert.match(popup.status.textContent, /保存しました/u);
  const reopened = openPopup(saved);
  assert.equal(reopened.toggle.checked, false);
  reopened.toggle.checked = true;
  reopened.change();
  assert.equal(saved.autoEnter, true);
  assert.equal(openPopup(saved).toggle.checked, true);
});

test('read failure keeps the toggle disabled and reports the error', () => {
  const popup = openPopup({}, { readError: true });
  assert.equal(popup.toggle.disabled, true);
  assert.match(popup.status.textContent, /読み込めません/u);
});

test('write failure restores the toggle and preserves the saved setting', () => {
  const saved = { autoEnter: true };
  const popup = openPopup(saved, { writeError: true });
  popup.toggle.checked = false;
  popup.change();
  assert.equal(popup.toggle.checked, true);
  assert.equal(popup.toggle.disabled, false);
  assert.equal(saved.autoEnter, true);
  assert.match(popup.status.textContent, /保存できません/u);
});
