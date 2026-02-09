import { EventCategory, EventTag } from './events.service';

function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}

function assetUrl(path: string) {
  const p = path.trim();
  if (!p) return '';
  if (p.startsWith('/')) return p;
  return `/assets/${p}`;
}

export function defaultCategoryImageUrl(category: EventCategory): string {
  switch (category) {
    case 'Concert':
    case 'Spectacle':
      return '/assets/img/categorie/SPECTACLE/spec1.png';
    case 'Danse':
      return '/assets/img/categorie/SPECTACLE/spec1.png';
    case "Feux d’artifice":
      return '/assets/img/categorie/FESTIVAL/fest1.png';
    case 'Exposition':
      return '/assets/img/categorie/EXPOSITION/expo1.png';
    case 'Autre':
      return '/assets/img/categorie/AUTRE/autre1.png';
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

/** Retourne une couleur (hex) associée à une catégorie d'événement. */
export function categoryColor(category: EventCategory): string {
  switch (category) {
    case 'Spectacle':
      return '#3b82f6';
    case 'Exposition':
      return '#ef4444';
    case 'Concert':
      return '#06b6d4';
    case 'Danse':
      return '#22c55e';
    case "Feux d’artifice":
      return '#f59e0b';
    default:
      return '#8b5cf6';
  }
}

/** Retourne une icône textuelle associée à une catégorie d'événement. */
export function categoryIcon(category: EventCategory): string {
  switch (category) {
    case 'Concert':
      return '♪';
    case 'Danse':
      return '⌁';
    case "Feux d’artifice":
      return '*';
    case 'Exposition':
      return '▦';
    case 'Spectacle':
      return '▸';
    default:
      return '•';
  }
}

export function tagIcon(tag: EventTag): string {
  switch (tag) {
    case 'MUSIQUE':
      return '🎵';
    case 'DANSE':
      return '🩰';
    case 'PLEIN AIR':
      return '☀️';
    case 'RENCONTRE':
      return '🤝';
    case 'FEU D’ARTIFICE':
      return '🎆';
    case 'SPORT':
      return '⚽';
    case 'MARCHÉ':
      return '🏠';
    default:
      return '🏠';
  }
}
