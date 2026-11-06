import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES } from '../docs/forms/templates.js';
import { validateDoc, validateSubmission, visiblePages, isQuestion } from '../docs/forms/core.js';

const byId = (id) => TEMPLATES.find((t) => t.id === id);
const blocks = (t) => t.doc.pages.flatMap((p) => p.blocks);

test('every template is a valid document with unique ids', () => {
  const ids = TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const t of TEMPLATES) assert.deepEqual(validateDoc(t.doc), [], t.id);
});

test('case-study is untouched by the new template', () => {
  const t = byId('case-study');
  assert.equal(blocks(t).filter(isQuestion).length, 10);
  assert.deepEqual(blocks(t).filter((b) => b.required).map((b) => b.id), ['level', 'exhausted', 'checkin', 'where']);
});

const t = byId('student-stress-2026');

test('student-stress-2026: set-up matches the spec', () => {
  assert.ok(t, 'template exists');
  assert.equal(t.title, 'How do students handle stress?');
  assert.equal(t.privacy_mode, 'anonymous');
  assert.equal(t.settings.view, 'pages');
  assert.equal(t.settings.cover, 'sage');
  assert.equal(t.settings.wellbeing, true);
  assert.match(t.settings.intro, /Five questions are required/);
  assert.match(t.settings.intro, /not medical professionals/);
  assert.equal(t.settings.follow_up.enabled, true);
  assert.equal(t.settings.follow_up.button, 'Keep me posted');
  assert.deepEqual(t.doc.pages.map((p) => p.title), ['About you', 'How it feels', 'A weekly check-in', 'One last thing']);
});

test('student-stress-2026: eleven questions in order, five required', () => {
  const qs = blocks(t);
  assert.deepEqual(qs.map((b) => b.id), ['student_level', 'year', 'university', 'exhausted', 'cope', 'support', 'checkin', 'stop', 'where', 'privacy', 'more']);
  assert.deepEqual(qs.filter((b) => b.required).map((b) => b.id), ['student_level', 'university', 'exhausted', 'checkin', 'where']);
  const labels = Object.fromEntries(qs.map((b) => [b.id, b.options?.map((o) => o.label)]));
  assert.deepEqual(labels.student_level, ['Bachelor', 'Master', 'PhD', 'Other programme', 'I’m not a student']);
  assert.deepEqual(labels.exhausted, ['Never', 'Sometimes', 'Often', 'Almost always']);
  assert.deepEqual(labels.where, ['Inside my existing student app', 'A separate app', 'By email', 'A simple web link']);
  const scale = qs.find((b) => b.id === 'privacy');
  assert.deepEqual([scale.type, scale.min, scale.max, scale.minLabel, scale.maxLabel], ['scale', 1, 5, 'Not important', 'Essential']);
  assert.equal(qs.find((b) => b.id === 'stop').maxLength, 300);
  assert.equal(qs.find((b) => b.id === 'more').maxLength, 1500);
  assert.ok(qs.find((b) => b.id === 'cope').other && qs.find((b) => b.id === 'university').other);
  assert.ok(labels.university.includes('Prefer not to say') && labels.university.includes('KU Leuven'));
});

test('non-students leave after question 1 and nothing else is stored', () => {
  const notStudent = t.doc.pages[0].blocks[0].options.find((o) => o.label === 'I’m not a student').id;
  const answers = { student_level: notStudent };
  const pages = visiblePages(t.doc, answers);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].blocks.map((b) => b.id), ['student_level']);
  const r = validateSubmission(t.doc, answers);
  assert.ok(r.ok, 'no other question is required for a non-student');
  // even a hand-crafted request cannot smuggle in the other answers
  const sneaky = validateSubmission(t.doc, { ...answers, university: 'o1', exhausted: 'o3', more: 'hello' });
  assert.deepEqual(sneaky.clean, { student_level: notStudent });
});

test('students must answer the four other required questions', () => {
  const r = validateSubmission(t.doc, { student_level: 'o1' });
  assert.deepEqual(Object.keys(r.errors).sort(), ['checkin', 'exhausted', 'university', 'where']);
  const ok = validateSubmission(t.doc, { student_level: 'o2', university: 'o1', exhausted: 'o3', checkin: 'o2', where: 'o2' });
  assert.ok(ok.ok);
  // "Other" university needs the text; "Prefer not to say" is fine
  assert.ok(validateSubmission(t.doc, { student_level: 'o1', university: 'other', exhausted: 'o1', checkin: 'o1', where: 'o1' }).errors.university);
  const other = validateSubmission(t.doc, { student_level: 'o1', university: 'other', 'university.other': 'Hogeschool X', exhausted: 'o1', checkin: 'o1', where: 'o1' });
  assert.ok(other.ok && other.clean['university.other'] === 'Hogeschool X');
  const pref = t.doc.pages[0].blocks[2].options.find((o) => o.label === 'Prefer not to say').id;
  assert.ok(validateSubmission(t.doc, { student_level: 'o1', university: pref, exhausted: 'o1', checkin: 'o1', where: 'o1' }).ok);
  assert.ok(!validateSubmission(t.doc, { student_level: 'o1', university: 'o1', exhausted: 'o1', checkin: 'o1', where: 'o1', privacy: 6 }).ok, 'scale is 1 to 5');
});

test('student-stress-2026 asks nothing it should not, and promises nothing that does not exist', () => {
  const everything = JSON.stringify(t).toLowerCase();
  for (const banned of ['pilot', 'ucll', 'phq', 'gad-', 'mbi', 'award', 'partner', 'student number', 'date of birth', 'phone', 'diagnos', '€', 'pay ']) {
    assert.ok(!everything.includes(banned), `must not contain "${banned}"`);
  }
  for (const b of blocks(t).filter(isQuestion)) {
    assert.ok(!/\b(name|email|e-mail|age|faculty)\b/i.test(b.label.replace(/Which university do you study at/i, '')), `identifying question? ${b.label}`);
  }
});

test('student-stress-2026: exact brief wording', () => {
  assert.equal(t.settings.intro, 'A few quick questions about how students deal with feeling run down, and whether a short weekly check-in would help. It takes about two minutes. Five questions are required; skip any of the others.\n\nWe’re not medical professionals: if you’re struggling, please talk to a doctor or your student support service.\n\nNo account, no email, no tracking in your answers. We can’t tell who you are. Please don’t put names or details that could identify you or other people.');
  assert.equal(t.settings.thanks, 'Thank you. Your answers help us build something that’s actually useful for students.');
  assert.deepEqual(t.settings.follow_up, { enabled: true, title: 'Want to hear what we learn?', text: 'Leave your email if you’d like us to share what we learn. This is optional and is not linked to your survey answers.', button: 'Keep me posted' });
  const uni = blocks(t).find((b) => b.id === 'university');
  assert.deepEqual(uni.options.map((o) => o.label), ['KU Leuven', 'UCLouvain', 'UGent', 'VUB', 'UAntwerp', 'ULiège', 'UHasselt', 'UMONS', 'UNamur', 'University of Luxembourg', 'Leiden University', 'Utrecht University', 'TU Delft', 'TU Eindhoven', 'University of Amsterdam', 'VU Amsterdam', 'Erasmus University Rotterdam', 'Radboud University', 'University of Twente', 'Tilburg University', 'University of Groningen', 'Maastricht University', 'Prefer not to say']);
  assert.equal(uni.other, true);
  assert.equal(uni.help, 'This stays anonymous. We only use it to group answers.');
  assert.equal(blocks(t).find((b) => b.id === 'student_level').other, undefined, 'no free-text Other on the first question');
});

test('student-stress-2026: the “Other” university text is capped at 120 characters on the server', () => {
  const long = 'x'.repeat(250);
  const r = validateSubmission(t.doc, { student_level: 'o1', university: 'other', 'university.other': long, exhausted: 'o1', checkin: 'o1', where: 'o1' });
  assert.ok(r.ok);
  assert.equal(r.clean['university.other'].length, 120);
});
