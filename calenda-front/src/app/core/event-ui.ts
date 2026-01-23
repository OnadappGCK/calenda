import { EventCategory } from './events.service';

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
