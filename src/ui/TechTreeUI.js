import { Panel } from './Panel.js';
import { h } from './dom.js';
import { TECH_TREE } from '../data/techtree.js';

/** Teknoloji ağacı: açılan ve gelecekteki teknolojileri bağlantılarıyla gösterir. */
export class TechTreeUI extends Panel {
  constructor(game) {
    super(game, 'techtree', { title: 'Teknoloji Ağacı', icon: '🌳', action: 'techtree' });
    for (const ev of ['quest:completed', 'craft:completed']) game.bus.on(ev, () => this.refresh());
  }

  isDone(node) {
    const g = this.game;
    const u = node.unlockedBy;
    if (!u || node.future) return false;
    if (u.quest) return g.quests.isCompleted(u.quest);
    if (u.recipe === 'fiber_backpack') return (g.state.upgrades.backpack ?? 0) >= 1;
    if (u.level) return g.progression.level >= u.level;
    return false;
  }

  render() {
    const states = {};
    for (const n of TECH_TREE) states[n.id] = this.isDone(n) ? 'done' : 'locked';
    for (const n of TECH_TREE) {
      if (states[n.id] === 'done') continue;
      if (n.future) states[n.id] = 'future';
      else if (n.requires.every((r) => states[r] === 'done')) states[n.id] = 'next';
    }
    const tags = { done: 'Açıldı', next: 'Sıradaki', locked: 'Kilitli', future: 'Yakında' };
    const grid = h('div', { class: 'tech-grid' });
    const nodeEls = {};
    for (const n of TECH_TREE) {
      const el = h('div', { class: `tech-node ${states[n.id]}`, style: { gridRow: String(n.tier + 1), gridColumn: String(n.col + 1) } },
        h('span', { class: 'tn-tag' }, tags[states[n.id]]),
        h('div', { class: 'tn-icon' }, n.icon),
        h('div', {}, h('div', { class: 'tn-name' }, n.name), h('div', { class: 'tn-desc' }, n.desc)),
      );
      nodeEls[n.id] = el;
      grid.append(el);
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tech-svg');
    const wrap = h('div', { class: 'tech-wrap' }, svg, grid);
    this.body.replaceChildren(
      h('div', { class: 'inv-note', style: { marginTop: 0, marginBottom: '14px' } }, 'Görevleri tamamladıkça yeni teknolojiler açılır. Kesik çizgili düğümler sonraki güncellemelerde gelecek.'),
      wrap,
    );

    requestAnimationFrame(() => {
      const base = wrap.getBoundingClientRect();
      svg.setAttribute('width', base.width);
      svg.setAttribute('height', base.height);
      for (const n of TECH_TREE) {
        for (const req of n.requires) {
          const a = nodeEls[req].getBoundingClientRect();
          const b = nodeEls[n.id].getBoundingClientRect();
          const x1 = a.left + a.width / 2 - base.left;
          const y1 = a.bottom - base.top;
          const x2 = b.left + b.width / 2 - base.left;
          const y2 = b.top - base.top;
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          const my = (y1 + y2) / 2;
          path.setAttribute('d', `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`);
          const done = states[n.id] === 'done';
          path.setAttribute('stroke', done ? 'rgba(125,220,114,0.7)' : states[n.id] === 'next' ? 'rgba(255,200,87,0.6)' : 'rgba(255,255,255,0.15)');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('fill', 'none');
          if (states[n.id] === 'future') path.setAttribute('stroke-dasharray', '5 5');
          svg.append(path);
        }
      }
    });
  }
}
