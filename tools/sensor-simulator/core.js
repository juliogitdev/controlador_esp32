/* Independent event producer. No actuator address or actuator API in this module. */
(function(root) {
  const definitions = {
    presence: {unit:'boolean', valid:value => typeof value === 'boolean'},
    temperature: {unit:'C', valid:value => typeof value === 'number' && Number.isFinite(value) && value >= -100 && value <= 200},
    humidity: {unit:'%', valid:value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100},
    voltage: {unit:'V', valid:value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000}
  };
  class SensorSource {
    constructor(sourceId, kind) { this.sourceId = sourceId; this.kind = kind; }
    read() { throw new Error('Implement read() in the producer.'); }
  }
  class SimulatedSource extends SensorSource {
    constructor(sourceId, kind, value) { super(sourceId, kind); this.value = value; this.available = true; }
    read() { return {value:this.available ? this.value : null, status:this.available ? 'ok' : 'unavailable', origin:'simulated'}; }
  }
  function eventFor(source, subjectId, eventId, observedAt = new Date().toISOString()) {
    const definition = definitions[source.kind];
    if (!definition || !/^[A-Za-z0-9_-]{1,64}$/.test(source.sourceId) || !/^[A-Za-z0-9_-]{1,64}$/.test(subjectId)) throw new Error('Identificador de fonte, sala ou tipo invalido.');
    const reading = source.read();
    if (!['ok', 'unavailable'].includes(reading.status) ||
        (reading.status === 'ok' ? !definition.valid(reading.value) : reading.value !== null)) throw new Error('Valor incompativel com o sensor.');
    if (!['hardware', 'simulated'].includes(reading.origin)) throw new Error('Origem invalida.');
    return {protocolVersion:1, eventId, sourceId:source.sourceId, subjectId, kind:source.kind,
      observedAt, validForMs:30000, value:reading.value, unit:definition.unit, status:reading.status, origin:reading.origin};
  }
  async function publish(baseUrl, token, event, fetcher = fetch) {
    const base = new URL(baseUrl);
    if (base.username || base.password || base.search || base.hash ||
        (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(base.hostname)))) throw new Error('Use HTTPS (ou HTTP localhost para desenvolvimento).');
    if (!token || /[\r\n]/.test(token)) throw new Error('Informe o token da fonte.');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const url = base.href.replace(/\/$/, '') + '/api/v1/sources/' + encodeURIComponent(event.sourceId) + '/events';
      const response = await fetcher(url, {method:'POST', signal:abort.signal, headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token}, body:JSON.stringify(event)});
      if (!response.ok) throw new Error('Backend HTTP ' + response.status);
      const receipt = await response.json();
      if (receipt.eventId !== event.eventId || receipt.accepted !== true) throw new Error('Confirmacao de evento invalida.');
      return receipt;
    } finally { clearTimeout(timer); }
  }
  const api = {SensorSource, SimulatedSource, eventFor, publish};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SensorSimulation = api;
})(globalThis);
