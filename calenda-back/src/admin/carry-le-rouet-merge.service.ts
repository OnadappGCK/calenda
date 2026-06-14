import { normalizePhone } from './merge-utils';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { guessTags } from '../common/utils/guess-tags.util';
import { EtablissementType } from '../common/enums/etablissement-type.enum';
import { EtablissementsService } from '../etablissements/etablissements.service';
import { Event } from '../events/event.entity';
import { EventSlot } from '../events/event-slot.entity';
import { User } from '../users/user.entity';

const BASE_URL = 'https://www.otcarrylerouet.fr';
const AGENDA_URL = `${BASE_URL}/agenda-carry-le-rouet.html`;

/** Paths (sans extension ni slash initial) exclus de l'extraction d'événements. */
const EXCLUDED_SLUGS = new Set([
  'agenda-carry-le-rouet',
  'contact',
  'plan-site',
  'mentions-legales',
  'conditions-generales-de-vente',
  'brochures',
  'office-de-tourisme',
  'partenaires',
  'espace-presse',
  'carnet-voyage',
  'accueil',
  'fiche-info-simple-ecrire-message',
]);

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

@Injectable()
export class CarryLeRouetMergeService {
  private readonly logger = new Logger(CarryLeRouetMergeService.name);
  private static readonly MERGE_USER = {
    email: 'merge.carry-le-rouet@calendago.fr',
    pseudo: 'carry le rouet',
    ville: 'Carry-le-Rouet',
    lieu: 'merge',
  };
  private mergeOrganizerId: string | null = null;

  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(EventSlot) private readonly slotsRepo: Repository<EventSlot>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly etablissementsService: EtablissementsService,
  ) {}

  private async getMergeOrganizer(): Promise<User> {
    if (this.mergeOrganizerId) {
      const cached = await this.usersRepo.findOne({ where: { id: this.mergeOrganizerId } });
      if (cached) return cached;
    }

    const cfg = CarryLeRouetMergeService.MERGE_USER;
    let user = await this.usersRepo.findOne({ where: [{ email: cfg.email }, { pseudo: cfg.pseudo }] });
    if (!user) {
      const passwordHash = await bcrypt.hash(`merge-carry-le-rouet-${Date.now()}`, 10);
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
      this.logger.log(`carry_merge_user_created id=${user.id} email=${user.email}`);
    }

    this.mergeOrganizerId = user.id;
    return user;
  }

  async backfillOrganizer(): Promise<number> {
    const organizer = await this.getMergeOrganizer();
    const events = await this.eventsRepo.find({ where: { origin: EventOrigin.CARRY_LE_ROUET } });
    const toUpdate = events.filter((ev) => !ev.organisateur || ev.organisateur.id !== organizer.id);
    if (toUpdate.length === 0) return 0;

    for (const ev of toUpdate) {
      ev.organisateur = organizer;
    }
    await this.eventsRepo.save(toUpdate);
    this.logger.log(`carry_backfill_organizer updated=${toUpdate.length} organizerId=${organizer.id}`);
    return toUpdate.length;
  }

  private sanitizeCarryTags(tags: EventTag[] | null | undefined): EventTag[] {
    return (tags ?? []).filter((tag) => tag !== EventTag.DANSE);
  }

  async backfillForbiddenDanceTag(): Promise<number> {
    const events = await this.eventsRepo.find({ where: { origin: EventOrigin.CARRY_LE_ROUET } });
    const toUpdate = events.filter((ev) => (ev.caracteristiques ?? []).includes(EventTag.DANSE));
    if (toUpdate.length === 0) return 0;

    for (const ev of toUpdate) {
      ev.caracteristiques = this.sanitizeCarryTags(ev.caracteristiques);
    }
    await this.eventsRepo.save(toUpdate);
    this.logger.log(`carry_backfill_tags updated=${toUpdate.length} removed=DANSE`);
    return toUpdate.length;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  async merge(options?: MergeOptions): Promise<MergeResult> {
    await this.backfillOrganizer();
    await this.backfillForbiddenDanceTag();
    const pages = Math.max(1, Math.min(10, options?.pages ?? 2));
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
    const pages = Math.max(1, Math.min(10, options?.pages ?? 2));

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

    const allUrls = await this.listAgendaUrls(pages);
    const uniqueUrls = [...new Set(allUrls)];
    const urls: string[] = [];

    this.logger.log(
      `carry_preview_start pages=${pages} foundUrls=${allUrls.length} uniqueUrls=${uniqueUrls.length}`,
    );

    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          this.logger.warn(`carry_parse_failed url=${sourceUrl} reason=${parsedRes.reason}`);
          if (failures.length < 5) failures.push({ url: sourceUrl, reason: parsedRes.reason });
          if (debugSamples.length < 20) debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: parsedRes.reason });
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
              status: 'past', url: sourceUrl, titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
            });
          }
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`carry_detail_sample status=past url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()}`);
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
          where: { origin: EventOrigin.CARRY_LE_ROUET, titre: detail.titre, dateDebut: Between(dayStart, dayEnd) },
        });

        if (existing) {
          skippedExisting++;
          urls.push(sourceUrl);
          if (debugSamples.length < 20) {
            debugSamples.push({
              status: 'existing', url: sourceUrl, titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
            });
          }
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`carry_detail_sample status=existing url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        wouldCreate++;
        urls.push(sourceUrl);

        if (debugSamples.length < 20) {
          debugSamples.push({
            status: 'addable', url: sourceUrl, titre: detail.titre,
            dateDebut: detail.dateDebut.toISOString(),
            dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
            image: !!detail.imageUrl, descLen: (detail.description ?? '').length,
          });
        }

        if (sampleLogged < 10) {
          sampleLogged++;
          this.logger.log(
            `carry_detail_sample status=addable url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} image=${detail.imageUrl ? 1 : 0} descLen=${(detail.description ?? '').length}`,
          );
        }
      } catch {
        if (failures.length < 5) failures.push({ url: sourceUrl, reason: 'exception' });
        if (debugSamples.length < 20) debugSamples.push({ status: 'exception', url: sourceUrl, reason: 'exception' });
        failed++;
      }
    }

    this.logger.log(
      `carry_preview_done pages=${pages} parsed=${parsed} addable=${wouldCreate} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const futureDbEvents = await this.eventsRepo.find({
      where: { origin: EventOrigin.CARRY_LE_ROUET, dateDebut: MoreThanOrEqual(yesterday) },
    });
    const toDelete = futureDbEvents
      .filter((ev) => !titresVus.has(ev.titre))
      .map((ev) => ({
        id: ev.id,
        titre: ev.titre,
        dateDebut: ev.dateDebut.toISOString(),
        dateFin: ev.dateFin ? ev.dateFin.toISOString() : null,
      }));

    this.logger.log(`carry_preview_toDelete count=${toDelete.length}`);

    return {
      scannedPages: pages,
      foundUrls: allUrls.length,
      dedupedUrls: uniqueUrls.length,
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

    this.logger.log(`carry_apply_start urls=${uniqueUrls.length}`);
    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          this.logger.warn(`carry_parse_failed_apply url=${sourceUrl} reason=${parsedRes.reason}`);
          if (debugSamples.length < 20) debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: parsedRes.reason });
          failed++;
          continue;
        }

        const endForPast = this.effectiveEndForPastCheck(detail.dateDebut, detail.dateFin);
        if (endForPast < now) {
          skippedPast++;
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`carry_apply_sample status=past url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        const applyDayStart = new Date(detail.dateDebut);
        applyDayStart.setHours(0, 0, 0, 0);
        const applyDayEnd = new Date(detail.dateDebut);
        applyDayEnd.setHours(23, 59, 59, 999);

        const existing = await this.eventsRepo.findOne({
          where: { origin: EventOrigin.CARRY_LE_ROUET, titre: detail.titre, dateDebut: Between(applyDayStart, applyDayEnd) },
        });

        if (existing) {
          // Update slots with freshly parsed data
          await this.slotsRepo.delete({ eventId: existing.id });
          if (detail.slots.length > 0) {
            const slotEntities = detail.slots.map((s, i) =>
              this.slotsRepo.create({ eventId: existing.id, date: s.date, heureDebut: s.heureDebut, heureFin: s.heureFin, ordre: i }),
            );
            await this.slotsRepo.save(slotEntities);
          }
          let shouldSaveExisting = false;
          if (detail.imageUrl && !existing.imageUrl) {
            existing.imageUrl = detail.imageUrl;
            shouldSaveExisting = true;
          }
          if (!existing.organisateur || existing.organisateur.id !== mergeOrganizer.id) {
            existing.organisateur = mergeOrganizer;
            shouldSaveExisting = true;
          }
          if (shouldSaveExisting) {
            await this.eventsRepo.save(existing);
          }
          skippedExisting++;
          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(`carry_apply_sample status=existing_updated url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          }
          continue;
        }

        if (parsedRes.isEverydayActivity) {
          await this.etablissementsService.upsertFromSource(sourceUrl, {
            nom: detail.titre,
            description: detail.description,
            imageUrl: detail.imageUrl,
            adresse: detail.adresse,
            ville: detail.ville,
            contact: detail.contact,
            horaires: detail.horaires,
            heureOuverture: detail.heureOuverture,
            heureFermeture: detail.heureFermeture,
            type: EtablissementType.ACTIVITE,
            tags: [],
            latitude: detail.latitude,
            longitude: detail.longitude,
          });
          created++;
          this.logger.log(`carry_apply_everyday_activite url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          continue;
        }

        const ev = this.eventsRepo.create({
          titre: detail.titre,
          description: detail.description,
          categorie: detail.categorie,
          origin: EventOrigin.CARRY_LE_ROUET,
          ville: detail.ville,
          lieu: detail.lieu,
          adresse: detail.adresse,
          latitude: detail.latitude,
          longitude: detail.longitude,
          theme: null,
          caracteristiques: detail.caracteristiques.length ? detail.caracteristiques : null,
          imageUrl: detail.imageUrl,
          tarif: detail.tarif ?? 'Non renseigné',
          contact: detail.contact,
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
          this.logger.log(`carry_apply_sample status=created url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
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
        this.logger.log(`carry_apply_deleted id=${id}`);
      } catch {
        this.logger.warn(`carry_apply_delete_failed id=${id}`);
        failed++;
      }
    }

    this.logger.log(
      `carry_apply_done processed=${uniqueUrls.length} created=${created} deleted=${deleted} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    return { processed: uniqueUrls.length, created, skippedExisting, skippedPast, deleted, failed, debugSamples };
  }

  // ─── Agenda scraping ───────────────────────────────────────────────────────

  private async listAgendaUrls(pages: number): Promise<string[]> {
    const allUrls: string[] = [];
    for (let page = 1; page <= pages; page++) {
      const url = page === 1 ? AGENDA_URL : `${AGENDA_URL}?page=${page}`;
      let html: string;
      try {
        html = await this.fetchHtml(url);
      } catch {
        this.logger.warn(`carry_agenda_fetch_failed page=${page} url=${url}`);
        break;
      }

      const urls = this.extractEventUrlsFromAgendaPage(html);
      const uniq = [...new Set(urls)];
      this.logger.log(`carry_agenda_page page=${page} found=${urls.length} unique=${uniq.length}`);
      if (uniq.length) {
        this.logger.log(`carry_agenda_page_sample page=${page} sample=${JSON.stringify(uniq.slice(0, 5))}`);
      }

      allUrls.push(...urls);

      if (uniq.length === 0) {
        this.logger.log(`carry_agenda_page_empty page=${page} — stopping`);
        break;
      }
    }
    return allUrls;
  }

  private extractEventUrlsFromAgendaPage(html: string): string[] {
    const out: string[] = [];
    const src = html ?? '';

    const add = (raw: string) => {
      const href = this.decodeHtml((raw ?? '').trim());
      if (!href) return;
      try {
        const u = new URL(href, BASE_URL);
        if (!u.host.endsWith('otcarrylerouet.fr')) return;
        if (!u.pathname.toLowerCase().endsWith('.html')) return;
        if (u.search) return;

        const slug = u.pathname.replace(/^\//, '').replace(/\.html$/i, '').toLowerCase();
        if (EXCLUDED_SLUGS.has(slug)) return;
        if (slug.startsWith('agenda-') || slug === '') return;

        const normalized = `${BASE_URL}/${slug}.html`;
        out.push(normalized);
      } catch {
        return;
      }
    };

    const reQuoted = /href\s*=\s*(['"])([^'">\s]+)\1/gi;
    let m: RegExpExecArray | null;
    while ((m = reQuoted.exec(src))) {
      if (m?.[2]) add(m[2]);
    }

    const reAbs = /https?:\/\/(?:www\.)?otcarrylerouet\.fr\/[^\s"'<>?#]+\.html/gi;
    const absMatches = src.match(reAbs) ?? [];
    for (const u of absMatches) add(u);

    return out;
  }

  // ─── Detail page parsing ────────────────────────────────────────────────────

  private parseDetailResult(sourceUrl: string, html: string): {
    detail: null | {
      titre: string;
      description: string;
      imageUrl: string | null;
      tarif: string | null;
      contact: string | null;
      dateDebut: Date;
      dateFin: Date | null;
      slots: { date: string; heureDebut: string; heureFin: string }[];
      ville: string;
      lieu: string;
      adresse: string | null;
      latitude: number | null;
      longitude: number | null;
      categorie: EventCategory;
      caracteristiques: EventTag[];
      horaires: string | null;
      heureOuverture: string | null;
      heureFermeture: string | null;
    };
    isEverydayActivity: boolean;
    reason: string;
  } {
    const jsonLd = this.extractJsonLdEvent(html);

    const ogTitle = this.matchMeta(html, 'og:title');
    const titleTag = this.matchTag(html, 'title');
    const fallbackTitleRaw = (ogTitle ?? titleTag ?? '')
      .replace(/\s*[-|]\s*Carry[-\s]le[-\s]Rouet\s*$/i, '')
      .replace(/\s*[-|]\s*Office de Tourisme\s*$/i, '');

    const titre = this.decodeHtml((jsonLd?.name ?? fallbackTitleRaw) || '').trim();
    if (!titre) return { detail: null, isEverydayActivity: false, reason: 'missing_title' };

    const ogDesc = this.matchMeta(html, 'og:description');
    const presDesc = this.extractPresentationText(html);
    const jsonDesc = this.decodeHtml((jsonLd?.description ?? '') || '');
    const metaDesc = this.decodeHtml((ogDesc ?? '') || '');
    const description = [presDesc, jsonDesc, metaDesc]
      .filter((x): x is string => Boolean(x && x.trim()))
      .sort((a, b) => b.length - a.length)[0];

    const ogImage = this.matchMeta(html, 'og:image');
    const contentImage = this.extractFirstContentImage(html);
    const imageUrl = (this.firstString(jsonLd?.image) ?? ogImage ?? contentImage ?? null)
      ? this.decodeHtml((this.firstString(jsonLd?.image) ?? ogImage ?? contentImage)!).trim() || null
      : null;

    const tarif = this.cleanTarifText(this.extractTarifText(html)) ?? 'Non renseigné';
    const contact = this.extractContactText(html);

    const pageText = this.htmlToText(html);

    const startMicro = this.matchItemPropContent(html, 'startDate');
    const endMicro = this.matchItemPropContent(html, 'endDate');
    const timeStart = this.matchDateTimeAttr(html);
    const range = this.extractFrenchDateRange(html);

    const now = new Date();
    const min = new Date(now);
    min.setFullYear(min.getFullYear() - 1);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 3);
    const plausible = (d: Date | null) => {
      if (!d) return null;
      if (isNaN(d.getTime())) return null;
      if (d < min || d > max) return null;
      return d;
    };

    const bestStart = this.pickBestDate(this.collectCandidateDates(html));

    const dateDebut =
      plausible(this.parseAnyDateTime(jsonLd?.startDate)) ??
      plausible(this.parseAnyDateTime(startMicro)) ??
      plausible(this.parseAnyDateTime(timeStart)) ??
      plausible(range?.start ?? null) ??
      plausible(this.extractIsoDateTime(html)) ??
      plausible(this.extractYmdDate(html)) ??
      plausible(this.extractFrenchLongDate(html)) ??
      plausible(this.extractStartDateTime(html)) ??
      plausible(this.extractFrenchSlashDate(html)) ??
      plausible(bestStart);

    let dateFin: Date | null =
      plausible(this.parseAnyDateTime(jsonLd?.endDate)) ??
      plausible(this.parseAnyDateTime(endMicro)) ??
      plausible(range?.end ?? null) ??
      plausible(this.extractEndDateTime(html, dateDebut)) ??
      null;

    if (!dateDebut) {
      return { detail: null, isEverydayActivity: false, reason: 'missing_dates' };
    }

    const ville = 'Carry-le-Rouet';

    const localisationText = this.extractLocalisationTextFromPageText(pageText);
    const localisationLines = (localisationText ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((l) => !this.isNoiseLine(l));
    const localisationFirstLine = localisationLines[0] ?? null;

    const htmlAddress = this.extractAddressFromHtml(html);
    const jsonLdPlaceName = this.decodeHtml(jsonLd?.locationName ?? '') || '';
    const lieuFromHtml = this.extractLieu(html) ?? '';
    const lieuCandidate =
      (htmlAddress?.salle && !this.isNoiseLine(htmlAddress.salle) ? htmlAddress.salle : '') ||
      (jsonLdPlaceName && !this.isNoiseLine(jsonLdPlaceName) ? jsonLdPlaceName : '') ||
      (localisationFirstLine && !this.looksLikeAddressLine(localisationFirstLine) ? localisationFirstLine : '') ||
      (lieuFromHtml && !this.isNoiseLine(lieuFromHtml) ? lieuFromHtml : '') ||
      this.decodeHtml(jsonLd?.addressLocality ?? '') ||
      'Carry-le-Rouet';
    const lieu = (lieuCandidate || 'Carry-le-Rouet').trim();

    const street = this.decodeHtml(jsonLd?.streetAddress ?? '') || '';
    const postal = this.decodeHtml(jsonLd?.postalCode ?? '') || '';
    const locality = this.decodeHtml(jsonLd?.addressLocality ?? '') || '';
    const addrCityLine = [postal, locality].filter(Boolean).join(' ').trim();
    const adresseFromJsonLd = [street, addrCityLine].filter(Boolean).join(', ').trim();

    const adresseFromHtml = htmlAddress
      ? [
          htmlAddress.salle,
          htmlAddress.ligne1,
          [htmlAddress.codePostal, htmlAddress.ville].filter(Boolean).join(' ').trim(),
        ]
          .map((x) => (x ?? '').trim())
          .filter(Boolean)
          .join(', ')
          .trim()
      : '';

    const geoFromHtml = this.extractGeoFromHtml(html);
    const latitude = jsonLd?.latitude ?? geoFromHtml?.lat ?? null;
    const longitude = jsonLd?.longitude ?? geoFromHtml?.lon ?? null;

    const adresseLines =
      localisationLines.length > 1 && !this.looksLikeAddressLine(localisationLines[0])
        ? localisationLines.slice(1)
        : localisationLines;
    const adresseFallback = adresseLines.join(', ').trim();
    const adresse = (adresseFromHtml || adresseFromJsonLd || adresseFallback || lieu || 'Carry-le-Rouet').trim() || null;

    const categorie = this.guessCategory(sourceUrl, titre);
    const caracteristiques = this.sanitizeCarryTags(guessTags(titre, description ?? ''));

    const opening = this.extractOpeningHoursText(html) ?? this.extractOpeningHoursFromText(pageText);

    if (!range && dateDebut) {
      const existingHour = dateDebut.getHours();
      const hasExplicitTime = existingHour !== 0 && existingHour !== 12;
      const hr = opening ? this.extractHoursRange(opening) : null;
      if (hr && !hasExplicitTime) {
        dateDebut.setHours(hr.start.hh, hr.start.mm, 0, 0);
        const endD = new Date(dateDebut);
        endD.setHours(hr.end.hh, hr.end.mm, 0, 0);
        if (endD <= dateDebut) endD.setDate(endD.getDate() + 1);
        dateFin = endD;
      } else if (opening && !hasExplicitTime) {
        const startOnly = this.extractTime(opening, /à\s*partir\s*de\s*(\d{1,2}(?::\d{2}|h\d{0,2})?)\s*/i);
        if (startOnly) {
          dateDebut.setHours(startOnly.hh, startOnly.mm, 0, 0);
          dateFin = null;
        }
      }
    }

    const jsonLdHours = this.extractHoursFromJsonLd(html);
    const jsonLdDays = this.extractDaysFromJsonLd(html);
    const slots = this.generateSlots(dateDebut, dateFin, opening, presDesc ?? description ?? null, jsonLdHours, jsonLdDays);
    const isEverydayActivity = this.isEverydayPattern(opening, dateDebut, dateFin);
    const hr = opening ? this.extractHoursRange(opening) : null;
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const heureOuverture = hr ? `${pad2(hr.start.hh)}:${pad2(hr.start.mm)}` : null;
    const heureFermeture = hr ? `${pad2(hr.end.hh)}:${pad2(hr.end.mm)}` : null;

    return {
      detail: {
        titre,
        description: description || titre,
        imageUrl,
        tarif,
        contact,
        dateDebut,
        dateFin,
        slots,
        ville,
        lieu,
        adresse,
        latitude: typeof latitude === 'number' ? latitude : null,
        longitude: typeof longitude === 'number' ? longitude : null,
        categorie,
        caracteristiques,
        horaires: opening,
        heureOuverture,
        heureFermeture,
      },
      isEverydayActivity,
      reason: 'ok',
    };
  }

  // ─── Slot generation ────────────────────────────────────────────────────────

  private generateSlots(
    dateDebut: Date,
    dateFin: Date | null,
    openingText: string | null,
    dayFallbackText?: string | null,
    hoursOverride?: { hDebut: string; hFin: string } | null,
    daysOverride?: Set<number> | null,
  ): { date: string; heureDebut: string; heureFin: string }[] {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const toKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const toHM = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    const hr = openingText ? this.extractHoursRange(openingText) : null;
    let hDebutStr: string;
    let hFinStr: string;

    if (hr) {
      hDebutStr = `${pad2(hr.start.hh)}:${pad2(hr.start.mm)}`;
      hFinStr = `${pad2(hr.end.hh)}:${pad2(hr.end.mm)}`;
    } else if (hoursOverride) {
      hDebutStr = hoursOverride.hDebut;
      hFinStr = hoursOverride.hFin;
    } else {
      const h = dateDebut.getHours();
      hDebutStr = h === 12 || h === 0 || h === 1 ? '09:00' : toHM(dateDebut);
      const sameDay = dateFin && toKey(dateFin) === toKey(dateDebut);
      if (dateFin && sameDay) {
        const ef = dateFin.getHours();
        const em = dateFin.getMinutes();
        hFinStr = ef === 23 && em === 59 ? '23:59' : toHM(dateFin);
      } else {
        hFinStr = '23:59';
      }
    }

    const endKey = dateFin ? toKey(dateFin) : toKey(dateDebut);
    const allowedDays = openingText
      ? this.extractDaysOfWeek(openingText)
      : daysOverride ?? (dayFallbackText ? this.extractDaysOfWeek(dayFallbackText) : null);
    const slots: { date: string; heureDebut: string; heureFin: string }[] = [];
    const cur = new Date(dateDebut.getFullYear(), dateDebut.getMonth(), dateDebut.getDate());

    while (toKey(cur) <= endKey && slots.length < 365) {
      if (!allowedDays || allowedDays.has(cur.getDay())) {
        slots.push({ date: toKey(cur), heureDebut: hDebutStr, heureFin: hFinStr });
      }
      cur.setDate(cur.getDate() + 1);
    }

    return slots.length > 0 ? slots : [{ date: toKey(dateDebut), heureDebut: hDebutStr, heureFin: hFinStr }];
  }

  private isEverydayPattern(openingText: string | null, dateDebut: Date, dateFin: Date | null): boolean {
    if (!openingText) return false;
    if (!/tous les jours|chaque jour|ouvert tous/i.test(openingText)) return false;
    if (!dateFin) return false;
    const diffDays = (dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 14;
  }

  private extractDaysOfWeek(text: string): Set<number> | null {
    const src = (text ?? '').toLowerCase();
    if (/tous les jours|chaque jour/i.test(src)) return null;
    const dayOrder = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    const dayToNum: Record<string, number> = {
      lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 0,
    };
    const rangeRe = /\bdu\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+au\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/i;
    const rm = rangeRe.exec(src);
    if (rm) {
      const startIdx = dayOrder.indexOf((rm[1] ?? '').toLowerCase());
      const endIdx = dayOrder.indexOf((rm[2] ?? '').toLowerCase());
      if (startIdx >= 0 && endIdx >= 0) {
        const found = new Set<number>();
        const len = ((endIdx - startIdx + 7) % 7) + 1;
        for (let i = 0; i < len; i++) {
          found.add(dayToNum[dayOrder[(startIdx + i) % 7]]);
        }
        return found;
      }
    }
    const found = new Set<number>();
    for (const name of dayOrder) {
      if (new RegExp(`\\b${name}s?\\b`).test(src)) found.add(dayToNum[name]);
    }
    return found.size > 0 ? found : null;
  }

  // ─── HTML utilities (same CMS as Martigues / Tourinsoft) ───────────────────

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: { 'user-agent': 'calenda-bot/1.0', accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`fetch_failed_${res.status}`);
    return await res.text();
  }

  private decodeHtml(s: string): string {
    const map: Record<string, string> = {
      amp: '&', quot: '"', apos: "'", nbsp: ' ', lt: '<', gt: '>',
      eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë', agrave: 'à', acirc: 'â',
      auml: 'ä', ccedil: 'ç', icirc: 'î', iuml: 'ï', ocirc: 'ô', ouml: 'ö',
      ugrave: 'ù', ucirc: 'û', uuml: 'ü', oelig: 'œ', aelig: 'æ',
      rsquo: '\u2019', lsquo: '\u2018', laquo: '«', raquo: '»',
      ndash: '–', mdash: '—', hellip: '…', deg: '°',
    };
    return (s ?? '')
      .replace(/&#(\d+);/g, (_m, n) => {
        const code = Number(n);
        try { return Number.isFinite(code) ? String.fromCodePoint(code) : ''; } catch { return ''; }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
        const code = Number.parseInt(String(hex), 16);
        try { return Number.isFinite(code) ? String.fromCodePoint(code) : ''; } catch { return ''; }
      })
      .replace(/&([a-z]+);/gi, (_m, name) => map[String(name).toLowerCase()] ?? `&${name};`)
      .trim();
  }

  private extractFirstContentImage(html: string): string | null {
    const content = html
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');
    const skipRe = /logo|icon|sprite|avatar|picto|blank|placeholder|favicon/i;
    // Prefer <figure> images (main content gallery)
    const figRe = /<figure[\s\S]*?<img\b[^>]*?\bsrc=['"]([^'"\s]+)['"][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = figRe.exec(content))) {
      const src = m[1];
      if (src && !skipRe.test(src)) return src;
    }
    // Fallback: any content image
    const re = /<img\b[^>]*?\bsrc=['"]([^'"\s]+)['"][^>]*>/gi;
    while ((m = re.exec(content))) {
      const src = m[1];
      if (!src || skipRe.test(src)) continue;
      if (!/\.(?:jpg|jpeg|png|webp)(\?[^'"]*)?$/i.test(src)) continue;
      return src;
    }
    return null;
  }

  private htmlToText(html: string): string {
    const cleaned = (html ?? '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const withBreaks = cleaned
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<\/div\s*>/gi, '\n')
      .replace(/<\/li\s*>/gi, '\n');
    const noTags = withBreaks.replace(/<[^>]+>/g, ' ');
    const decoded = this.decodeHtml(noTags);
    return decoded
      .replace(/[\u2018\u2019\u201A\u201B\u02BC]/g, "'")
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private matchMeta(html: string, property: string): string | null {
    const p = this.escapeRegExp(property);
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=['"]${p}['"][^>]+content=['"]([^'"]+)['"]|<meta[^>]+content=['"]([^'"]+)['"][^>]+(?:property|name)=['"]${p}['"]`,
      'i',
    );
    const m = re.exec(html ?? '');
    return m ? this.decodeHtml((m[1] ?? m[2] ?? '').trim()) : null;
  }

  private matchTag(html: string, tag: string): string | null {
    const p = this.escapeRegExp(tag);
    const re = new RegExp(`<${p}[^>]*>([^<]+)<\\/${p}>`, 'i');
    const m = re.exec(html ?? '');
    return m?.[1] ? this.decodeHtml(m[1]).trim() : null;
  }

  private matchFirstGroup(html: string, re: RegExp): string | null {
    const m = re.exec(html ?? '');
    return m?.[1] ? this.decodeHtml(m[1]).trim() : null;
  }

  private escapeRegExp(s: string): string {
    return (s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private firstString(v: unknown): string | null {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) { const s = v.find((x) => typeof x === 'string'); return typeof s === 'string' ? s : null; }
    if (typeof v === 'object') { const anyV = v as any; if (typeof anyV.url === 'string') return anyV.url; }
    return null;
  }

  private parseNumberLike(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const n = Number(String(v).trim().replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // ─── JSON-LD ────────────────────────────────────────────────────────────────

  private extractJsonLdEvent(html: string): Record<string, any> | null {
    const re = /<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html ?? ''))) {
      try {
        const obj = JSON.parse(m[1]);
        const candidates = Array.isArray(obj) ? obj : obj['@graph'] ? obj['@graph'] : [obj];
        for (const c of candidates) {
          if (c && typeof c === 'object') {
            const type = c['@type'];
            const types = Array.isArray(type) ? type : [type];
            if (types.some((t: unknown) => typeof t === 'string' && /event/i.test(t))) {
              return {
                name: c.name ?? null,
                description: c.description ?? null,
                startDate: c.startDate ?? null,
                endDate: c.endDate ?? null,
                image: c.image ?? null,
                locationName: c.location?.name ?? null,
                streetAddress: c.location?.address?.streetAddress ?? null,
                postalCode: c.location?.address?.postalCode ?? null,
                addressLocality: c.location?.address?.addressLocality ?? null,
                latitude: this.parseNumberLike(c.location?.geo?.latitude ?? c.geo?.latitude),
                longitude: this.parseNumberLike(c.location?.geo?.longitude ?? c.geo?.longitude),
              };
            }
          }
        }
      } catch { continue; }
    }
    return null;
  }

  private extractJsonLdTypes(html: string): string[] {
    const out: string[] = [];
    const re = /<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html ?? ''))) {
      try {
        const obj = JSON.parse(m[1]);
        const candidates = Array.isArray(obj) ? obj : obj['@graph'] ? obj['@graph'] : [obj];
        for (const c of candidates) {
          const t = c?.['@type'];
          if (t) out.push(...(Array.isArray(t) ? t : [t]).map(String));
        }
      } catch { continue; }
    }
    return out;
  }

  // ─── Date extraction ────────────────────────────────────────────────────────

  private parseAnyDateTime(v: unknown): Date | null {
    if (!v || typeof v !== 'string') return null;
    const raw = v.trim();
    if (!raw) return null;
    const iso = new Date(raw);
    if (!isNaN(iso.getTime())) return iso;
    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw);
    if (fr) {
      const d = new Date(Number(fr[3]), Number(fr[2]) - 1, Number(fr[1]), fr[4] ? Number(fr[4]) : 12, fr[5] ? Number(fr[5]) : 0);
      return isNaN(d.getTime()) ? null : d;
    }
    const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw);
    if (ymd) {
      const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), ymd[4] ? Number(ymd[4]) : 12, ymd[5] ? Number(ymd[5]) : 0);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private matchItemPropContent(html: string, itemprop: string): string | null {
    const p = this.escapeRegExp(itemprop);
    const re = new RegExp(`itemprop=['"]${p}['"][^>]*content=['"]([^'"]+)['"]`, 'i');
    return re.exec(html)?.[1] ?? null;
  }

  private matchDateTimeAttr(html: string): string | null {
    return /<time[^>]+datetime=['"]([^'"]+)['"]/i.exec(html)?.[1] ?? null;
  }

  private extractIsoDateTime(html: string): Date | null {
    const m = /\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/i.exec(html);
    return this.parseAnyDateTime(m?.[1] ?? null);
  }

  private extractYmdDate(html: string): Date | null {
    const m = /\b(20\d{2}-\d{2}-\d{2})\b/.exec(html);
    return this.parseAnyDateTime(m?.[1] ?? null);
  }

  private extractFrenchLongDate(html: string): Date | null {
    const re = /\b(\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/i;
    const m = re.exec(html);
    if (!m?.[1]) return null;
    const parts = /(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i.exec(m[1]);
    if (!parts) return null;
    const monthMap: Record<string, number> = {
      janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
      juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
      décembre: 11, decembre: 11,
    };
    const month = monthMap[(parts[2] ?? '').toLowerCase()];
    if (month === undefined) return null;
    const d = new Date(Number(parts[3]), month, Number(parts[1]), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  private extractFrenchSlashDate(html: string): Date | null {
    const m = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/.exec(html);
    return this.parseAnyDateTime(m?.[1] ?? null);
  }

  private parseFrenchDate(s: string): Date | null {
    const monthMap: Record<string, number> = {
      janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
      juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10,
      décembre: 11, decembre: 11,
    };
    const parts = /(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i.exec((s ?? '').trim());
    if (!parts) return null;
    const month = monthMap[(parts[2] ?? '').toLowerCase()];
    if (month === undefined) return null;
    const d = new Date(Number(parts[3]), month, Number(parts[1]), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Extracts a French date range like "Du samedi 11 au samedi 25 avril 2026"
   * or "Du lundi 01 septembre 2025 au dimanche 31 mai 2026".
   */
  private extractFrenchDateRange(html: string): { start: Date; end: Date } | null {
    const months = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)';
    const dayOpt = '(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\\s*';
    const dmYear = `(?:1er|\\d{1,2})\\s+${months}\\s+\\d{4}`;

    const rangeRe = new RegExp(
      `[Dd]u\\s+${dayOpt}((?:1er|\\d{1,2})\\s+${months}(?:\\s+\\d{4})?)\\s+au\\s+${dayOpt}(${dmYear})`,
      'i',
    );
    const m = rangeRe.exec(html);
    if (!m) return null;

    let startStr = (m[1] ?? '').trim();
    const endStr = (m[3] ?? '').trim();

    const endYearMatch = /(\d{4})$/.exec(endStr);
    if (endYearMatch && !/\d{4}/.test(startStr)) {
      startStr = `${startStr} ${endYearMatch[1]}`;
    }

    const start = this.parseFrenchDate(startStr);
    const end = this.parseFrenchDate(endStr);
    if (!start || !end) return null;
    return { start, end };
  }

  private extractStartDateTime(html: string): Date | null {
    const re = /(?:du|dès?|à partir du|le)\s+(\d{1,2}\s+\w+\s+\d{4})/i;
    const m = re.exec(html ?? '');
    return m?.[1] ? this.parseFrenchDate(m[1]) : null;
  }

  private extractEndDateTime(html: string, start: Date | null): Date | null {
    const re = /(?:au|jusqu'au)\s+(\d{1,2}\s+\w+\s+\d{4})/i;
    const m = re.exec(html ?? '');
    if (!m?.[1]) return null;
    const d = this.parseFrenchDate(m[1]);
    if (!d || !start) return d;
    return d > start ? d : null;
  }

  private collectCandidateDates(html: string): Date[] {
    const out: Date[] = [];
    const push = (d: Date | null) => { if (d && !isNaN(d.getTime())) out.push(d); };
    const pushAll = (re: RegExp) => { let m: RegExpExecArray | null; while ((m = re.exec(html))) { if (m?.[1]) push(this.parseAnyDateTime(m[1])); } };

    push(this.extractIsoDateTime(html));
    push(this.extractYmdDate(html));
    push(this.extractFrenchSlashDate(html));
    push(this.extractFrenchLongDate(html));
    push(this.extractStartDateTime(html));
    pushAll(/\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/gi);
    pushAll(/\b(20\d{2}-\d{2}-\d{2})\b/g);
    pushAll(/\b(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)\b/g);

    const longRe = /\b(\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/gi;
    let lm: RegExpExecArray | null;
    while ((lm = longRe.exec(html))) {
      if (lm?.[1]) {
        const d = this.parseFrenchDate(lm[1]);
        if (d) { d.setHours(12, 0, 0, 0); push(d); }
      }
    }

    const weekdayRe = /\b((Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+\d{1,2}\s+[a-zàâäçéèêëîïôöùûüÿœ-]+\s+\d{4})\b/gi;
    let wm: RegExpExecArray | null;
    while ((wm = weekdayRe.exec(html))) {
      if (wm?.[1]) push(this.parseFrenchDate(wm[1]));
    }

    return out;
  }

  private pickBestDate(dates: Date[]): Date | null {
    if (!dates.length) return null;
    const now = new Date();
    const future = dates.filter((d) => d >= now);
    if (future.length) return future.reduce((best, d) => (d < best ? d : best));
    return dates.reduce((best, d) => (d > best ? d : best));
  }

  // ─── Time extraction ────────────────────────────────────────────────────────

  private normalizeFrenchTimeWords(s: string): string {
    return s
      .replace(/\bminuit\b/gi, '00h00')
      .replace(/\bmidi\b/gi, '12h00');
  }

  private extractHoursRange(text: string): { start: { hh: number; mm: number }; end: { hh: number; mm: number } } | null {
    const s = this.normalizeFrenchTimeWords(text ?? '');
    const patterns = [
      // "de 10h à 18h" / "de 10h30 à 18h00"
      /de\s+(\d{1,2})[h:](\d{0,2})\s+[àa]\s+(\d{1,2})[h:](\d{0,2})/i,
      // "10h - 18h" / "10h–18h" / "10:30–18:00" / "10h à 18h"
      /(\d{1,2})[h:](\d{0,2})\s*(?:[-–—]|[àa])\s*(\d{1,2})[h:](\d{0,2})/i,
    ];
    for (const re of patterns) {
      const m = re.exec(s);
      if (!m) continue;
      const sh = Number(m[1]); const sm = m[2] ? Number(m[2]) : 0;
      const eh = Number(m[3]); const em = m[4] ? Number(m[4]) : 0;
      if (!Number.isFinite(sh) || !Number.isFinite(eh)) continue;
      if (sh > 23 || eh > 23) continue;
      if (sh === eh && sm === em) continue;
      return { start: { hh: sh, mm: sm }, end: { hh: eh, mm: em } };
    }
    return null;
  }

  private extractTime(text: string, re: RegExp): { hh: number; mm: number } | null {
    const normalized = this.normalizeFrenchTimeWords(text ?? '');
    const m = re.exec(normalized);
    if (!m?.[1]) return null;
    const raw = m[1].trim().replace(/h/i, ':');
    const parts = raw.split(':');
    const hh = Number(parts[0]);
    const mm = parts[1] ? Number(parts[1]) : 0;
    if (!Number.isFinite(hh)) return null;
    return { hh, mm: Number.isFinite(mm) ? mm : 0 };
  }

  // ─── Section text extraction ────────────────────────────────────────────────

  private extractTextBetweenHeadings(text: string, startTitle: string, stopTitles: string[]): string | null {
    const src = (text ?? '').replace(/\r/g, '');
    const lines = src.split('\n');
    const stripPrefix = (l: string) => l.trim().replace(/^[>»›•◉\-–—\s]+/g, '').trim();
    const norm = (l: string) => stripPrefix(l).toLowerCase();
    const startLower = startTitle.toLowerCase();
    const stopLower = stopTitles.map((x) => x.toLowerCase());
    const startLineRe = new RegExp(`^\\s*[>»›•◉\\-–—\\s]*${this.escapeRegExp(startTitle)}\\s*:?(.*)$`, 'i');

    for (let i = 0; i < lines.length; i++) {
      if (!norm(lines[i]).includes(startLower)) continue;
      const out: string[] = [];
      const remainder = (startLineRe.exec(lines[i])?.[1] ?? '').trim();
      if (remainder) out.push(remainder);
      for (let j = i + 1; j < lines.length; j++) {
        if (stopLower.some((s) => norm(lines[j]).startsWith(s))) break;
        out.push(stripPrefix(lines[j]));
      }
      const joined = out.map((l) => l.trim()).filter(Boolean).join('\n').trim();
      if (joined.length >= 20) return joined;
    }
    return null;
  }

  private extractSectionHtml(html: string, title: string, stopTitles?: string[]): string | null {
    const t = this.escapeRegExp(title);
    const headingRe = new RegExp(`<h[1-6][^>]*>[\\s\\S]*?${t}[\\s\\S]*?<\\/h[1-6]>`, 'i');
    const m = headingRe.exec(html);
    if (!m || m.index === undefined) return null;
    const rest = html.slice(m.index + m[0].length);
    if (!stopTitles?.length) return rest;
    const stopsLower = stopTitles.map((x) => x.toLowerCase());
    const nextHeading = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi;
    let next: RegExpExecArray | null;
    while ((next = nextHeading.exec(rest))) {
      if (stopsLower.some((s) => next![0].toLowerCase().includes(s))) return rest.slice(0, next.index ?? 0);
    }
    return rest;
  }

  private extractPresentationText(html: string): string | null {
    return this.extractTextBetweenHeadings(this.htmlToText(html), 'Présentation', [
      "Période(s) d'ouverture", 'Tarifs', 'Localisation', 'Informations pratiques', 'Critères',
    ]);
  }

  private extractTarifText(html: string): string | null {
    return this.extractTextBetweenHeadings(this.htmlToText(html), 'Tarifs', [
      "Période(s) d'ouverture", 'Modes de paiement', 'Localisation', 'Contact',
    ]);
  }

  private extractHoursFromJsonLd(html: string): { hDebut: string; hFin: string } | null {
    const pad2 = (n: number) => String(n).padStart(2, '0');
    // 1. schema.org JSON-LD opens/closes
    const opensM = /"opens"\s*:\s*"(\d{1,2}:\d{2})"/i.exec(html);
    const closesM = /"closes"\s*:\s*"(\d{1,2}:\d{2})"/i.exec(html);
    if (opensM && closesM) return { hDebut: opensM[1], hFin: closesM[1] };
    // 2. Common Tourinsoft/CMS keys anywhere in HTML
    const startKeys = ["HoraireDebut", "heureOuverture", "heuredebut", "ouverture"];
    const endKeys   = ["HoraireFin",   "heureFermeture", "heurefin",  "fermeture"];
    for (let i = 0; i < startKeys.length; i++) {
      const sm = new RegExp(`["']${startKeys[i]}["']\\s*:\\s*["'](\\d{1,2}[h:]\\d{0,2})["']`, 'i').exec(html);
      const em = new RegExp(`["']${endKeys[i]}["']\\s*:\\s*["'](\\d{1,2}[h:]\\d{0,2})["']`, 'i').exec(html);
      if (sm && em) {
        const s = this.parseTimeStr(sm[1]); const e = this.parseTimeStr(em[1]);
        if (s && e) return { hDebut: `${pad2(s.hh)}:${pad2(s.mm)}`, hFin: `${pad2(e.hh)}:${pad2(e.mm)}` };
      }
    }
    // 3. French format anywhere in raw HTML: "de 7h à 12h30" or "de 07:00 à 12:30"
    const frM = /\bde\s+(\d{1,2})h(\d{0,2})\s+[a\u00e0]\s+(\d{1,2})h(\d{0,2})\b/i.exec(html);
    if (frM) {
      const hh1 = parseInt(frM[1]); const mm1 = parseInt(frM[2] || '0');
      const hh2 = parseInt(frM[3]); const mm2 = parseInt(frM[4] || '0');
      if (hh1 >= 4 && hh1 <= 23 && (hh2 > hh1 || hh2 === 0))
        return { hDebut: `${pad2(hh1)}:${pad2(mm1)}`, hFin: `${pad2(hh2)}:${pad2(mm2)}` };
    }
    return null;
  }

  private parseTimeStr(s: string): { hh: number; mm: number } | null {
    const m = /^(\d{1,2})[h:](\d{0,2})$/.exec((s ?? '').trim());
    if (!m) return null;
    const hh = parseInt(m[1]); const mm = parseInt(m[2] || '0');
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm };
  }

  private extractDaysFromJsonLd(html: string): Set<number> | null {
    const dayMap: Record<string, number> = {
      monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0,
    };
    const arrM = /"dayOfWeek"\s*:\s*\[([^\]]+)\]/i.exec(html);
    const rawValues: string[] = [];
    if (arrM) {
      const matches = arrM[1].match(/"([^"]+)"/g) ?? [];
      rawValues.push(...matches.map((v) => v.replace(/"/g, '')));
    } else {
      const singleM = /"dayOfWeek"\s*:\s*"([^"]+)"/i.exec(html);
      if (singleM) rawValues.push(singleM[1]);
    }
    const days = new Set<number>();
    for (const v of rawValues) {
      const key = v.toLowerCase().replace(/.*\//, '');
      const num = dayMap[key];
      if (num !== undefined) days.add(num);
    }
    return days.size > 0 ? days : null;
  }

  private extractOpeningHoursText(html: string): string | null {
    return this.extractTextBetweenHeadings(this.htmlToText(html), "Période(s) d'ouverture", [
      'Tarifs', 'Complément Réservation', 'Complement Réservation', 'Localisation', 'Informations pratiques',
    ]);
  }

  private extractOpeningHoursFromText(pageText: string): string | null {
    const dayRe = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|tous les jours|chaque jour)\b/i;
    const hourRe = /\bde\s+\d{1,2}\s*h/i;
    const lines = pageText.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (dayRe.test(t) && hourRe.test(t) && t.length >= 20 && t.length <= 300) return t;
    }
    return null;
  }

  private extractLocalisationTextFromPageText(pageText: string): string | null {
    return this.extractTextBetweenHeadings(pageText, 'Localisation', [
      'Tarifs', 'Modes de paiement', "Période(s) d'ouverture", 'Contact',
    ]);
  }

  private extractContactText(html: string): string | null {
    const sectionHtml =
      this.extractSectionHtml(html, 'Contact', [
        'Localisation', 'Tarifs', 'Modes de paiement', "Période(s) d'ouverture", 'Informations pratiques', 'Carte',
      ]) ?? html;

    const emailFromHref = this.matchFirstGroup(sectionHtml, /href=['"]mailto:([^'"\s>]+)/i);
    const telFromHref = this.matchFirstGroup(sectionHtml, /href=['"]tel:([^'"]+)['"]/i);
    const sectionText = this.htmlToText(sectionHtml);
    const emailFromText = this.matchFirstGroup(sectionText, /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
    const telFromText = this.matchFirstGroup(sectionText, /((?:\+33|0)\s*[1-9](?:[\s.\-]*\d{2}){4})/i);

    const email = ((emailFromHref ?? emailFromText ?? '').trim().split('?')[0] ?? '').trim();
    const phone = normalizePhone((telFromHref ?? telFromText ?? '').split('?')[0] ?? '');

    if (!email && !phone) return null;
    return `email : ${email || 'non mentionné'} Téléphone : ${phone || 'non mentionné'}`;
  }

  // ─── Address extraction ─────────────────────────────────────────────────────

  private extractAddressFromHtml(html: string): {
    salle: string | null; ligne1: string | null; codePostal: string | null; ville: string | null;
  } | null {
    const src = html ?? '';
    const salle = this.matchFirstGroup(src, /<div[^>]+class=['"][^'"]*\bsalle\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\blibelle-salle\b[^'"]*['"][^>]*>([^<]+)<\/span>/i);
    const ligne1 = this.matchFirstGroup(src, /<div[^>]+class=['"][^'"]*\bAdresse-LigneAdresse1\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i);
    const codePostal = this.matchFirstGroup(src, /<div[^>]+class=['"][^'"]*\bAdresse-CodePostal\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i);
    const ville = this.matchFirstGroup(src, /<div[^>]+class=['"][^'"]*\bAdresse-Ville\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i);
    const cleaned = {
      salle: salle && !this.isNoiseLine(salle) ? salle : null,
      ligne1: ligne1 && !this.isNoiseLine(ligne1) ? ligne1 : null,
      codePostal: codePostal ? codePostal.replace(/\s+/g, '').trim() : null,
      ville: ville && !this.isNoiseLine(ville) ? ville : null,
    };
    if (!cleaned.salle && !cleaned.ligne1 && !cleaned.codePostal && !cleaned.ville) return null;
    return cleaned;
  }

  private extractLieu(html: string): string | null {
    return this.matchFirstGroup(
      html,
      /<span[^>]+class=['"][^'"]*\blibelle-salle\b[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    );
  }

  private extractGeoFromHtml(html: string): { lat: number; lon: number } | null {
    const src = html ?? '';
    const markerRe = /[?&]marker=([-\d.]+)[,%2C]+([-\d.]+)/i;
    const mm = markerRe.exec(src);
    if (mm?.[1] && mm?.[2]) {
      const lat = this.parseNumberLike(mm[1]);
      const lon = this.parseNumberLike(mm[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) return { lat, lon };
    }
    const dataRe = /data-(?:lat|latitude)=["']([-\d.]+)["'][^>]{0,200}data-(?:lon|lng|longitude)=["']([-\d.]+)["']/i;
    const dm = dataRe.exec(src);
    if (dm?.[1] && dm?.[2]) {
      const lat = this.parseNumberLike(dm[1]);
      const lon = this.parseNumberLike(dm[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) return { lat, lon };
    }
    const leafRe = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/g;
    let m: RegExpExecArray | null;
    while ((m = leafRe.exec(src))) {
      const lat = this.parseNumberLike(m[1]);
      const lon = this.parseNumberLike(m[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) return { lat, lon };
    }
    return null;
  }

  private isPlausibleLatLon(lat: number, lon: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  // ─── Misc helpers ───────────────────────────────────────────────────────────

  private isNoiseLine(line: string): boolean {
    const s = (line ?? '').trim();
    if (!s) return true;
    const lower = s.toLowerCase();
    if (['photos', 'carte'].includes(lower) || lower.startsWith('destination')) return true;
    if (lower.startsWith('coordonnées gps') || lower.startsWith('latitude') || lower.startsWith('longitude')) return true;
    if (lower.startsWith('calculer') || lower.startsWith('voir ') || lower.startsWith('ajouter ') || lower.startsWith('supprimer ')) return true;
    if (lower.includes('newsletter') || lower.includes('bons plans')) return true;
    if (lower.startsWith('#')) return true;
    if (['facebook', 'instagram', 'youtube', 'tiktok', 'linkedin', 'google +', 'tripadvisor'].includes(lower)) return true;
    if (lower.includes('office de tourisme') || lower.includes('otcarrylerouet')) return true;
    if (/^https?:\/\//i.test(s)) return true;
    if (/(^|\s)(e-mail|email|t[ée]l|tel)\b/i.test(s)) return true;
    return false;
  }

  private looksLikeAddressLine(line: string): boolean {
    const s = (line ?? '').trim();
    if (!s) return false;
    if (/\b\d{5}\b/.test(s)) return true;
    if (/\b\d+\b/.test(s) && /(rue|avenue|av\.?|boulevard|bd\.?|place|chemin|route|impasse|all[ée]e)/i.test(s)) return true;
    return false;
  }

  private cleanTarifText(raw: string | null): string | null {
    const s = (raw ?? '').trim();
    if (!s) return null;
    const lines = s.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    const out: string[] = [];
    for (const l of lines) {
      if (this.isNoiseLine(l)) { if (out.length > 0) break; continue; }
      if (/^(localisation|contact|modes de paiement|carte)\b/i.test(l)) break;
      out.push(l);
      if (out.length >= 3) break;
    }
    const joined = out.join(' ').replace(/\s+/g, ' ').trim();
    return joined || null;
  }

  private effectiveEndForPastCheck(dateDebut: Date, dateFin: Date | null): Date {
    if (dateFin) return dateFin;
    const d = new Date(dateDebut);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private guessCategory(_sourceUrl: string, titre: string): EventCategory {
    const t = (titre ?? '').toLowerCase();
    if (/(exposition|galerie|mus[eé]e)/i.test(t))                                      return EventCategory.ARTS_EXPOS;
    if (/(concert|spectacle|th[eé][aâ]tre|humour|cin[eé]ma)/i.test(t))              return EventCategory.CULTURE_SPECTACLE;
    if (/(soir[eé]e|danse|festival|afterwork|salsa|tango|bachata)/i.test(t))         return EventCategory.SORTIE;
    if (/(sport|bien.?[eê]tre|atelier|cours\b|yoga|randonn[eé]e)/i.test(t))        return EventCategory.ACTIVITES;
    if (/(march[eé]|brocante|salon\b)/i.test(t))                                    return EventCategory.VIE_LOCALE;
    if (/(enfants?|famille|kids|jeunesse)/i.test(t))                               return EventCategory.FAMILLE;
    if (/(feux.?d.?artifice|feu.?d.?artifice|pyrotechnie)/i.test(t))              return EventCategory.SPECIAL;
    return EventCategory.SPECIAL;
  }
}
