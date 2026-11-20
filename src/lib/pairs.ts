// "Goes well with" suggestions for the dish pages. These are OUR suggestions, built from the
// dishes already on Betawi's menu, so they stay true to the menu. Confirm with Dimple before
// launch. Rule of thumb: a main gets a green side and a drink; a spicy main gets a cooling
// drink; soups get crackers; starters, sides, drinks and desserts get none (they get "More
// from this section" instead).
import { allDishes, categories, dishById, type Dish } from './menu';

const MAINS = new Set(['rice-platters', 'chicken', 'duck', 'beef', 'fish-seafood', 'noodles-rice', 'start-here']);

export function pairsFor(dish: Dish): Dish[] {
  const home = categories.find((c) => c.dishes.some((d) => d.id === dish.id));
  if (!home) return [];
  const ids: string[] = [];
  if (home.id === 'soups') {
    ids.push('kerupuk-garlic-crackers', 'ice-tea-glass');
  } else if (MAINS.has(home.id) && dish.id !== 'seafood-combo') {
    ids.push(dish.tags.includes('vegan') ? 'kerupuk-garlic-crackers' : 'cah-kangkung');
    ids.push(dish.tags.includes('spicy') ? 'ice-bandung' : 'ice-tea-glass');
  } else if (dish.id === 'seafood-combo') {
    ids.push('jasmine-rice', 'ice-bandung');
  }
  return ids.map((id) => dishById(id)).filter((d): d is Dish => Boolean(d) && d!.id !== dish.id);
}

/** Up to `n` other dishes from the same section, the closest neighbours first. */
export function moreFrom(dish: Dish, n = 3): { title: string; id: string; dishes: Dish[] } | null {
  const home = categories.find((c) => c.dishes.some((d) => d.id === dish.id));
  if (!home) return null;
  const list = home.dishes;
  const i = list.findIndex((d) => d.id === dish.id);
  const others = list.filter((d) => d.id !== dish.id);
  const near = [...others].sort((a, b) => Math.abs(list.indexOf(a) - i) - Math.abs(list.indexOf(b) - i)).slice(0, n);
  return { title: home.name, id: home.id, dishes: near };
}

export { allDishes };
