import { Panel } from './Panel.js';
import { h } from './dom.js';
import { CRAFT_CATEGORIES, STATIONS } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { RARITIES } from '../data/rarities.js';

export class CraftingUI extends Panel {
  constructor(game) {
    super(game, 'crafting', { title: 'Üretim', icon: '🔨', action: 'crafting' });
    this.category = 'all';
    this.selected = null;
    const refresh = () => this.refresh();
    game.bus.on('inventory:changed', refresh);
    game.bus.on('recipe:unlocked', refresh);
  }

  open(ctx) {
    if (ctx?.station === 'campfire') this.category = 'food';
    else if (ctx?.station === 'workbench') this.category = 'all';
    this.selected = null;
    super.open(ctx);
  }

  visibleRecipes() {
    const c = this.game.crafting;
    return c.recipes.filter((r) => this.category === 'all' || r.category === this.category).sort((a, b) => {
      const sa = c.check(a);
      const sb = c.check(b);
      const rank = (s) => (s.ok ? 0 : s.locked ? 3 : s.owned ? 2 : 1);
      return rank(sa) - rank(sb);
    });
  }

  render() {
    const g = this.game;
    const c = g.crafting;
    const cats = [{ id: 'all', name: 'Tümü', icon: '📦' }, ...CRAFT_CATEGORIES.filter((cat) => c.recipes.some((r) => r.category === cat.id))];
    const catList = h('div', { class: 'cat-list' },
      cats.map((cat) => {
        const list = c.recipes.filter((r) => cat.id === 'all' || r.category === cat.id);
        const ready = list.filter((r) => c.check(r).ok).length;
        return h('button', {
          class: `cat-btn ${this.category === cat.id ? 'active' : ''}`,
          onclick: () => { this.category = cat.id; this.selected = null; g.audio.play('click'); this.render(); },
        }, h('span', {}, cat.icon), cat.name, h('span', { class: 'n' }, ready ? `${ready} hazır` : ''));
      }),
    );

    const recipes = this.visibleRecipes();
    if (!this.selected || !recipes.includes(this.selected)) this.selected = recipes.find((r) => c.check(r).ok) ?? recipes[0] ?? null;

    const list = h('div', { class: 'recipe-list' },
      recipes.length
        ? recipes.map((r) => {
          const st = c.check(r);
          const cls = st.ok ? 'ok' : st.locked ? 'locked' : 'missing';
          return h('div', {
            class: `recipe ${cls} ${this.selected === r ? 'active' : ''}`,
            onclick: () => { this.selected = r; g.audio.play('click'); this.render(); },
          },
          h('div', { class: 'r-icon' }, st.locked && !r.unlock?.level ? '🔒' : c.resultIcon(r)),
          h('div', {},
            h('div', { class: 'r-name' }, st.locked && !r.unlock?.level ? '???' : `${st.locked ? '🔒 ' : ''}${c.resultName(r)}`),
            h('div', { class: 'r-sub' }, st.ok ? 'Üretilebilir' : st.reason),
          ));
        })
        : h('div', { class: 'empty' }, 'Bu kategoride henüz tarif yok.'),
    );

    this.body.replaceChildren(h('div', { class: 'craft-layout' }, catList, list, this.renderDetail()));
  }

  renderDetail() {
    const g = this.game;
    const c = g.crafting;
    const r = this.selected;
    if (!r) return h('div', { class: 'details' }, h('div', { class: 'empty' }, 'Bir tarif seç.'));
    const st = c.check(r);
    if (st.locked) {
      if (r.unlock?.level) {
        return h('div', { class: 'details' },
          h('div', { class: 'd-head' }, h('div', { class: 'd-icon' }, c.resultIcon(r)), h('div', {}, h('div', { class: 'd-name' }, c.resultName(r)), h('div', { class: 'd-rarity' }, `🔒 Seviye ${r.unlock.level} gerekli`))),
          h('div', { class: 'd-desc' }, r.desc ?? ITEMS[r.result]?.desc ?? ''),
          h('div', { class: 'section-title', style: { marginTop: '4px' } }, 'Malzemeler'),
          h('div', { class: 'ingredients' }, Object.entries(r.ingredients).map(([id, n]) => h('div', { class: 'ing' }, h('span', {}, `${ITEMS[id].icon} ${ITEMS[id].name}`), h('b', {}, `${n}`)))),
          r.station ? h('div', { class: 'station-row no' }, `${STATIONS[r.station].icon} ${STATIONS[r.station].name} gerekli`) : null,
        );
      }
      return h('div', { class: 'details' },
        h('div', { class: 'd-head' }, h('div', { class: 'd-icon' }, '🔒'), h('div', {}, h('div', { class: 'd-name' }, 'Kilitli Tarif'))),
        h('div', { class: 'd-desc' }, `${st.reason}. Görevleri tamamlayarak ve seviye atlayarak yeni tarifler açılır.`),
      );
    }
    const inv = g.player.inventory;
    const item = ITEMS[r.result];
    const rarity = RARITIES[item?.rarity ?? 'common'];
    const ings = h('div', { class: 'ingredients' },
      Object.entries(r.ingredients).map(([id, n]) => {
        const have = inv.count(id);
        return h('div', { class: `ing ${have >= n ? 'have' : 'miss'}` }, h('span', {}, `${ITEMS[id].icon} ${ITEMS[id].name}`), h('b', {}, `${have}/${n}`));
      }),
    );
    const station = r.station
      ? h('div', { class: `station-row ${c.isStationNear(r.station) ? 'ok' : 'no'}` },
        `${STATIONS[r.station].icon} ${STATIONS[r.station].name} ${c.isStationNear(r.station) ? '— yakında ✓' : 'yakınında olmalısın'}`)
      : null;
    const max = c.maxCraftable(r);
    const btns = h('div', { class: 'd-actions' },
      h('button', { class: 'btn primary', disabled: !st.ok, onclick: () => c.craft(r, 1) }, r.upgrade ? 'Üret ve Kuşan' : 'Üret'),
      !r.upgrade ? h('button', { class: 'btn', disabled: !st.ok || max < 5, onclick: () => c.craft(r, 5) }, '×5') : null,
      !r.upgrade ? h('button', { class: 'btn', disabled: !st.ok || max < 2, onclick: () => c.craft(r, max) }, `Tümü (${Math.max(0, max)})`) : null,
    );
    const statsChips = [];
    if (item?.food) {
      const f = item.food;
      if (f.hunger) statsChips.push(`🍖 +${f.hunger}`);
      if (f.thirst) statsChips.push(`💧 +${f.thirst}`);
      if (f.health) statsChips.push(`❤️ ${f.health > 0 ? '+' : ''}${f.health}`);
      if (f.stamina) statsChips.push(`⚡ +${f.stamina}`);
    }
    if (item?.damage) statsChips.push(`⚔️ ${item.damage}`);
    if (item?.durability) statsChips.push(`Dayanıklılık ${item.durability}`);
    return h('div', { class: 'details' },
      h('div', { class: 'd-head' },
        h('div', { class: 'd-icon' }, c.resultIcon(r)),
        h('div', {},
          h('div', { class: 'd-name', style: { color: rarity.color } }, c.resultName(r), (r.count ?? 1) > 1 ? ` ×${r.count}` : ''),
          h('div', { class: 'd-rarity', style: { color: rarity.color } }, rarity.name),
        ),
      ),
      h('div', { class: 'd-desc' }, r.desc ?? item?.desc ?? ''),
      statsChips.length ? h('div', { class: 'd-stats' }, statsChips.map((s) => h('span', { class: 'chip' }, s))) : null,
      h('div', { class: 'section-title', style: { marginTop: '4px' } }, 'Malzemeler'),
      ings,
      station,
      !st.ok && !st.missing && !st.station ? h('div', { class: 'interact-note' }, st.reason) : null,
      btns,
    );
  }
}
