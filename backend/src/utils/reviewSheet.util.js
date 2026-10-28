import { createHash } from 'node:crypto';

// Builds the clinical review sheet from the app's REAL content, so what a reviewer signs off is
// what users see. Pure functions (no database, no files): the script feeds them the data.
const DECISION = '☐ Approve / ☐ Approve with edits / ☐ Reject';
const words = (value) => value.replaceAll('_', ' ');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// A table cell is plain text, or { text, kind } where kind styles the printed sheet.
const decisionCell = () => ({ text: DECISION, kind: 'decision' });
const blankCell = () => ({ text: '', kind: 'blank' });

const tipStatus = (tip) => {
  if (tip.reviewedAt && tip.active) return `Live. Reviewed ${String(tip.reviewedAt).slice(0, 10)}${tip.reviewedBy ? ` by ${tip.reviewedBy}` : ''}`;
  if (tip.reviewedAt) return 'Reviewed, not live';
  return 'Draft. Not shown to users';
};

// Identifies the exact wording on the sheet. If anything a reviewer is asked to approve changes,
// this changes, so a signature can be tied to one version of the text.
export const fingerprintOf = (data) => {
  const reviewable = {
    limits: data.limits,
    disclaimerText: data.disclaimerText,
    privacyText: data.privacyText,
    checklistItems: data.checklistItems,
    options: data.options,
    notifications: data.notifications,
    tips: data.tips.map(({ category, title, text, showWhen }) => ({ category, title, text, showWhen })),
  };
  return createHash('sha256').update(JSON.stringify(reviewable)).digest('hex').slice(0, 12);
};

export const buildReviewSheet = (data) => {
  const { limits, options } = data;
  const fingerprint = fingerprintOf(data);
  const tips = [...data.tips].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  const textRows = [
    ['Health disclaimer', 'Welcome screen and settings', data.disclaimerText],
    ['Privacy notice', 'Welcome screen and settings', data.privacyText],
    ...data.checklistItems.map((item) => ['Default daily checklist item (users can edit their own)', 'Daily self-care screen', item.label]),
    ...data.notifications.map((note) => [note.where, 'Phone notification', note.text]),
  ].map(([what, where, text]) => [`${what}`, where, text, decisionCell(), blankCell()]);

  const optionRows = [
    ['Symptoms', options.symptoms.map(words).join(', ')],
    ['Flow', options.flows.join(', ')],
    ['Mood', options.moods.join(', ')],
    ['Energy', options.energy.join(', ')],
  ].map(([what, list]) => [what, list, decisionCell(), blankCell()]);

  const blocks = [
    { type: 'h1', text: 'HerCare: clinical review of user-facing content' },
    { type: 'p', text: `Prepared ${data.generatedAt.slice(0, 10)} · Content fingerprint: ${fingerprint} · Please quote the fingerprint when you return this sheet.` },

    { type: 'h2', text: 'How to use this sheet' },
    {
      type: 'ul',
      items: [
        'For every row, tick one box. If you choose "Approve with edits" or "Reject", write the wording you would use, or your reason, in the last column.',
        'You are being asked to review general wellness wording only. You are not asked to endorse HerCare as a medical product, and HerCare does not give medical advice.',
        'Nothing in HerCare is personalised by AI. All text below is pre-written and fixed.',
        'Please complete the sign-off at the end. The HerCare team records your name and the date against every tip you approve; a tip cannot be shown to users until that is done.',
      ],
    },

    { type: 'h2', text: '1. What HerCare is, and what it is not' },
    {
      type: 'ul',
      items: [
        'A free period tracker and wellness helper: users record period dates, symptoms and mood, get reminders, and see general self-care tips.',
        'It does NOT diagnose, treat or advise on any condition. It does not infer pregnancy, PCOS or any other diagnosis from dates.',
        'It is NOT a contraception or fertility tool. It never shows ovulation, fertile days or pregnancy information.',
        'Every prediction is shown as an estimate, never as a fact.',
        'Hydration reminders never state an amount of water. Activity tips are always optional, and the user can choose to rest instead.',
        'While a period is logged, a few extra general tips are shown. That is a simple rule on the user\'s own dates.',
      ],
    },

    { type: 'h2', text: '2. Texts users will read' },
    { type: 'table', head: ['Text', 'Where users see it', 'Wording', 'Decision', 'Your edits / comments'], rows: textRows },

    { type: 'h2', text: '3. What users can record' },
    { type: 'p', text: 'These are the only choices offered. Users can also add a short free-text note, which is stored encrypted.' },
    { type: 'table', head: ['What', 'Options offered', 'Decision', 'Your edits / comments'], rows: optionRows },

    { type: 'h2', text: '4. How the next-period estimate works' },
    {
      type: 'ul',
      items: [
        `The app looks at the number of days between the start dates the user has recorded. Gaps shorter than ${limits.cycleMin} days or longer than ${limits.cycleMax} days are ignored (for example when a period was forgotten).`,
        `With at least ${plural(limits.minSamples, 'usable gap', 'usable gaps')}, the next period is estimated from the average of the most recent ${limits.recent}. With fewer, the app uses the cycle length the user chose (default ${limits.defaultCycleLength} days) and says there is too little history.`,
        `The usual period length is the average of recently recorded lengths, otherwise the user's choice (default ${limits.defaultPeriodDuration} days).`,
        `The calendar shows the next ${limits.predicted} estimated periods, clearly marked as estimates and different from logged days.`,
        'If the estimated date passes without a logged period, the app says it is "late by N days" and offers no explanation.',
        'The app never calls a cycle "irregular", "normal" or "abnormal", and never suggests a cause.',
      ],
    },
    { type: 'table', head: ['What', 'Settings above', 'Decision', 'Your edits / comments'], rows: [['The estimate rules and their limits', `Valid cycle ${limits.cycleMin} to ${limits.cycleMax} days · default cycle ${limits.defaultCycleLength} days · default period ${limits.defaultPeriodDuration} days`, decisionCell(), blankCell()]] },

    { type: 'h2', text: '5. Tips' },
    { type: 'p', text: 'Short, general, optional tips. "Only while a period is logged" tips are added to the always-shown ones during a period. Every tip below starts hidden and appears to users only after you approve it.' },
    {
      type: 'table',
      head: ['#', 'Type', 'Shown', 'Title', 'Wording', 'Status', 'Decision', 'Your edits / comments'],
      rows: tips.map((tip, index) => [
        String(index + 1),
        tip.category === 'food' ? 'Food' : 'Activity',
        tip.showWhen === 'period' ? 'Only while a period is logged' : 'Always',
        tip.title,
        tip.text,
        tipStatus(tip),
        decisionCell(),
        blankCell(),
      ]),
    },

    { type: 'h2', text: '6. Questions for you' },
    {
      type: 'ol',
      items: [
        'Are the symptom, flow, mood and energy options appropriate and easy to understand? Is anything missing, or anything that should not be offered?',
        'Should the app show a short "when to seek care" message, for example for very heavy bleeding or severe pain? A draft to edit: "If you have very heavy bleeding, severe pain, or anything that worries you, please speak to a doctor or nurse."',
        `Are the estimate settings acceptable (cycles outside ${limits.cycleMin} to ${limits.cycleMax} days ignored when averaging; defaults of ${limits.defaultCycleLength} and ${limits.defaultPeriodDuration} days)? Should the app suggest seeing a doctor after a very long gap or very irregular cycles? Today it deliberately does not.`,
        'What minimum age, or wording about who the app is for, should the welcome screen state?',
        'Are the food tips suitable for a broad audience? Should the wording mention dietary needs, allergies, vegetarian or vegan users, or conditions where the iron tip may not suit?',
        'Are the activity tips, and offering "rest today" instead, appropriate? Is "stop if pain or discomfort gets worse" enough?',
        'Are hydration reminders without any amount of water acceptable?',
        'Are the disclaimer and privacy wording accurate and understandable? Is there anything to add?',
        'Is there anything users should never be told, or must always be told?',
      ],
    },

    { type: 'h2', text: '7. Sign-off' },
    {
      type: 'signoff',
      fields: [
        'Reviewer name',
        'Professional qualification and registration number',
        'Organisation',
        'Date',
        'Signature',
        'Overall:  ☐ Approved as marked    ☐ Approved after the edits above    ☐ Not approved',
      ],
    },
    { type: 'p', text: `Content fingerprint: ${fingerprint}` },
  ];

  return { title: blocks[0].text, fingerprint, blocks };
};

// ---------------------------------------------------------------- Markdown
const mdCell = (cell) => String(typeof cell === 'string' ? cell : cell.text).replaceAll('|', '\\|').replace(/\r?\n/g, ' ');

export const renderMarkdown = (sheet) => sheet.blocks.map((block) => {
  switch (block.type) {
    case 'h1': return `# ${block.text}\n`;
    case 'h2': return `\n## ${block.text}\n`;
    case 'p': return `${block.text}\n`;
    case 'ul': return `${block.items.map((item) => `- ${item}`).join('\n')}\n`;
    case 'ol': return `${block.items.map((item, i) => `${i + 1}. ${item}`).join('\n')}\n`;
    case 'table': return [
      `| ${block.head.join(' | ')} |`,
      `| ${block.head.map(() => '---').join(' | ')} |`,
      ...block.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
      '',
    ].join('\n');
    case 'signoff': return [
      '| Field | Entry |', '| --- | --- |',
      ...block.fields.map((field) => `| ${mdCell(field)} | |`),
      '',
    ].join('\n');
    default: return '';
  }
}).join('\n');

// ---------------------------------------------------------------- HTML (open in a browser, print to PDF)
export const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const htmlCell = (cell, tag = 'td') => {
  const { text, kind } = typeof cell === 'string' ? { text: cell, kind: '' } : cell;
  return `<${tag}${kind ? ` class="${kind}"` : ''}>${escapeHtml(text)}</${tag}>`;
};

const STYLE = `
@page { size: A4 landscape; margin: 14mm; }
body { font: 12px/1.5 -apple-system, "Segoe UI", Arial, sans-serif; color: #1b1b1b; max-width: 1150px; margin: 0 auto; padding: 16px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 16px; margin: 28px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #c9c9c9; break-after: avoid; }
p, li { max-width: 95ch; }
table { border-collapse: collapse; width: 100%; margin: 10px 0 14px; }
th, td { border: 1px solid #8a8a8a; padding: 6px 8px; vertical-align: top; text-align: left; }
th { background: #ececec; }
tr { break-inside: avoid; }
td.decision { white-space: nowrap; font-size: 11.5px; }
td.blank { min-width: 230px; height: 46px; }
.signoff td:first-child { width: 38%; font-weight: 600; }
.signoff td { height: 34px; }
`;

export const renderHtml = (sheet) => {
  const body = sheet.blocks.map((block) => {
    switch (block.type) {
      case 'h1': return `<h1>${escapeHtml(block.text)}</h1>`;
      case 'h2': return `<h2>${escapeHtml(block.text)}</h2>`;
      case 'p': return `<p>${escapeHtml(block.text)}</p>`;
      case 'ul': return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
      case 'table': return `<table><thead><tr>${block.head.map((h) => htmlCell(h, 'th')).join('')}</tr></thead><tbody>${
        block.rows.map((row) => `<tr>${row.map((cell) => htmlCell(cell)).join('')}</tr>`).join('')}</tbody></table>`;
      case 'signoff': return `<table class="signoff"><tbody>${block.fields.map((field) => `<tr><td>${escapeHtml(field)}</td><td></td></tr>`).join('')}</tbody></table>`;
      default: return '';
    }
  }).join('\n');

  return `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(sheet.title)}</title>\n<style>${STYLE}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
};
