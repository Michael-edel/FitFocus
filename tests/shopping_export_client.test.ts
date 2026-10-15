import { expect, it } from 'vitest';
import { buildPersonalShoppingCsv } from '../services/shoppingExport';

it('matches the personal export headers and quantity formatting', () => {
  expect(buildPersonalShoppingCsv([
    { name: 'Рис', grams: 400 },
    { name: 'Мука', grams: 1250 },
  ])).toBe('Продукт,Количество\n"Рис","400 г"\n"Мука","1.3 кг"');
});

it('escapes quotes and preserves commas and line breaks inside ingredient names', () => {
  expect(buildPersonalShoppingCsv([{ name: 'Сыр, "домашний"\nмягкий', grams: 0 }]))
    .toBe('Продукт,Количество\n"Сыр, ""домашний""\nмягкий","0 г"');
});
