import { EventCategory, EventTag } from './events.service';

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
