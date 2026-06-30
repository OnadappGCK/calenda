import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { guessTags } from '../common/utils/guess-tags.util';
import { Event } from '../events/event.entity';
import { EventSlot } from '../events/event-slot.entity';
import { User } from '../users/user.entity';

/** APIDAE Tourisme API credentials (public, from site HTML source). */
const APIDAE_URL = 'https://api.apidae-tourisme.com/api/v002/recherche/list-objets-touristiques';
const APIDAE_API_KEY = 'OzJ7N1GW';
const APIDAE_PROJET_ID = 8175;
const APIDAE_SELECTION_ID = 167821;

type MergeOptions = {
  pages?: number;
  dryRun?: boolean;
};

type MergeResult = {
  scannedPages: number;
  foundUrls: number;
  dedupedUrls: number;
  created: number;
  skippedExisting: number;
  deleted: number;
  failed: number;
};

type PreviewResult = {
  scannedPages: number;
  foundUrls: number;
  dedupedUrls: number;
  parsed: number;
  withImage: number;
  withDescription: number;
  wouldCreate: number;
  skippedExisting: number;
  skippedPast: number;
  failed: number;
  urls: string[];
  toDelete: { id: string; titre: string; dateDebut: string; dateFin: string | null }[];
  failures: { url: string; reason: string }[];
  debugSamples: {
    status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'addable';
    url: string;
    reason?: string;
    titre?: string;
    dateDebut?: string;
    dateFin?: string | null;
    image?: boolean;
    descLen?: number;
  }[];
};

type ApplyResult = {
  processed: number;
  created: number;
  skippedExisting: number;
  skippedPast: number;
  deleted: number;
  failed: number;
  debugSamples: {
    status: 'parse_failed' | 'exception' | 'past' | 'existing' | 'created';
    url: string;
    reason?: string;
    titre?: string;
    dateDebut?: string;
    dateFin?: string | null;
  }[];
};

/** Élément extrait de l'API APIDAE. */
type AgendaItem = {
  url: string;
  titre: string;
  dateDebut: Date;
  dateFin: Date | null;
  heureDebut: string;
  heureFin: string;
  description: string;
  imageUrl: string | null;
  lieu: string;
  adresse: string;
};

@Injectable()
export class SaussetMergeService {
  private readonly logger = new Logger(SaussetMergeService.name);
  private static readonly MERGE_USER = {
    email: 'merge.sausset@calendago.fr',
    pseudo: 'sausset les pins',
    ville: 'Sausset-les-Pins',
    lieu: 'merge',
  };
  private mergeOrganizerId: string | null = null;

  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(EventSlot) private readonly slotsRepo: Repository<EventSlot>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  private async getMergeOrganizer(): Promise<User> {
    if (this.mergeOrganizerId) {
      const cached = await this.usersRepo.findOne({ where: { id: this.mergeOrganizerId } });
      if (cached) return cached;
    }

    const cfg = SaussetMergeService.MERGE_USER;
    let user = await this.usersRepo.findOne({ where: [{ email: cfg.email }, { pseudo: cfg.pseudo }] });
    if (!user) {
      const passwordHash = await bcrypt.hash(`merge-sausset-${Date.now()}`, 10);
      user = this.usersRepo.create({
        email: cfg.email,
        pseudo: cfg.pseudo,
        ville: cfg.ville,
        lieu: cfg.lieu,
        profileImage: null,
        numero: null,
        passwordHash,
        isAdmin: false,
        emailVerified: true,
        emailVerificationToken: null,
      });
      user = await this.usersRepo.save(user);
      this.logger.log(`sausset_merge_user_created id=${user.id} email=${user.email}`);
    }

    this.mergeOrganizerId = user.id;
    return user;
  }

  async backfillOrganizer(): Promise<number> {
    const organizer = await this.getMergeOrganizer();
    const events = await this.eventsRepo.find({ where: { origin: EventOrigin.SAUSSET_LES_PINS } });
    const toUpdate = events.filter((ev) => !ev.organisateur || ev.organisateur.id !== organizer.id);
    if (toUpdate.length === 0) return 0;

    for (const ev of toUpdate) {
      ev.organisateur = organizer;
    }
    await this.eventsRepo.save(toUpdate);
    this.logger.log(`sausset_backfill_organizer updated=${toUpdate.length} organizerId=${organizer.id}`);
    return toUpdate.length;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async merge(options?: MergeOptions): Promise<MergeResult> {
    await this.backfillOrganizer();
    const pages = Math.max(1, Math.min(10, options?.pages ?? 1));
    const dryRun = options?.dryRun ?? false;

    const preview = await this.preview({ pages });
    if (dryRun) {
      return {
        scannedPages: preview.scannedPages,
        foundUrls: preview.foundUrls,
        dedupedUrls: preview.dedupedUrls,
        created: preview.wouldCreate,
        skippedExisting: preview.skippedExisting,
        deleted: 0,
        failed: preview.failed,
      };
    }

    const toDeleteIds = preview.toDelete.map((e) => e.id);
    const apply = await this.apply({ urls: preview.urls, toDeleteIds });
    return {
      scannedPages: preview.scannedPages,
      foundUrls: preview.foundUrls,
      dedupedUrls: preview.dedupedUrls,
      created: apply.created,
      skippedExisting: apply.skippedExisting,
      deleted: apply.deleted,
      failed: preview.failed + apply.failed,
    };
  }

  async preview(options?: { pages?: number }): Promise<PreviewResult> {
    const pages = Math.max(1, Math.min(10, options?.pages ?? 1));

    let skippedExisting = 0;
    let failed = 0;
    let parsed = 0;
    let withImage = 0;
    let withDescription = 0;
    let wouldCreate = 0;
    let skippedPast = 0;
    const failures: { url: string; reason: string }[] = [];
    const debugSamples: PreviewResult['debugSamples'] = [];
    const titresVus = new Set<string>();
    const now = new Date();

    const agendaItems = await this.listAgendaItems(pages);
    const seenUrls = new Set<string>();
    const uniqueItems: AgendaItem[] = [];
    for (const item of agendaItems) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      uniqueItems.push(item);
    }
    const urls: string[] = [];

    this.logger.log(
      `sausset_preview_start pages=${pages} foundUrls=${agendaItems.length} uniqueUrls=${uniqueItems.length}`,
    );

    let sampleLogged = 0;

    for (const item of uniqueItems) {
      try {
        const detail = await this.enrichDetail(item);
        if (!detail) {
          this.logger.warn(`sausset_parse_failed url=${item.url} reason=enrich_failed`);
          if (failures.length < 5) failures.push({ url: item.url, reason: 'enrich_failed' });
          if (debugSamples.length < 20) debugSamples.push({ status: 'parse_failed', url: item.url, reason: 'enrich_failed' });
          failed++;
          continue;
        }

        parsed++;
        titresVus.add(detail.titre);

        const endForPast = this.effectiveEndForPastCheck(detail.dateDebut, detail.dateFin);
        if (endForPast < now) {
          skippedPast++;
          if (debugSamples.length < 20) {
            debugSamples.push({
              status: 'past', url: item.url, titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
            });
          }
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`sausset_detail_sample status=past url=${item.url} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        if (detail.imageUrl) withImage++;
        if (detail.description && detail.description.trim() && detail.description.trim() !== detail.titre.trim()) withDescription++;

        const dayStart = new Date(detail.dateDebut);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(detail.dateDebut);
        dayEnd.setHours(23, 59, 59, 999);

        const existing = await this.eventsRepo.findOne({
          where: { origin: EventOrigin.SAUSSET_LES_PINS, titre: detail.titre, dateDebut: Between(dayStart, dayEnd) },
        });

        if (existing) {
          skippedExisting++;
          urls.push(item.url);
          if (debugSamples.length < 20) {
            debugSamples.push({
              status: 'existing', url: item.url, titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
            });
          }
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`sausset_detail_sample status=existing url=${item.url} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        wouldCreate++;
        urls.push(item.url);

        if (debugSamples.length < 20) {
          debugSamples.push({
            status: 'addable', url: item.url, titre: detail.titre,
            dateDebut: detail.dateDebut.toISOString(),
            dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
            image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
          });
        }

        if (sampleLogged < 10) {
          sampleLogged++;
          this.logger.log(
            `sausset_detail_sample status=addable url=${item.url} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} image=${detail.imageUrl ? 1 : 0} descLen=${(detail.description ?? '').length}`,
          );
        }
      } catch {
        if (failures.length < 5) failures.push({ url: item.url, reason: 'exception' });
        if (debugSamples.length < 20) debugSamples.push({ status: 'exception', url: item.url, reason: 'exception' });
        failed++;
      }
    }

    this.logger.log(
      `sausset_preview_done pages=${pages} parsed=${parsed} addable=${wouldCreate} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const futureDbEvents = await this.eventsRepo.find({
      where: { origin: EventOrigin.SAUSSET_LES_PINS, dateDebut: MoreThanOrEqual(yesterday) },
    });
    const toDelete = futureDbEvents
      .filter((ev) => !titresVus.has(ev.titre))
      .map((ev) => ({
        id: ev.id,
        titre: ev.titre,
        dateDebut: ev.dateDebut.toISOString(),
        dateFin: ev.dateFin ? ev.dateFin.toISOString() : null,
      }));

    this.logger.log(`sausset_preview_toDelete count=${toDelete.length}`);

    return {
      scannedPages: pages,
      foundUrls: agendaItems.length,
      dedupedUrls: uniqueItems.length,
      parsed, withImage, withDescription,
      wouldCreate, skippedExisting, skippedPast, failed,
      toDelete, urls, failures, debugSamples,
    };
  }

  async apply(payload: { urls: string[]; toDeleteIds?: string[] }): Promise<ApplyResult> {
    const uniqueUrls = [...new Set(payload.urls ?? [])];
    const toDeleteIds = [...new Set(payload.toDeleteIds ?? [])];
    let created = 0;
    let skippedExisting = 0;
    let skippedPast = 0;
    let deleted = 0;
    let failed = 0;
    const debugSamples: ApplyResult['debugSamples'] = [];
    const now = new Date();
    const mergeOrganizer = await this.getMergeOrganizer();

    // Re-fetch the agenda to build url→item map
    const agendaItems = await this.listAgendaItems(10);
    const itemMap = new Map<string, AgendaItem>();
    for (const item of agendaItems) {
      if (!itemMap.has(item.url)) itemMap.set(item.url, item);
    }

    this.logger.log(`sausset_apply_start urls=${uniqueUrls.length}`);
    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const agendaItem = itemMap.get(sourceUrl);
        if (!agendaItem) {
          if (debugSamples.length < 20) debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: 'not_in_agenda' });
          failed++;
          continue;
        }

        const detail = await this.enrichDetail(agendaItem);
        if (!detail) {
          if (debugSamples.length < 20) debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: 'enrich_failed' });
          failed++;
          continue;
        }

        const endForPast = this.effectiveEndForPastCheck(detail.dateDebut, detail.dateFin);
        if (endForPast < now) {
          skippedPast++;
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`sausset_apply_sample status=past url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        const applyDayStart = new Date(detail.dateDebut);
        applyDayStart.setHours(0, 0, 0, 0);
        const applyDayEnd = new Date(detail.dateDebut);
        applyDayEnd.setHours(23, 59, 59, 999);

        const existing = await this.eventsRepo.findOne({
          where: { origin: EventOrigin.SAUSSET_LES_PINS, titre: detail.titre, dateDebut: Between(applyDayStart, applyDayEnd) },
        });

        if (existing) {
          let shouldSave = false;
          if (detail.imageUrl && !existing.imageUrl) {
            existing.imageUrl = detail.imageUrl;
            shouldSave = true;
          }
          if (!existing.organisateur || existing.organisateur.id !== mergeOrganizer.id) {
            existing.organisateur = mergeOrganizer;
            shouldSave = true;
          }
          if (shouldSave) {
            await this.eventsRepo.save(existing);
          }
          skippedExisting++;
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`sausset_apply_sample status=existing_updated url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        const ev = this.eventsRepo.create({
          titre: detail.titre,
          description: detail.description,
          categorie: detail.categorie,
          origin: EventOrigin.SAUSSET_LES_PINS,
          ville: detail.ville,
          lieu: detail.lieu,
          adresse: detail.adresse,
          latitude: null,
          longitude: null,
          theme: null,
          caracteristiques: detail.caracteristiques.length ? detail.caracteristiques : null,
          imageUrl: detail.imageUrl,
          tarif: 'Non renseigné',
          contact: null,
          dateDebut: detail.dateDebut,
          dateFin: detail.dateFin,
          couleur: null,
          enAvant: false,
          public: false,
          organisateur: mergeOrganizer,
        });

        const saved = await this.eventsRepo.save(ev);

        if (detail.slots && detail.slots.length > 0) {
          const slotEntities = detail.slots.map((s, i) =>
            this.slotsRepo.create({
              eventId: saved.id,
              date: s.date,
              heureDebut: s.heureDebut,
              heureFin: s.heureFin,
              ordre: i,
            }),
          );
          await this.slotsRepo.save(slotEntities);
        }

        created++;

        if (debugSamples.length < 20) {
          debugSamples.push({
            status: 'created', url: sourceUrl, titre: detail.titre,
            dateDebut: detail.dateDebut.toISOString(),
            dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
          });
        }

        if (sampleLogged < 10) {
          sampleLogged++;
          this.logger.log(`sausset_apply_sample status=created url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
        }
      } catch {
        if (debugSamples.length < 20) debugSamples.push({ status: 'exception', url: sourceUrl, reason: 'exception' });
        failed++;
      }
    }

    for (const id of toDeleteIds) {
      try {
        await this.slotsRepo.delete({ eventId: id });
        await this.eventsRepo.delete(id);
        deleted++;
        this.logger.log(`sausset_apply_deleted id=${id}`);
      } catch {
        this.logger.warn(`sausset_apply_delete_failed id=${id}`);
        failed++;
      }
    }

    this.logger.log(
      `sausset_apply_done processed=${uniqueUrls.length} created=${created} deleted=${deleted} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    return { processed: uniqueUrls.length, created, skippedExisting, skippedPast, deleted, failed, debugSamples };
  }

  // ─── APIDAE API ──────────────────────────────────────────────────────────

  /**
   * Fetch events from the APIDAE Tourisme API (used by sausset-tourisme.com).
   * Returns structured event data with precise dates, hours, location, images.
   */
  private async listAgendaItems(_pages: number): Promise<AgendaItem[]> {
    const items: AgendaItem[] = [];

    const query = JSON.stringify({
      apiKey: APIDAE_API_KEY,
      projetId: APIDAE_PROJET_ID,
      selectionIds: [APIDAE_SELECTION_ID],
      count: 50,
      first: 0,
      order: 'DATE_OUVERTURE',
      locales: ['fr'],
      responseFields: [
        'id', 'nom', 'presentation', 'illustrations', 'ouverture',
        'informations', 'localisation',
      ],
    });

    const params = new URLSearchParams();
    params.append('query', query);

    let data: any;
    try {
      const res = await fetch(APIDAE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`apidae_fetch_failed_${res.status}`);
      data = await res.json();
    } catch (e) {
      this.logger.warn(`sausset_apidae_fetch_failed error=${(e as Error)?.message}`);
      return items;
    }

    const objets = data?.objetsTouristiques ?? [];
    this.logger.log(`sausset_apidae_fetched numFound=${data?.numFound ?? 0} returned=${objets.length}`);

    for (const obj of objets) {
      const parsed = this.parseApidaeEvent(obj);
      if (parsed) items.push(parsed);
    }

    return items;
  }

  /**
   * Parse an APIDAE objet touristique into our AgendaItem format.
   */
  private parseApidaeEvent(obj: any): AgendaItem | null {
    const titre = obj?.nom?.libelleFr;
    if (!titre) return null;

    const apidaeId = String(obj.id ?? '');
    const url = `apidae:${apidaeId}`; // Virtual URL used as unique key

    // Dates & horaires from ouverture.periodesOuvertures[0]
    const periodes = obj.ouverture?.periodesOuvertures ?? [];
    const firstPeriod = periodes[0];
    if (!firstPeriod?.dateDebut) return null;

    const heureDebut = this.formatApidaeTime(firstPeriod.horaireOuverture) ?? '09:00';
    const heureFin = this.formatApidaeTime(firstPeriod.horaireFermeture) ?? '23:59';

    // Use the real start time in dateDebut so it displays correctly
    const dateDebut = new Date(`${firstPeriod.dateDebut}T${heureDebut}:00`);
    const dateFin = firstPeriod.dateFin && firstPeriod.dateFin !== firstPeriod.dateDebut
      ? new Date(`${firstPeriod.dateFin}T${heureFin}:00`)
      : null;

    // Description
    const descCourt = obj.presentation?.descriptifCourt?.libelleFr ?? '';
    const descDetaille = obj.presentation?.descriptifDetaille?.libelleFr ?? '';
    const description = (descDetaille || descCourt || titre).trim();

    // Image
    const illustrations = obj.illustrations ?? [];
    let imageUrl: string | null = null;
    for (const ill of illustrations) {
      const trads = ill?.traductionFichiers ?? [];
      for (const trad of trads) {
        if (trad?.url) {
          imageUrl = trad.url;
          break;
        }
      }
      if (imageUrl) break;
    }

    // Lieu & adresse
    const loc = obj.localisation?.adresse;
    const lieu = loc?.nomDuLieu || loc?.adresse1 || 'Sausset-les-Pins';
    const adresseStr = [loc?.nomDuLieu, loc?.adresse1, loc?.codePostal, loc?.commune?.nom]
      .filter(Boolean).join(', ') || 'Sausset-les-Pins, 13960';

    return {
      url,
      titre,
      dateDebut,
      dateFin,
      heureDebut,
      heureFin,
      description,
      imageUrl,
      lieu,
      adresse: adresseStr,
    };
  }

  /** Format APIDAE time "18:00:00" → "18:00" */
  private formatApidaeTime(time: string | undefined | null): string | null {
    if (!time) return null;
    const parts = time.split(':');
    if (parts.length >= 2) {
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      }
    }
    return null;
  }

  // ─── Detail enrichment (now uses APIDAE data directly) ─────────────────────

  private async enrichDetail(item: AgendaItem): Promise<{
    titre: string;
    description: string;
    imageUrl: string | null;
    dateDebut: Date;
    dateFin: Date | null;
    ville: string;
    lieu: string;
    adresse: string | null;
    categorie: EventCategory;
    caracteristiques: EventTag[];
    slots: { date: string; heureDebut: string; heureFin: string }[];
  } | null> {
    const titre = item.titre;
    if (!titre) return null;

    const description = item.description || titre;
    const imageUrl = item.imageUrl || null;
    const lieu = item.lieu || 'Sausset-les-Pins';
    const adresse = item.adresse || `${lieu}, 13960 Sausset-les-Pins`;
    const heureDebut = item.heureDebut || '09:00';
    const heureFin = item.heureFin || '23:59';

    const categorie = this.guessCategory(titre, description);
    const caracteristiques = guessTags(titre, description);
    const slots = this.generateSlots(item.dateDebut, item.dateFin, heureDebut, heureFin);

    return {
      titre, description, imageUrl,
      dateDebut: item.dateDebut, dateFin: item.dateFin,
      ville: 'Sausset-les-Pins', lieu, adresse,
      categorie, caracteristiques, slots,
    };
  }

  // ─── Slot generation ────────────────────────────────────────────────────────

  private generateSlots(
    dateDebut: Date,
    dateFin: Date | null,
    heureDebut: string,
    heureFin: string,
  ): { date: string; heureDebut: string; heureFin: string }[] {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    const startKey = toKey(dateDebut);
    return [{ date: startKey, heureDebut, heureFin }];
  }

  // ─── Category guessing ─────────────────────────────────────────────────────

  private guessCategory(titre: string, description: string): EventCategory {
    const text = `${titre} ${description}`.toLowerCase();

    if (/spectacle|th[éeè][aâ]tre|op[eé]ra|concert|vesperales|vespérales|musique|classique|karao|dj|jazz|blues/i.test(text)) {
      return EventCategory.CULTURE_SPECTACLE;
    }
    if (/expo|galerie|vernissage|art|peinture|sculpture|cin[ée]ma/i.test(text)) {
      return EventCategory.ARTS_EXPOS;
    }
    if (/sport|football|voile|golf|stage|natation|trail|triathlon|course|danse/i.test(text)) {
      return EventCategory.ACTIVITES;
    }
    if (/enfant|famille|jeune/i.test(text)) {
      return EventCategory.FAMILLE;
    }
    if (/f[eê]te|national|pardon|thonade|carnaval|podium|march[ée]|sardina/i.test(text)) {
      return EventCategory.VIE_LOCALE;
    }
    if (/don de sang|concours|c[eé]r[eé]monie|bachelier|festival/i.test(text)) {
      return EventCategory.VIE_LOCALE;
    }

    return EventCategory.SORTIE;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

  private effectiveEndForPastCheck(dateDebut: Date, dateFin: Date | null) {
    if (dateFin) return dateFin;
    const d = new Date(dateDebut);
    d.setHours(23, 59, 59, 999);
    return d;
  }
}
