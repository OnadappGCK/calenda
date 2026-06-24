import { EventCategory, EventTag } from './events.service';
import { CATEGORY_FOLDER_FILES } from './category-image-manifest';

/** Convertit les anciennes valeurs de catégorie (stockées en DB) vers les nouvelles. */
export function normalizeCategory(cat: string): EventCategory {
  switch (cat) {
    case 'Concert':
    case 'Spectacle':           return 'Culture & spectacle';
    case 'Danse':
    case 'Vie sociale':         return 'Sortie';
    case 'Exposition':          return 'Arts & expos';
    case "Feux d'artifice":
    case 'Autre':               return 'Spécial';
    case 'Famille':             return 'Famille';
    default:                    return (cat as EventCategory);
  }
}

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function assetUrl(path: string) {
  const p = path.trim().replace(/\\/g, '/');
  if (!p) return '';
  const normalized = p
    .replace('/img/categorie/SPECTACLE/', '/img/categorie/CULTURE_SPECTACLE/')
    .replace('/img/categorie/EXPOSITION/', '/img/categorie/ARTS_EXPOS/')
    .replace('/img/categorie/VIE_SOCIALE/', '/img/categorie/SORTIE/')
    .replace('/img/categorie/FESTIVAL/', '/img/categorie/VIE_LOCALE/')
    .replace('/img/categorie/REUNION/', '/img/categorie/ACTIVITES/')
    .replace('/img/categorie/AUTRE/', '/img/categorie/SPECIAL/');
  if (normalized.startsWith('/')) return normalized;
  return `/assets/${normalized}`;
}

const CATEGORY_IMAGE_FOLDER: Record<EventCategory, string[]> = {
  'Culture & spectacle': ['CULTURE_SPECTACLE'],
  'Arts & expos': ['ARTS_EXPOS'],
  'Sortie': ['VIE_LOCALE'],
  'Activités': ['ACTIVITES'],
  'Vie locale': ['VIE_LOCALE'],
  'Famille': ['ACTIVITES'],
  'Spécial': ['SPECIAL'],
};

const FALLBACK_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#0f2746"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#dbeafe" font-family="Arial" font-size="28">Image indisponible</text></svg>',
  );

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function rotateBySeed<T>(list: T[], seed: string) {
  if (list.length <= 1) return [...list];
  const shift = hashString(seed) % list.length;
  return [...list.slice(shift), ...list.slice(0, shift)];
}

function categoryFallbackCandidates(category: string, seed: string) {
  const c = normalizeCategory(category);
  const folders = CATEGORY_IMAGE_FOLDER[c] ?? [];
  const candidates: string[] = [];
  for (const folder of folders) {
    const files = CATEGORY_FOLDER_FILES[folder] ?? [];
    const ordered = rotateBySeed(files, seed || `${c}-${folder}`);
    for (const file of ordered) {
      candidates.push(`/assets/img/categorie/${folder}/${file}`);
    }
  }
  return candidates;
}

export function defaultCategoryImageUrl(category: string, seed = ''): string {
  const candidates = categoryFallbackCandidates(category, seed);
  return candidates[0] ?? FALLBACK_PLACEHOLDER;
}

export function resolveEventImageUrl(category: EventCategory, imageUrl?: string | null, seed = ''): string {
  const raw = (imageUrl ?? '').trim();
  if (!raw) {
    return defaultCategoryImageUrl(category, seed);
  }
  if (isHttpUrl(raw)) {
    return raw;
  }
  return assetUrl(raw);
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
  const r = clampByte(rgb.r).toString(16).padStart(2, '0');
  const g = clampByte(rgb.g).toString(16).padStart(2, '0');
  const b = clampByte(rgb.b).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function mixHex(a: string, b: string, t: number) {
  const ar = hexToRgb(a);
  const br = hexToRgb(b);
  const clampedT = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: ar.r + (br.r - ar.r) * clampedT,
    g: ar.g + (br.g - ar.g) * clampedT,
    b: ar.b + (br.b - ar.b) * clampedT,
  });
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

/** Retourne une couleur (hex) associée à une catégorie d'événement. */
export function categoryColor(category: string): string {
  const c = normalizeCategory(category);
  switch (c) {
    case 'Culture & spectacle': return '#5C6BC0';
    case 'Arts & expos':        return '#E85D5D';
    case 'Sortie':              return '#2FBF71';
    case 'Activités':          return '#FF7043';
    case 'Vie locale':          return '#AB47BC';
    case 'Famille':             return '#F06292';
    case 'Spécial':            return '#F5B841';
    default:                    return '#8E6AD8';
  }
}

export function categoryForegroundColor(category: string): string {
  const base = categoryColor(category);
  return relativeLuminance(base) > 0.58 ? '#0f172a' : '#ffffff';
}

export function categoryGradient(category: string): string {
  const base = categoryColor(category);
  const light = mixHex(base, '#ffffff', 0.18);
  const dark = mixHex(base, '#000000', 0.08);
  return `linear-gradient(135deg, ${light} 0%, ${base} 55%, ${dark} 100%)`;
}

/** Retourne un emoji associé à une catégorie d'événement. */
export function categoryIcon(category: string): string {
  const c = normalizeCategory(category);
  switch (c) {
    case 'Culture & spectacle': return '🎭';
    case 'Arts & expos':        return '🎨';
    case 'Sortie':              return '💃';
    case 'Activités':          return '🏃';
    case 'Vie locale':          return '🛍️';
    case 'Famille':             return '👨‍👩‍👧‍👦';
    case 'Spécial':            return '🎆';
    default:                    return '•';
  }
}

export function tagIcon(tag: EventTag | string): string {
  switch (tag) {
    case 'CONCERT':     return '🎤';
    case 'SPORT':       return '⚽';
    case 'DANSE':       return '💃';
    case 'CONCOURS':    return '🏆';
    case 'FEU_DARTIFICE': return '🎆';
    case 'ENFANT':      return '🧒';
    case 'FAMILLE':     return '👨‍👩‍👧';
    case 'ADULTE':      return '🔞';
    case 'TOUT_PUBLIC': return '👥';
    case 'PLEIN_AIR':   return '☀️';
    case 'INTERIEUR':   return '🏠';
    case 'MUSIQUE':     return '🎵';
    case 'FESTIF':      return '🎉';
    case 'CALME':       return '🌿';
    case 'CULTUREL':    return '🏛️';
    case 'RENCONTRE':   return '🤝';
    case 'NETWORKING':  return '💼';
    case 'JOUR':        return '🌤️';
    case 'NUIT':        return '🌙';
    case 'FOOD':        return '🍽️';
    case 'BOISSON':     return '🥂';
    case 'DJ':          return '🎧';
    case 'LIVE':        return '🎸';
    default:            return '•';
  }
}

export function tagIconUrl(tag: EventTag | string): string {
  const emoji = tagIcon(tag);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <text x="16" y="22" font-size="20" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
