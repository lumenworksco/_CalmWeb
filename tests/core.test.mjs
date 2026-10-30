import test from 'node:test';
import assert from 'node:assert/strict';
import { newBlock, emptyDoc, validateSubmission, validateDoc, visiblePages, pipe, summarize, toCsv, MIN_GROUP, checkAnswer } from '../docs/forms/core.js';

const doc = () => ({ pages: [
  { id: 'p1', blocks: [
    { id: 'a', type: 'single_choice', label: 'Stress?', required: true, other: true, options: [{ id: 'y', label: 'Yes' }, { id: 'n', label: 'No' }] },
    { id: 'b', type: 'long_text', label: 'Tell us', show_if: { all: [{ q: 'a', op: 'eq', value: 'y' }] } },
  ] },
  { id: 'p2', blocks: [
    { id: 'c', type: 'mood_slider', label: 'Mood' },
    { id: 'd', type: 'multi_choice', label: 'Features', options: [{ id: 'f1', label: 'One' }, { id: 'f2', label: 'Two' }] },
    { id: 'e', type: 'ranking', label: 'Rank', options: [{ id: 'r1', label: 'R1' }, { id: 'r2', label: 'R2' }] },
  ] },
] });

test('required, skippable optional, and option validation', () => {
  assert.equal(validateSubmission(doc(), {}).errors.a, 'This one is marked required.');
  assert.ok(validateSubmission(doc(), { a: 'n' }).ok);
  assert.ok(!validateSubmission(doc(), { a: 'zzz' }).ok);
});

test('answers to hidden questions and unknown keys are dropped', () => {
  const r = validateSubmission(doc(), { a: 'n', b: 'sneaky', evil: 'x', c: 3 });
  assert.deepEqual(r.clean, { a: 'n', c: 3 });
});

test('conditional blocks show and validate when their condition holds', () => {
  assert.equal(visiblePages(doc(), { a: 'y' })[0].blocks.length, 2);
  assert.equal(visiblePages(doc(), { a: 'n' })[0].blocks.length, 1);
});

test('"other" keeps its free text only when selected', () => {
  assert.equal(validateSubmission(doc(), { a: 'other', 'a.other': ' hm ' }).clean['a.other'], 'hm');
  assert.equal(validateSubmission(doc(), { a: 'n', 'a.other': 'hm' }).clean['a.other'], undefined);
});

test('scale, ranking and multi-choice bounds', () => {
  assert.ok(!checkAnswer({ type: 'mood_slider' }, 9).value);
  assert.ok(!checkAnswer({ type: 'mood_slider' }, 2.5).value);
  const rank = doc().pages[1].blocks[2];
  assert.ok(checkAnswer(rank, ['r2', 'r1']).value);
  assert.ok(checkAnswer(rank, ['r1']).error);
  assert.ok(checkAnswer(doc().pages[1].blocks[1], ['f1', 'f1']).error);
});

test('piping uses option labels and falls back politely', () => {
  assert.equal(pipe('You said {{a}}.', doc(), { a: 'y' }), 'You said Yes.');
  assert.equal(pipe('You said {{a}}.', doc(), {}), 'You said something.');
});

test('validateDoc catches empty questions, short option lists and forward references', () => {
  const d = emptyDoc(); d.pages[0].blocks.push({ ...newBlock('short_text'), label: '' });
  assert.ok(validateDoc(d).length >= 1);
  const bad = doc(); bad.pages[0].blocks[0].show_if = { all: [{ q: 'c', op: 'answered' }] };
  assert.ok(validateDoc(bad).some((p) => p.includes('before')));
  assert.deepEqual(validateDoc(doc()), []);
});

test('summaries suppress groups smaller than the minimum', () => {
  const few = Array.from({ length: MIN_GROUP - 1 }, () => ({ a: 'y' }));
  assert.equal(summarize(doc(), few).find((s) => s.id === 'a').suppressed, true);
  const many = Array.from({ length: MIN_GROUP }, (_, i) => ({ a: i % 2 ? 'y' : 'n' }));
  const s = summarize(doc(), many).find((x) => x.id === 'a');
  assert.equal(s.suppressed, undefined);
  assert.equal(s.bars.find((b) => b.key === 'y').count, 2);
});

test('CSV uses labels, escapes, and neutralises formula injection', () => {
  const csv = toCsv(doc(), [{ week: '2026-10-26', answers: { a: 'y', b: '=HYPERLINK("x")', d: ['f1', 'f2'] } }]);
  assert.match(csv, /Stress\?,Stress\? \(other\),Tell us/);
  assert.match(csv, /2026-10-26,Yes,,"'=HYPERLINK\(""x""\)",/);
  assert.match(csv, /One; Two/);
});
