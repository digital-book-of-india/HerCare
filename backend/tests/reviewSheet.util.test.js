import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReviewSheet, renderMarkdown, renderHtml, fingerprintOf, escapeHtml,
} from '../src/utils/reviewSheet.util.js';

const DATA = () => ({
  generatedAt: '2026-11-01T10:00:00.000Z',
  limits: { cycleMin: 15, cycleMax: 60, recent: 6, minSamples: 2, predicted: 3, defaultCycleLength: 28, defaultPeriodDuration: 5 },
  disclaimerText: 'HerCare is a wellness tool, not a medical diagnosis. Dates are estimates.',
  privacyText: 'Your data is yours and can be deleted at any time.',
  checklistItems: [{ id: 'rest', label: 'Take a rest break' }, { id: 'meal', label: 'Eat a balanced meal' }],
  options: { symptoms: ['cramps', 'back_pain'], flows: ['light', 'medium', 'heavy'], moods: ['calm', 'sad'], energy: ['low', 'high'] },
  notifications: [
    { where: 'Daily logging reminder', text: 'Time to log how you feel today.' },
    { where: 'Hydration reminder', text: 'Time for a water break.' },
  ],
  tips: [
    { category: 'food', title: 'Balanced meals', text: 'Include vegetables, fruits and whole grains.', showWhen: 'always', active: false, reviewedAt: null, reviewedBy: null },
    { category: 'activity', title: 'Rest is okay', text: 'You can skip activity today.', showWhen: 'period', active: false, reviewedAt: null, reviewedBy: null },
    { category: 'food', title: 'Iron foods', text: 'Leafy greens contain iron.', showWhen: 'period', active: true, reviewedAt: '2026-10-30T00:00:00.000Z', reviewedBy: 'Dr. A. Rao' },
  ],
});

const build = (data = DATA()) => buildReviewSheet(data);
const countOf = (text, needle) => text.split(needle).length - 1;

test('every tip, with its full wording, appears in both formats', () => {
  const sheet = build();
  const md = renderMarkdown(sheet);
  const html = renderHtml(sheet);
  for (const tip of DATA().tips) {
    assert.ok(md.includes(tip.title) && md.includes(tip.text), `${tip.title} missing from Markdown`);
    assert.ok(html.includes(tip.title) && html.includes(tip.text), `${tip.title} missing from HTML`);
  }
});

test('everything a reviewer must approve is on the sheet', () => {
  const md = renderMarkdown(build());
  const data = DATA();
  assert.ok(md.includes(data.disclaimerText) && md.includes(data.privacyText));
  data.checklistItems.forEach((item) => assert.ok(md.includes(item.label)));
  data.notifications.forEach((note) => assert.ok(md.includes(note.text)));
  assert.ok(md.includes('back pain'), 'option names are shown in words');
  assert.ok(md.includes('light, medium, heavy'));
});

test('the estimate rules quote the real numbers', () => {
  const md = renderMarkdown(build());
  assert.match(md, /shorter than 15 days or longer than 60 days/);
  assert.match(md, /most recent 6/);
  assert.match(md, /default 28 days/);
  assert.match(md, /default 5 days/);
  assert.match(md, /next 3 estimated periods/);
});

test('one decision box set per row to approve', () => {
  const md = renderMarkdown(build());
  // texts: disclaimer, privacy, 2 checklist items, 2 notifications = 6; options: 4; estimate: 1; tips: 3
  assert.equal(countOf(md, '☐ Approve / ☐ Approve with edits / ☐ Reject'), 6 + 4 + 1 + 3);
});

test('each tip shows whether it is live, reviewed or still a draft', () => {
  const md = renderMarkdown(build());
  assert.ok(md.includes('Draft. Not shown to users'));
  assert.ok(md.includes('Live. Reviewed 2026-10-30 by Dr. A. Rao'));
  assert.ok(md.includes('Only while a period is logged'));
});

test('tips are ordered by type then title, and numbered', () => {
  const md = renderMarkdown(build());
  const order = ['Rest is okay', 'Balanced meals', 'Iron foods'].map((title) => md.indexOf(`| ${title} |`));
  assert.ok(order.every((i) => i > 0));
  assert.ok(order[0] < order[1] && order[1] < order[2], 'activity first, then food A-Z');
});

test('the sheet carries the questions, the sign-off block and the fingerprint', () => {
  const sheet = build();
  const md = renderMarkdown(sheet);
  assert.ok(md.includes('Questions for you') && md.includes('Sign-off'));
  assert.ok(md.includes('Reviewer name') && md.includes('Professional qualification') && md.includes('Signature'));
  assert.ok(md.includes('when to seek care'));
  assert.equal(countOf(md, sheet.fingerprint), 2); // at the top and at the bottom
  assert.match(sheet.fingerprint, /^[0-9a-f]{12}$/);
});

test('the fingerprint changes when ANY approved wording changes, and only then', () => {
  const base = fingerprintOf(DATA());
  assert.equal(fingerprintOf(DATA()), base);

  const changedTip = DATA(); changedTip.tips[0].text += ' Extra.';
  const changedDisclaimer = DATA(); changedDisclaimer.disclaimerText += '!';
  const changedChecklist = DATA(); changedChecklist.checklistItems[0].label = 'Different';
  const changedLimit = DATA(); changedLimit.limits.cycleMax = 45;
  const changedOption = DATA(); changedOption.options.moods.push('angry');
  for (const data of [changedTip, changedDisclaimer, changedChecklist, changedLimit, changedOption]) {
    assert.notEqual(fingerprintOf(data), base);
  }

  const onlyDate = DATA(); onlyDate.generatedAt = '2030-01-01T00:00:00.000Z';
  const onlyStatus = DATA(); onlyStatus.tips[0].active = true; onlyStatus.tips[0].reviewedAt = '2026-11-01T00:00:00.000Z';
  assert.equal(fingerprintOf(onlyDate), base, 'the date is not part of the wording');
  assert.equal(fingerprintOf(onlyStatus), base, 'review status is not part of the wording');
});

test('HTML is safe: tip text cannot inject markup', () => {
  const data = DATA();
  data.tips[0].title = '<script>alert(1)</script>';
  data.tips[0].text = 'Fish & "chips" <img src=x onerror=alert(2)> \'quoted\'';
  data.disclaimerText = '</td><td>injected';
  const html = renderHtml(build(data));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</td><td>injected'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('Fish &amp; &quot;chips&quot;'));
  assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;');
});

test('HTML is a complete, print-ready page', () => {
  const html = renderHtml(build());
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<meta charset="utf-8">') && html.includes('@page') && html.includes('<title>'));
  assert.ok(!/<script|https?:\/\//.test(html), 'no scripts and no external resources');
  assert.equal(countOf(html, '<table'), 5); // texts, options, estimate, tips, sign-off
});

test('Markdown tables survive pipes and line breaks in the text', () => {
  const data = DATA();
  data.tips[0].text = 'Eat A | B\nthen C';
  const md = renderMarkdown(build(data));
  assert.ok(md.includes('Eat A \\| B then C'));
  const tipRows = md.split('\n').filter((line) => line.includes('Balanced meals'));
  assert.equal(tipRows.length, 1, 'the row stays on one line');
});

test('an empty tip list still produces a valid sheet', () => {
  const data = DATA(); data.tips = [];
  const md = renderMarkdown(build(data));
  assert.ok(md.includes('## 5. Tips') && md.includes('Sign-off'));
});
