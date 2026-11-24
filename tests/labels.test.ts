import assert from "node:assert/strict";
import { disciplineLabel, horseSexLabel, horseSexOptionLabels } from "../src/domain/labels";

// What the rider reads for a stored value. The value itself never changes:
// 'trail' and 'unknown' are what the database holds and what installed builds send.

{
  assert.equal(disciplineLabel("trail"), "Leisure", "The stored value reads Leisure.");
  assert.equal(disciplineLabel("Trail"), "Leisure", "So does the app's own key.");
  assert.equal(disciplineLabel("dressage"), "Dressage");
  assert.equal(disciplineLabel("Jumping"), "Jumping");
  assert.equal(disciplineLabel("eventing"), "Eventing");
  assert.equal(disciplineLabel("reining"), "Reining", "A discipline with no label of its own is capitalised.");
  assert.equal(disciplineLabel(undefined), undefined, "No discipline, no label.");
  assert.equal(disciplineLabel(""), undefined);
}

{
  assert.equal(horseSexOptionLabels.unknown, "Not Sure", "The editor offers Not Sure for the stored 'unknown'.");
  assert.deepEqual(Object.keys(horseSexOptionLabels), ["mare", "gelding", "stallion", "unknown"], "The stored values are untouched.");
  assert.equal(horseSexLabel("mare"), "Mare");
  assert.equal(horseSexLabel("gelding"), "Gelding");
  assert.equal(horseSexLabel("stallion"), "Stallion");
  assert.equal(horseSexLabel("unknown"), "", "A horse marked Not Sure shows no sex in a header.");
  assert.equal(horseSexLabel(undefined), "");
}

console.log("Labels passed.");
