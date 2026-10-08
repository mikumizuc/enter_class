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
      style: { display: 'block', visibility: 'visible' }, rects: [{}],
    }, options);
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelectorAll() { return this.images; }
  matches() { return this.disabled || this.attrs['aria-disabled'] === 'true'; }
  closest(selector) {
    return (selector.startsWith('[hidden]') ? this.hidden : this.control) ? this : null;
  }
  getClientRects() { return this.rects; }
  click() { this.clicks++; }
}

function setup(buttons) {
  let handle;
  vm.runInNewContext(source, {
    Element, getComputedStyle: (element) => element.style,
    document: {
      querySelectorAll: () => buttons,
      addEventListener: (name, callback) => {
        assert.equal(name, 'keydown');
        handle = callback;
      },
    },
  });
  return (options = {}) => {
    const event = {
      key: 'Enter', composedPath: () => [new Element()],
      prevented: false, preventDefault() { this.prevented = true; }, ...options,
    };
    handle(event);
    return event;
  };
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

test('manifest limits injection to the CLASS HTTPS site without extra permissions', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://class.admin.tus.ac.jp/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js']);
  assert.equal(manifest.permissions, undefined);
});
