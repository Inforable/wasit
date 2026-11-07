export const rp = (value) => value == null ? '—' : 'Rp' + Math.round(value).toLocaleString('id-ID');
export const rpShort = (value) => {
  if (value == null) return '—';
  const unit = Math.abs(value) >= 1_000_000 ? 1_000_000 : 1_000;
  return 'Rp' + (value / unit).toLocaleString('en-US', { maximumFractionDigits: 1 }) + (unit === 1_000_000 ? 'm' : 'k');
};
export const initials = (name = '') => name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('');
const AVATARS = [
  ['#5B50E0', '#4338CA'], ['#0891B2', '#0E7490'], ['#D97706', '#B45309'],
  ['#2A9566', '#1F7A4D'], ['#BE185D', '#9D174D'],
];
export function avatarBg(seed = '') {
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return `linear-gradient(155deg, ${AVATARS[hash % AVATARS.length].join(', ')})`;
}
