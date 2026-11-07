import { CATEGORIES } from './catalog.mjs';
import { HttpError } from './errors.mjs';
export const demoScenarios = CATEGORIES.map(category => ({
  id: category.id, title: category.label,
  description: 'Compare labeled synthetic providers, confirm each cost, and approve both agreement roles explicitly.',
  synthetic: true,
}));
export function demoInput(key) {
  const category = CATEGORIES.find(item => item.id === key);
  if (!category) throw new HttpError(404, 'not_found', 'This demo scenario was not found.');
  return {
    category: category.id, request_text: category.label + ' in Kelapa Gading tomorrow at 10:00 WIB, maximum budget Rp750.000.',
    location_label: 'Kelapa Gading', schedule_label: 'tomorrow at 10:00 WIB', max_budget: 750000,
    target_price: null, target_authorized: false, scripted: true,
  };
}
