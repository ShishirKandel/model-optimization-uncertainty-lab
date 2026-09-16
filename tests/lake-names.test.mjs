import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url)));
const lakes = read('lakes.json').lakes;
const names = read('lake-names.json');
const boundaries = read('lake-name-boundaries.geojson').features;
function inside([x,y], ring) {
  let hit = false;
  for(let i=0; i<ring.length-1; i++) {
    const [ax,ay] = ring[i], [bx,by] = ring[i+1];
    if ((ay>y)!==(by>y) && x < (bx-ax)*(y-ay)/(by-ay)+ax) hit = !hit;
  }
  return hit;
}
test('each mapped lake name has a unique containing source boundary', () => {
  assert.equal(Object.keys(names.lakes).length, 67);
  for(const [id, entry] of Object.entries(names.lakes)) {
    const lake = lakes.find(lake => lake.id === id);
    assert.ok(lake, id);
    const matches = boundaries.filter(f => inside([lake.lon,lake.lat], f.geometry.coordinates[0]));
    assert.equal(matches.length, 1, id);
    assert.equal(matches[0].properties.source, entry.source);
    assert.equal(matches[0].properties.name, entry.name);
    assert.match(entry.source, /^https:\/\/www.openstreetmap.org\/way\/\d+$/);
  }
  assert.equal(names.lakes['GLO_83.85335_28.69074'].name, 'Tilicho Lake');
  assert.equal(names.lakes['GLO_86.47904_27.85858'].name, 'Tsho Rolpa Lake');
  assert.equal(names.lakes['GLO_85.41439_28.08199'].name, 'Gosaikunda');
  assert.equal(names.lakes['GLO_80.88324_30.0535'], undefined);
});
