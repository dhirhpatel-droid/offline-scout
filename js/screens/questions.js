// Custom questions (#questions), Leads only: extra questions for this group's
// Scouts, shown in a period of the match. They never add to points.
// Questions are hidden, never deleted, so answers already given keep their
// wording. Changes need signal; the list itself shows offline.

import { backHref } from '../nav.js';
import { h, icon, formField, formMessage, busy, offlineNote, topbar } from '../ui.js';
import { currentGroup } from '../account.js';
import { isLead } from '../group-rules.js';
import { loadConfig } from '../config.js';
import { QUESTION_TYPES, checkQuestion } from '../custom-rules.js';
import { cachedQuestions, addQuestion, setHidden } from '../custom.js';
import { friendlyError, isOnline } from '../supabase.js';
import { getSetting, setSetting } from '../db.js';

const typeWord = (type) => QUESTION_TYPES.find(([t]) => t === type)?.[1] ?? type;

export async function renderQuestions() {
  const group = await currentGroup();
  if (!isLead(group)) {
    location.hash = '#home';
    return { el: h('div') };
  }
  const [config, questions] = await Promise.all([loadConfig(group.game_config_id), cachedQuestions(group.id)]);
  const online = isOnline();
  const message = formMessage();
  const note = await getSetting('questionsNote');
  if (note) {
    message.show(note, 'info');
    await setSetting('questionsNote', null);
  }
  const reload = async (text) => {
    await setSetting('questionsNote', text);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };

  // One row per question, with Hide (or Show again).
  const row = (q) => {
    const btn = online ? h('button', { class: 'small-btn', type: 'button',
      'aria-label': `${q.hidden_at ? 'Show' : 'Hide'} “${q.label}”` }, q.hidden_at ? 'Show again' : 'Hide') : null;
    btn?.addEventListener('click', () => busy(btn, '…', async () => {
      try {
        await setHidden(group, q.id, !q.hidden_at);
        await reload(q.hidden_at ? `“${q.label}” is back in the match.` : `“${q.label}” is hidden. Answers already given stay.`);
      } catch (err) { message.show(friendlyError(err), 'error'); }
    }));
    const options = q.type === 'choice' ? ` · ${(q.options ?? []).join(', ')}` : '';
    return h('li', { class: `row question-row${q.hidden_at ? ' hidden-q' : ''}` },
      h('div', {}, h('div', { class: 'title' }, q.label), h('div', { class: 'sub' }, `${typeWord(q.type)}${options}`)), btn);
  };

  const visible = questions.filter((q) => !q.hidden_at);
  const hidden = questions.filter((q) => q.hidden_at);
  const sectionOf = (q) => config.sections.find((s) => s.id === q.section) ?? config.sections.at(-1);
  const lists = config.sections.map((s) => {
    const mine = visible.filter((q) => sectionOf(q) === s);
    return mine.length ? h('section', {}, h('h2', { class: 'section-h' }, s.label), h('ul', { class: 'rows' }, mine.map(row))) : null;
  });

  // ---------- add a question ----------
  let section = config.sections.find((s) => s.id === 'post')?.id ?? config.sections.at(-1).id;
  let type = 'toggle';
  const segmented = (label, items, current, onPick) => {
    const id = `seg-${label.replace(/\W/g, '')}`;
    const buttons = items.map(([value, text]) => h('button', { type: 'button', 'aria-pressed': String(value === current) }, text));
    buttons.forEach((b, i) => b.addEventListener('click', () => {
      buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      onPick(items[i][0]);
    }));
    return h('div', { class: 'field' }, h('span', { class: 'field-label', id }, label),
      h('div', { class: 'segmented wrap', role: 'group', 'aria-labelledby': id }, buttons));
  };
  const labelField = formField('Question', { type: 'text', maxlength: 80, autocomplete: 'off', placeholder: 'e.g. Cycled from the far side' },
    'Short, so it reads at a glance in the stands.');
  const optionsField = formField('Answers to pick from', { type: 'text', autocomplete: 'off', placeholder: 'e.g. Left, Middle, Right' },
    '2 to 6, separated by commas.');
  optionsField.el.hidden = true;
  const save = h('button', { class: 'pill block', type: 'submit' }, 'Add question');
  const form = h('form', { class: 'form question-form', novalidate: true },
    h('h2', { class: 'section-h' }, 'Add a question'),
    segmented('When in the match', config.sections.map((s) => [s.id, s.label]), section, (v) => { section = v; }),
    segmented('Answer', QUESTION_TYPES, type, (v) => { type = v; optionsField.el.hidden = type !== 'choice'; }),
    labelField.el, optionsField.el,
    h('div', { class: 'actions' }, save));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = { section, type, label: labelField.input.value, options: optionsField.input.value };
    const errors = checkQuestion(values);
    labelField.setError(errors.label);
    optionsField.setError(errors.options);
    if (Object.keys(errors).length) return;
    busy(save, 'Adding…', async () => {
      try {
        await addQuestion(group, values);
        const where = config.sections.find((s) => s.id === section)?.label ?? section;
        await reload(`Added to ${where}. Scouts’ phones get it the next time they have signal.`);
      } catch (err) { message.show(friendlyError(err), 'error'); }
    });
  });

  const el = h('div', { class: 'screen' },
    topbar('Custom questions', backHref('#group')),
    h('main', { class: 'content' },
      h('p', { class: 'group-lede' }, 'Your own questions, shown in the match. They never add to points.'),
      message.el,
      visible.length ? lists : h('p', { class: 'plain' }, 'No questions yet.'),
      hidden.length ? h('details', { class: 'team-list' },
        h('summary', {}, `Hidden (${hidden.length})`, icon('next', 18)),
        h('ul', { class: 'rows' }, hidden.map(row))) : null,
      online ? form : offlineNote('Your questions are saved on this phone and still show in matches. Adding and hiding happen with signal.')),
  );
  return { el };
}
