import { Panel } from './Panel.js';
import { h } from './dom.js';
import { LORE } from '../data/lore.js';

/** Bulunan bir notu/günlük sayfasını parşömen görünümünde gösterir. */
export class NoteUI extends Panel {
  constructor(game) {
    super(game, 'note', { title: 'Not', icon: '📜', className: 'panel-note' });
  }

  render() {
    const note = LORE[this.ctx.id];
    if (!note) return;
    this.titleEl.replaceChildren(`📜 ${note.title}`);
    this.body.replaceChildren(
      h('div', { class: 'note-text' }, note.text.map((p) => h('p', {}, p))),
      h('div', { class: 'd-actions', style: { justifyContent: 'flex-end', display: 'flex', gap: '8px' } },
        h('span', { class: 'inv-note', style: { marginRight: 'auto', marginTop: '8px' } }, 'Bu not Günlük → Notlar bölümüne eklendi.'),
        h('button', { class: 'btn primary', onclick: () => this.game.ui.close() }, 'Kapat'),
      ),
    );
  }
}
