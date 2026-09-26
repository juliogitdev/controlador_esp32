// Run with: node tests/ui.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('data/index.html', 'utf8');
class Element {
  constructor() { this.children = []; this.textContent = ''; this.value = ''; this.handlers = {}; }
  setAttribute(name, value) { this[name] = value; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
}
const elements = new Map();
const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
let response = {ok: true, json: async () => ({})};
const context = vm.createContext({
  document: {getElementById: get, querySelector: get, createElement: () => new Element()},
  fetch: async () => response, AbortController, TextEncoder,
  setTimeout: () => 1, clearTimeout: () => {}, console,
});
// Disable just the automatic poll to control timing in tests.
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\n    refresh\(\);\s*$/, '');
vm.runInContext(script, context);
(async () => {
  vm.runInContext(`environments = [{id:'env_1', name:'<img src=x onerror=alert(1)>', state:'unknown', buttons:['power_on']}]; render();`, context);
  const card = get('envList').children[0];
  assert.match(card.children[0].textContent, /^<img src=x onerror=alert\(1\)>/);
  assert.equal(card.children[1].children[0].disabled, false);
  assert.equal(card.children[1].children[2].disabled, true);
  vm.runInContext('armed = true; render();', context);
  assert.ok(get('envList').children[0].children[1].children.every(el => el.disabled));
  response = {ok: false, json: async () => ({error:'Ja existe uma captura'})};
  await assert.rejects(vm.runInContext("api('/test', {})", context), /Ja existe uma captura/);
  vm.runInContext('armed = false;', context);
  await vm.runInContext("run(async () => { throw new Error('Falha de rede'); })", context);
  assert.equal(get('message').textContent, 'Falha de rede');
  assert.equal(vm.runInContext('busy', context), false);
  const device = {
    deviceId: 'esp32-test', backend: {state:'disabled'}, configured:false, intervalMs:5000,

  };
  let calls = 0;
  context.fetch = async () => ({ok: true, json: async () => [
    device, {status:'timeout', samples:0}, []
  ][calls++]});
  await vm.runInContext('refresh()', context);
  assert.match(get('message').textContent, /Tempo esgotado/);
  assert.equal(vm.runInContext('armed', context), false);
  context.testDevice = {...device, configured:true};
  vm.runInContext('showDevice(testDevice); render();', context);
  assert.ok(get('envList').children.every(card => !card.children[1] || card.children[1].children.every(el => el.disabled)));
  assert.equal(get('#addForm button').disabled, true);
  vm.runInContext("cloudMode = false; environments = [{id:'env_1', name:'Device', state:'unknown', buttons:['cool_24']}]; render();", context);
  const controls = get('envList').children[0].children[2];
  assert.equal(controls.children[2].disabled, false);
  vm.runInContext("selectedTemperatures.env_1 = 25; render();", context);
  assert.equal(get('envList').children[0].children[2].children[2].disabled, true);
  get('setupKey').value = 'local-test-key';
  get('carrier').value = '38';
  let sent;
  context.fetch = async (path, options) => {
    if (options.method === 'POST') sent = {path, options};
    return {ok:true, json:async () => path === '/api/environments' ? [] : {saved:true}};
  };
  get('customPreset').value = 'aquecer_22';
  get('envList').children[0].children[4].handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent.path, '/api/environments/env_1/capture');
  assert.equal(JSON.parse(sent.options.body).button, 'aquecer_22');
  assert.equal(sent.options.headers['X-Setup-Key'], 'local-test-key');
  assert.equal(vm.runInContext('armed', context), true);
  console.log('OK: safe names, capture lock, API/network errors, timeout, backend mode, learned setpoints only and authenticated custom-state capture.');
})().catch(error => {console.error(error); process.exitCode = 1;});
