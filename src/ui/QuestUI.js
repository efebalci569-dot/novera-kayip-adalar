import { Panel } from './Panel.js';
import { h } from './dom.js';
import { QUESTS, QUEST_TYPES } from '../data/quests.js';
import { LORE } from '../data/lore.js';
import { ITEMS } from '../data/items.js';
import { RECIPE_MAP } from '../data/recipes.js';
import { BUILDINGS } from '../data/buildings.js';

/** Görev günlüğü: aktif/tamamlanan görevler ve bulunan notlar. */
export class QuestUI extends Panel {
  constructor(game) {
    super(game, 'journal', { title: 'Günlük', icon: '📖', action: 'journal' });
    this.tab = 'quests';
    this.selected = null;
    this.tabsEl = h('div', { class: 'tabs' });
    this.extraHeader.append(this.tabsEl);
    for (const ev of ['quest:started', 'quest:progress', 'quest:completed', 'lore:added']) game.bus.on(ev, () => this.refresh());
  }

  open(ctx) {
    if (ctx?.tab) this.tab = ctx.tab;
    this.selected = ctx?.lore ?? null;
    super.open(ctx);
  }

  render() {
    this.tabsEl.replaceChildren(
      h('button', { class: `tab ${this.tab === 'quests' ? 'active' : ''}`, onclick: () => { this.tab = 'quests'; this.selected = null; this.render(); } }, '📜 Görevler'),
      h('button', { class: `tab ${this.tab === 'notes' ? 'active' : ''}`, onclick: () => { this.tab = 'notes'; this.selected = null; this.render(); } }, `📝 Notlar (${this.game.state.lore.length})`),
    );
    if (this.tab === 'quests') this.renderQuests();
    else this.renderNotes();
  }

  renderQuests() {
    const qs = this.game.quests;
    const active = qs.list();
    const completed = [...qs.completed].reverse();
    if (!this.selected || (!qs.isActive(this.selected) && !qs.isCompleted(this.selected))) this.selected = active[0]?.id ?? completed[0] ?? null;

    const item = (id, done) => {
      const q = QUESTS[id];
      return h('div', {
        class: `j-item ${this.selected === id ? 'active' : ''} ${done ? 'completed' : ''}`,
        onclick: () => { this.selected = id; this.render(); },
      },
      h('div', { class: 'k', style: { color: QUEST_TYPES[q.type].color } }, `${QUEST_TYPES[q.type].name}${done ? ' · Tamamlandı' : ''}`),
      h('div', { class: 't' }, q.title));
    };

    const list = h('div', { class: 'j-list' },
      h('div', { class: 'section-title' }, `Aktif (${active.length})`),
      active.length ? active.map((a) => item(a.id, false)) : h('div', { class: 'empty' }, 'Aktif görev yok.'),
      completed.length ? h('div', { class: 'section-title', style: { marginTop: '12px' } }, `Tamamlanan (${completed.length})`) : null,
      completed.map((id) => item(id, true)),
    );
    this.body.replaceChildren(h('div', { class: 'journal-layout' }, list, this.renderQuestDetail()));
  }

  renderQuestDetail() {
    const qs = this.game.quests;
    const id = this.selected;
    if (!id) return h('div', { class: 'j-detail' }, h('div', { class: 'empty' }, 'Görev seç.'));
    const q = QUESTS[id];
    const state = qs.active.get(id);
    const objs = q.objectives.map((o, i) => {
      const target = o.amount ?? 1;
      const cur = state ? Math.floor(state.progress[i]) : target;
      const done = cur >= target;
      return h('div', { class: `qt-obj ${done ? 'done' : ''}`, style: { fontSize: '14px' } },
        h('span', {}, `${done ? '✔' : '○'} ${o.label}`),
        h('span', { class: 'count' }, target > 1 ? `${cur}/${target}` : ''));
    });
    const r = q.rewards ?? {};
    const rewards = [];
    if (r.xp) rewards.push(`⭐ ${r.xp} XP`);
    for (const [it, n] of Object.entries(r.items ?? {})) rewards.push(`${ITEMS[it].icon} ${n} ${ITEMS[it].name}`);
    for (const rid of r.recipes ?? []) rewards.push(`📘 ${RECIPE_MAP[rid]?.name ?? ITEMS[RECIPE_MAP[rid]?.result]?.name ?? rid}`);
    for (const b of r.buildings ?? []) rewards.push(`🏗️ ${BUILDINGS[b].name}`);
    if (r.perkPoints) rewards.push(`✨ ${r.perkPoints} yetenek puanı`);
    if (r.features?.includes('crafting')) rewards.push('🔓 Üretim');
    if (r.features?.includes('building')) rewards.push('🔓 İnşa');
    if (r.features?.includes('map')) rewards.push('🔓 Harita');
    if (r.features?.includes('techtree')) rewards.push('🔓 Teknoloji Ağacı');
    return h('div', { class: 'j-detail' },
      h('div', { class: 'qt-type', style: { color: QUEST_TYPES[q.type].color } }, QUEST_TYPES[q.type].name),
      h('h3', {}, q.title),
      h('p', {}, q.desc),
      h('div', { class: 'section-title' }, 'Hedefler'),
      objs,
      q.hint ? h('div', { class: 'qt-hint', style: { fontSize: '13px', marginTop: '10px' } }, `💡 ${q.hint}`) : null,
      rewards.length ? h('div', { class: 'section-title', style: { marginTop: '14px' } }, 'Ödüller') : null,
      h('div', { class: 'rewards' }, rewards.map((t) => h('span', { class: 'chip' }, t))),
    );
  }

  renderNotes() {
    const lore = this.game.state.lore;
    if (!lore.length) {
      this.body.replaceChildren(h('div', { class: 'empty' }, 'Henüz bir not bulmadın. Adayı keşfet — enkazlar ve terk edilmiş kamplar hikâyeler saklar.'));
      return;
    }
    if (!this.selected || !lore.includes(this.selected)) this.selected = lore[lore.length - 1];
    const list = h('div', { class: 'j-list' },
      lore.map((id) => h('div', {
        class: `j-item ${this.selected === id ? 'active' : ''}`,
        onclick: () => { this.selected = id; this.render(); },
      }, h('div', { class: 't' }, LORE[id]?.title ?? id))),
    );
    const note = LORE[this.selected];
    const detail = h('div', { class: 'j-detail note-text' }, h('h3', {}, note.title), note.text.map((p) => h('p', {}, p)));
    this.body.replaceChildren(h('div', { class: 'journal-layout' }, list, detail));
  }
}
