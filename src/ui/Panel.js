import { h, kbd } from './dom.js';

/** Tüm açılır pencerelerin (envanter, üretim, harita…) temel sınıfı. */
export class Panel {
  constructor(game, id, { title, icon = '', action = null, className = '' } = {}) {
    this.game = game;
    this.id = id;
    this.action = action;
    this.isOpen = false;
    this.ctx = {};
    this.el = h('div', { class: `panel panel-${id} ${className}` });
    this.titleEl = h('div', { class: 'panel-title' }, icon ? `${icon} ` : '', title);
    if (action) {
      const code = game.settings.bindings[action]?.[0];
      if (code) this.titleEl.append(kbd(code));
    }
    const header = h('div', { class: 'panel-header' },
      this.titleEl,
      h('button', { class: 'panel-close', title: 'Kapat (Esc)', onclick: () => game.ui.close() }, '✕'),
    );
    this.extraHeader = h('div');
    this.body = h('div', { class: 'panel-body' });
    this.el.append(header, this.extraHeader, this.body);
  }

  open(ctx = {}) {
    this.ctx = ctx;
    this.isOpen = true;
    this.el.classList.add('open');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.el.classList.remove('open');
  }

  refresh() {
    if (this.isOpen) this.render();
  }

  render() {}

  update() {}
}
