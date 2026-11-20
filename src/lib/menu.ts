// Menu data and photo lookup. One source of truth: src/content/menu.json (every price is still
// "to confirm" with Betawi; see pricesConfirmed).
import type { ImageMetadata } from 'astro';
import menu from '../content/menu.json';

export interface Dish {
  id: string;
  name: string;
  desc: string;
  price: number | null;
  photo: string | null;
  tags: string[];
  /** A published review singled this dish out: the sentence says which one. */
  pick?: string;
}
export interface Category {
  id: string;
  name: string;
  dishes: Dish[];
}

const dishFiles = import.meta.glob<{ default: ImageMetadata }>('../assets/dishes/*.webp', { eager: true });
const terraceFiles = import.meta.glob<{ default: ImageMetadata }>('../assets/terrace/*.webp', { eager: true });

const byName = (files: Record<string, { default: ImageMetadata }>) =>
  Object.fromEntries(Object.entries(files).map(([path, mod]) => [path.split('/').pop()!, mod.default]));
const dishPhotos = byName(dishFiles);
const terracePhotos = byName(terraceFiles);

/** The compressed dish photo for a menu.json `photo` value, or undefined when the dish has none. */
export const dishPhoto = (file: string | null) => (file ? dishPhotos[file] : undefined);
export const terracePhoto = (name: string) => terracePhotos[`${name}.webp`];

export const categories = menu.categories as unknown as Category[];
export const pricesConfirmed = menu.pricesConfirmed;
export const allDishes = categories.flatMap((c) => c.dishes);
export const dishById = (id: string) => allDishes.find((d) => d.id === id);

/** "AED 68", or an empty string when Betawi has not given a price. */
export const aed = (price: number | null) => (price === null ? '' : `AED ${price}`);

/** Sections shown on /menu, in menu.json order. The Vegan entry is a filter, not a list. */
export const menuSections = categories.map((c) => ({ id: c.id, name: c.name, isFilter: c.dishes.length === 0 }));
export const veganDishes = allDishes.filter((d) => d.tags.includes('vegan'));
