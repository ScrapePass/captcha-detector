import assert from 'node:assert/strict';

export function check(r, expect, label) {
  const ids = r.detections.map((d) => d.id);
  const msg = `${label}\n  got: ${JSON.stringify(r.detections.map((d) => [d.id, d.kind, d.subtype, d.confidence]))}`;
  if (expect.captcha !== undefined) assert.equal(r.captcha, expect.captcha, `captcha flag — ${msg}`);
  if (expect.challengePage !== undefined) assert.equal(r.challengePage, expect.challengePage, `challengePage — ${msg}`);
  if (expect.blocked !== undefined) assert.equal(r.blocked, expect.blocked, `blocked — ${msg}`);
  for (const id of expect.ids || []) assert.ok(ids.includes(id), `missing ${id} — ${msg}`);
  for (const id of expect.absent || []) assert.ok(!ids.includes(id), `unexpected ${id} — ${msg}`);
  if (expect.only) assert.deepEqual([...ids].sort(), [...expect.ids].sort(), `only ${expect.ids} — ${msg}`);
  const byId = Object.fromEntries(r.detections.map((d) => [d.id, d]));
  for (const [field, map] of [['subtype', expect.subtype], ['kind', expect.kind], ['name', expect.name]])
    for (const [id, v] of Object.entries(map || {})) assert.equal(byId[id] && byId[id][field], v, `${id}.${field} — ${msg}`);
}
