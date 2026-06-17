import { Directive, HostListener, Input } from '@angular/core';
import { EventCategory } from '../core/events.service';
import { defaultCategoryImageUrl } from '../core/event-ui';

/**
 * Directive appliquée sur les <img> d'événements.
 * Si l'image externe ne charge pas, bascule automatiquement vers l'image de catégorie.
 *
 * Usage :
 *   <img [src]="imageUrlFor(e)"
 *        [appEventImgFallback]="e.categorie"
 *        [eventSeed]="e.id" />
 */
@Directive({
  selector: 'img[appEventImgFallback]',
  standalone: true,
})
export class EventImgFallbackDirective {
  @Input() appEventImgFallback!: EventCategory;
  @Input() eventSeed = '';

  @HostListener('error', ['$event'])
  onError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (!img) return;
    const fallback = defaultCategoryImageUrl(this.appEventImgFallback, this.eventSeed);
    if (img.src === fallback) return;
    img.onerror = null;
    img.src = fallback;
  }
}
