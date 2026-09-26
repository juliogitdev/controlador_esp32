const assert = require('node:assert/strict');
const {SensorSource, SimulatedSource, eventFor, publish} = require('../tools/sensor-simulator/core.js');
const fs = require('node:fs');
(async () => {
  const presence = new SimulatedSource('sim-presence', 'presence', true);
  const hot = new SimulatedSource('sim-temperature', 'temperature', 30);
  const active = eventFor(presence, 'sala-01', 'event-1');
  assert.equal(active.value, true);
  assert.equal(active.origin, 'simulated');
  assert.equal(active.validForMs, 30000);
  presence.available = false;
  assert.equal(eventFor(presence, 'sala-01', 'event-2').value, null);
  assert.equal(eventFor(presence, 'sala-01', 'event-2').status, 'unavailable');
  presence.available = true; presence.value = false;
  assert.equal(eventFor(presence, 'sala-01', 'event-3').value, false);
  presence.value = 0;
  assert.throws(() => eventFor(presence, 'sala-01', 'event-4'), /incompativel/);
  class RealSource extends SensorSource { read() {return {value:29, status:'ok', origin:'hardware'};} }
  const real = eventFor(new RealSource('physical-temp', 'temperature'), 'sala-01', 'event-5');
  assert.equal(real.origin, 'hardware');
  assert.equal(real.kind, eventFor(hot, 'sala-01', 'event-6').kind);
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({url, options});
    const body = JSON.parse(options.body);
    if (body.sourceId === 'sim-presence') throw new Error('source unavailable');
    return {ok:true, json:async () => ({accepted:true, eventId:body.eventId})};
  };
  const results = await Promise.allSettled([
    publish('https://backend.example', 'presence-token', active, fakeFetch),
    publish('https://backend.example', 'temperature-token', eventFor(hot, 'sala-01', 'event-7'), fakeFetch)
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(calls[1].url, 'https://backend.example/api/v1/sources/sim-temperature/events');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer temperature-token');
  await assert.rejects(publish('http://remote.example', 'token', active, fakeFetch), /HTTPS/);
  await assert.rejects(publish('https://backend.example', 'token', active, async () => ({ok:true,json:async () => ({accepted:true,eventId:'wrong'})})), /Confirmacao/);
  const firmware = fs.readdirSync('src').filter(n => /\.(cpp|h)$/.test(n)).map(n => fs.readFileSync('src/' + n,'utf8')).join('\n');
  assert.doesNotMatch(firmware, /SensorService|Adafruit|sensor\.simulate|presenceEnabled/);
  assert.doesNotMatch(fs.readFileSync('platformio.ini','utf8'), /adafruit/i);
  console.log('OK: source substitution, unavailable versus false, validation, independent failures, source credentials, event receipt and actuator boundary.');
})().catch(error => {console.error(error); process.exitCode = 1;});
