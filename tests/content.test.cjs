const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');

class Element {
  constructor(options = {}) {
    Object.assign(this, {
      textContent: '', value: '', attrs: {}, images: [], clicks: 0,
      disabled: false, hidden: false, control: false, isContentEditable: false,
      type: 'text', input: false, form: null, readOnly: false,
      events: [], selectionStart: null, selectionEnd: null, selectionDirection: 'none',
      style: { display: 'block', visibility: 'visible' }, rects: [{}],
    }, options);
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelectorAll() { return this.images; }
  matches() { return this.disabled || this.attrs['aria-disabled'] === 'true'; }
  closest(selector) {
    if (selector === 'input') return this.input ? this : null;
    if (selector === 'form') return this.form;
    if (selector.startsWith('a, button')) return this.input ? null : this;
    return (selector.startsWith('[hidden]') ? this.hidden : this.control) ? this : null;
  }
  getClientRects() { return this.rects; }
  click() { this.clicks++; }
  dispatchEvent(event) { this.events.push(event.type); }
  setSelectionRange(start, end, direction) {
    Object.assign(this, { selectionStart: start, selectionEnd: end, selectionDirection: direction });
  }
}

function setup(buttons, pageText = '', autoStart = false, autoEnter = true, storageError = false) {
  let handle;
  let initialized = autoStart;
  let mutation;
  let load;
  let expiry;
  let disconnected = false;
  const handlers = {};
  vm.runInNewContext(source, {
    chrome: {
      runtime: { lastError: storageError ? { message: 'Unavailable' } : undefined },
      storage: { local: { get: (defaults, callback) => callback({ ...defaults, autoEnter }) } },
    },
    Element, Event, getComputedStyle: (element) => element.style,
    MutationObserver: class {
      constructor(callback) { mutation = callback; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    setTimeout: (callback) => { expiry = callback; return 1; },
    clearTimeout: () => { expiry = null; },
    window: {
      addEventListener: (name, callback) => { assert.equal(name, 'load'); load = callback; },
      removeEventListener: () => { load = null; },
    },
    document: {
      documentElement: {},
      body: { textContent: pageText },
      querySelectorAll: (selector) => initialized ? buttons.filter((element) =>
        selector === 'input' ? element.input : !element.input) : [],
      addEventListener: (name, callback) => {
        handlers[name] = callback;
        if (name === 'keydown') handle = callback;
      },
    },
  });
  initialized = true;
  const press = (options = {}) => {
    const event = {
      key: 'Enter', composedPath: () => [new Element()],
      prevented: false, preventDefault() { this.prevented = true; }, ...options,
    };
    handle(event);
    return event;
  };
  press.mutate = () => { if (!disconnected) mutation?.(); };
  press.load = () => { load?.(); };
  press.expire = () => { expiry?.(); };
  press.isDisconnected = () => disconnected;
  press.emit = (name, target, options = {}) => handlers[name]({ composedPath: () => [target], ...options });
  return press;
}

test('Enter clicks the unique entry button and prevents native submission', () => {
  const entry = new Element({ textContent: ' ENTER ' });
  const unrelated = new Element({ textContent: 'ログイン' });
  assert.equal(setup([entry, unrelated])().prevented, true);
  assert.equal(entry.clicks, 1);
  assert.equal(unrelated.clicks, 0);
});

test('supports input values, accessible labels, and image alternatives', () => {
  for (const options of [
    { value: 'ENTER' }, { attrs: { 'aria-label': 'Enter' } },
    { attrs: { alt: 'ENTER' } }, { images: [{ alt: 'ENTER' }] },
  ]) {
    const entry = new Element(options);
    assert.equal(setup([entry])().prevented, true);
    assert.equal(entry.clicks, 1);
  }
});

test('ignores non-Enter, repeated, composed, modified, and handled keys', () => {
  const entry = new Element({ textContent: 'ENTER' });
  const press = setup([entry]);
  for (const options of [
    { key: 'Escape' }, { repeat: true }, { isComposing: true }, { keyCode: 229 },
    { ctrlKey: true }, { altKey: true }, { metaKey: true }, { shiftKey: true },
    { defaultPrevented: true },
  ]) assert.equal(press(options).prevented, false);
  assert.equal(entry.clicks, 0);
});

test('preserves typing, editing, and focused control behavior', () => {
  const entry = new Element({ textContent: 'ENTER' });
  const press = setup([entry]);
  for (const target of [new Element({ control: true }), new Element({ isContentEditable: true })]) {
    assert.equal(press({ composedPath: () => [target] }).prevented, false);
  }
  assert.equal(entry.clicks, 0);
});

test('ignores hidden or disabled buttons', () => {
  for (const options of [
    { disabled: true }, { attrs: { 'aria-disabled': 'true' } }, { hidden: true },
    { rects: [] }, { style: { display: 'none', visibility: 'visible' } },
    { style: { display: 'block', visibility: 'hidden' } },
  ]) {
    const entry = new Element({ textContent: 'ENTER', ...options });
    assert.equal(setup([entry])().prevented, false);
    assert.equal(entry.clicks, 0);
  }
});

test('ignores ambiguous entry buttons and pages without an entry button', () => {
  for (const labels of [[], ['ENTER', 'ENTER'], ['LOGIN'], ['ENTER CLASS']]) {
    const entries = labels.map((textContent) => new Element({ textContent }));
    assert.equal(setup(entries)().prevented, false);
    assert.ok(entries.every((entry) => entry.clicks === 0));
  }
});

test('finds a button added after initialization', () => {
  const entries = [];
  const press = setup(entries);
  assert.equal(press().prevented, false);
  const entry = new Element({ textContent: 'ENTER' });
  entries.push(entry);
  assert.equal(press().prevented, true);
  assert.equal(entry.clicks, 1);
});

test('manifest limits injection to CLASS and uses only settings storage permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://class.admin.tus.ac.jp/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js']);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.action.default_popup, 'popup.html');
});

test('Enter in a code field clicks attendance, never refresh', () => {
  const form = { textContent: '認証コード' };
  const register = new Element({ textContent: '✔ 出席登録する', form });
  const refresh = new Element({ textContent: '再表示する', form });
  const press = setup([refresh, register]);
  for (const type of ['text', 'tel', 'number']) {
    const input = new Element({ input: true, control: true, form, type });
    assert.equal(press({ composedPath: () => [input] }).prevented, true);
  }
  assert.equal(register.clicks, 3);
  assert.equal(refresh.clicks, 0);
});

test('supports attendance code fields without a form and page-level Enter', () => {
  const register = new Element({ value: '出席登録する' });
  const input = new Element({ input: true, control: true });
  const press = setup([register], '出席登録 認証コード');
  assert.equal(press({ composedPath: () => [input] }).prevented, true);
  assert.equal(press().prevented, true);
  assert.equal(register.clicks, 2);
});

test('does not submit unrelated, read-only, or non-code input fields', () => {
  const form = { textContent: '認証コード' };
  const register = new Element({ textContent: '出席登録する', form });
  const press = setup([register]);
  for (const options of [
    { form: { textContent: '検索' } }, { form: { textContent: '認証コード' } },
    { form, type: 'password' }, { form, readOnly: true }, { form, disabled: true },
  ]) {
    const input = new Element({ input: true, control: true, ...options });
    assert.equal(press({ composedPath: () => [input] }).prevented, false);
  }
  assert.equal(register.clicks, 0);
});

test('attendance preserves IME and repeat guards and ignores unavailable or ambiguous buttons', () => {
  const input = new Element({ input: true, control: true });
  for (const options of [{ disabled: true }, { hidden: true }, { attrs: { 'aria-disabled': 'true' } }]) {
    const register = new Element({ textContent: '出席登録する', ...options });
    assert.equal(setup([register], '認証コード')({ composedPath: () => [input] }).prevented, false);
    assert.equal(register.clicks, 0);
  }
  const register = new Element({ textContent: '出席登録する' });
  const press = setup([register], '認証コード');
  for (const options of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { defaultPrevented: true }]) {
    assert.equal(press({ composedPath: () => [input], ...options }).prevented, false);
  }
  assert.equal(register.clicks, 0);
  assert.equal(setup([register, register], '認証コード')({ composedPath: () => [input] }).prevented, false);
});

test('automatically clicks entrance once and stops watching', () => {
  const entry = new Element({ textContent: 'ENTER' });
  const press = setup([entry], '', true);
  assert.equal(entry.clicks, 1);
  assert.equal(press.isDisconnected(), true);
  press.mutate();
  press.load();
  assert.equal(entry.clicks, 1);
});

test('automatically proceeds when the entrance is added or enabled later', () => {
  const entries = [];
  const press = setup(entries, '', true);
  const entry = new Element({ textContent: 'ENTER', disabled: true });
  entries.push(entry);
  press.mutate();
  assert.equal(entry.clicks, 0);
  entry.disabled = false;
  press.mutate();
  assert.equal(entry.clicks, 1);
});

test('automatic navigation ignores hidden and ambiguous entrances', () => {
  for (const entries of [
    [new Element({ textContent: 'ENTER', hidden: true })],
    [new Element({ textContent: 'ENTER' }), new Element({ textContent: 'ENTER' })],
  ]) {
    const press = setup(entries, '', true);
    press.mutate();
    press.load();
    assert.ok(entries.every((entry) => entry.clicks === 0));
  }
});

test('attendance and refresh are never clicked automatically', () => {
  const register = new Element({ textContent: '出席登録する' });
  const refresh = new Element({ textContent: '再表示する' });
  const press = setup([register, refresh], '認証コード', true);
  press.mutate();
  press.load();
  assert.equal(register.clicks, 0);
  assert.equal(refresh.clicks, 0);
  assert.equal(press().prevented, true);
  assert.equal(register.clicks, 1);
});

test('automatic waiting expires while manual Enter remains available', () => {
  const entries = [];
  const press = setup(entries, '', true);
  press.expire();
  assert.equal(press.isDisconnected(), true);
  const entry = new Element({ textContent: 'ENTER' });
  entries.push(entry);
  press.mutate();
  press.load();
  assert.equal(entry.clicks, 0);
  assert.equal(press().prevented, true);
  assert.equal(entry.clicks, 1);
});

test('manual mode prevents auto navigation while preserving Enter and attendance', () => {
  for (const label of ['ENTER', '出席登録する']) {
    const button = new Element({ textContent: label });
    const press = setup([button], '', true, false);
    press.mutate();
    press.load();
    assert.equal(button.clicks, 0);
    assert.equal(press().prevented, true);
    assert.equal(button.clicks, 1);
  }
});

test('storage read errors leave manual navigation available', () => {
  const entry = new Element({ textContent: 'ENTER' });
  const press = setup([entry], '', true, true, true);
  assert.equal(entry.clicks, 0);
  assert.equal(press().prevented, true);
  assert.equal(entry.clicks, 1);
});

test('converts every full-width digit on input, preserving zeros, other characters, and selection', () => {
  const input = new Element({ input: true, value: '０１２３４５６７８９Aあ',
    selectionStart: 3, selectionEnd: 5, selectionDirection: 'backward' });
  const register = new Element({ textContent: '出席登録する' });
  const press = setup([input, register], '認証コード');
  press.emit('input', input);
  assert.equal(input.value, '0123456789Aあ');
  assert.equal(input.selectionStart, 3);
  assert.equal(input.selectionEnd, 5);
  assert.equal(input.selectionDirection, 'backward');
  assert.equal(register.clicks, 0);
  assert.equal(input.events.length, 0);
});

test('waits until IME composition ends and notifies the site only once', () => {
  const input = new Element({ input: true, value: '６' });
  const register = new Element({ textContent: '出席登録する' });
  const press = setup([input, register], '認証コード');
  press.emit('compositionstart', input);
  press.emit('input', input, { isComposing: true });
  assert.equal(input.value, '６');
  press.emit('input', input, { isComposing: false });
  assert.equal(input.value, '６');
  press.emit('compositionend', input);
  assert.equal(input.value, '6');
  assert.deepEqual(input.events, ['input']);
  press.emit('input', input);
  assert.deepEqual(input.events, ['input']);
  assert.equal(register.clicks, 0);
});

test('normalizes pasted mixed-width digits and leaves other fields untouched', () => {
  const form = { textContent: '認証コード' };
  const register = new Element({ textContent: '出席登録する', form });
  const code = new Element({ input: true, form, value: '６3３6' });
  const press = setup([code, register]);
  press.emit('input', code);
  assert.equal(code.value, '6336');
  for (const options of [
    { form: { textContent: '検索' } }, { form: { textContent: '認証コード' } },
    { form, type: 'password' }, { form, readOnly: true }, { form, disabled: true },
  ]) {
    const other = new Element({ input: true, value: '１２', ...options });
    press.emit('input', other);
    assert.equal(other.value, '１２');
  }
});

test('registration by Enter normalizes all four fields before clicking', () => {
  const form = { textContent: '認証コード' };
  const fields = Array.from('６３３６', (value) => new Element({ input: true, control: true, value, form }));
  const register = new Element({ textContent: '出席登録する', form });
  register.click = () => {
    assert.equal(fields.map((input) => input.value).join(''), '6336');
    register.clicks++;
  };
  const press = setup([...fields, register]);
  assert.equal(press({ composedPath: () => [fields[3]] }).prevented, true);
  assert.equal(register.clicks, 1);
  assert.ok(fields.every((input) => input.events.length === 1));
});

test('manual registration click normalizes fields without triggering another click', () => {
  const input = new Element({ input: true, value: '０９' });
  const register = new Element({ textContent: '出席登録する' });
  const press = setup([input, register], '認証コード');
  press.emit('click', register);
  assert.equal(input.value, '09');
  assert.deepEqual(input.events, ['input']);
  assert.equal(register.clicks, 0);
});

test('numbers outside the attendance code screen are never changed', () => {
  const input = new Element({ input: true, value: '１２３４' });
  const press = setup([input, new Element({ textContent: 'ENTER' })], '認証コード');
  press.emit('input', input);
  press.emit('compositionend', input);
  assert.equal(input.value, '１２３４');
});
