import { EventCategory, EventTag } from './events.service';

/** Convertit les anciennes valeurs de catégorie (stockées en DB) vers les nouvelles. */
export function normalizeCategory(cat: string): EventCategory {
  switch (cat) {
    case 'Concert':
    case 'Spectacle':           return 'Culture & spectacle';
    case 'Danse':               return 'Vie sociale';
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
  const p = path.trim();
  if (!p) return '';
  if (p.startsWith('/')) return p;
  return `/assets/${p}`;
}

export function defaultCategoryImageUrl(category: string): string {
  const category2 = normalizeCategory(category);
  switch (category2) {
    case 'Culture & spectacle':
      return '/assets/img/categorie/SPECTACLE/spec1.png';
    case 'Vie sociale':
      return '/assets/img/categorie/SPECTACLE/spec1.png';
    case 'Spécial':
      return '/assets/img/categorie/FESTIVAL/fest1.png';
    case 'Arts & expos':
      return '/assets/img/categorie/EXPOSITION/expo1.png';
    default:
      return '/assets/img/categorie/AUTRE/autre1.png';
  }
}

export function resolveEventImageUrl(category: EventCategory, imageUrl?: string | null): string {
  const raw = (imageUrl ?? '').trim();
  if (!raw) {
    return defaultCategoryImageUrl(category);
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
    case 'Vie sociale':         return '#2FBF71';
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
    case 'Vie sociale':         return '💃';
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
    case 'ENFANT':      return '�';
    case 'FAMILLE':     return '👨‍👩‍👧';
    case 'ADULTE':      return '🔞';
    case 'TOUT_PUBLIC': return '�';
    case 'PLEIN_AIR':   return '☀️';
    case 'INTERIEUR':   return '🏠';
    case 'MUSIQUE':     return '🎵';
    case 'FESTIF':      return '�';
    case 'CALME':       return '🌿';
    case 'CULTUREL':    return '�';
    case 'RENCONTRE':   return '🤝';
    case 'NETWORKING':  return '💼';
    case 'JOUR':        return '🌤️';
    case 'NUIT':        return '🌙';
    case 'FOOD':        return '�️';
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
