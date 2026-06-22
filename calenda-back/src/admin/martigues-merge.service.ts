import { normalizePhone } from './merge-utils';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Between, In, MoreThanOrEqual, Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { guessTags } from '../common/utils/guess-tags.util';
import { EtablissementType } from '../common/enums/etablissement-type.enum';
import { EtablissementsService } from '../etablissements/etablissements.service';
import { Event } from '../events/event.entity';
import { EventSlot } from '../events/event-slot.entity';
import { User } from '../users/user.entity';

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
export class MartiguesMergeService {
  private readonly logger = new Logger(MartiguesMergeService.name);
  private static readonly MERGE_USER = {
    email: 'merge.martigues@calendago.fr',
    pseudo: 'martigues tourisme',
    ville: 'Martigues',
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

    const cfg = MartiguesMergeService.MERGE_USER;
    let user = await this.usersRepo.findOne({ where: [{ email: cfg.email }, { pseudo: cfg.pseudo }] });
    if (!user) {
      const passwordHash = await bcrypt.hash(`merge-martigues-${Date.now()}`, 10);
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
      this.logger.log(`martigues_merge_user_created id=${user.id} email=${user.email}`);
    }

    this.mergeOrganizerId = user.id;
    return user;
  }

  async backfillOrganizer(): Promise<number> {
    const organizer = await this.getMergeOrganizer();
    const events = await this.eventsRepo.find({ where: { origin: EventOrigin.MARTIGUES_SITE } });
    const toUpdate = events.filter((ev) => !ev.organisateur || ev.organisateur.id !== organizer.id);
    if (toUpdate.length === 0) return 0;

    for (const ev of toUpdate) {
      ev.organisateur = organizer;
    }
    await this.eventsRepo.save(toUpdate);
    this.logger.log(`martigues_backfill_organizer updated=${toUpdate.length} organizerId=${organizer.id}`);
    return toUpdate.length;
  }

  async merge(options?: MergeOptions): Promise<MergeResult> {
    await this.backfillOrganizer();
    const pages = Math.max(1, Math.min(20, options?.pages ?? 2));
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
    const pages = Math.max(1, Math.min(20, options?.pages ?? 2));

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
      `martigues_preview_start pages=${pages} foundUrls=${allUrls.length} uniqueUrls=${uniqueUrls.length}`,
    );

    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          this.logger.warn(`martigues_parse_failed url=${sourceUrl} reason=${parsedRes.reason}`);
          if (failures.length < 5) {
            failures.push({ url: sourceUrl, reason: parsedRes.reason });
          }
          if (debugSamples.length < 20) {
            debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: parsedRes.reason });
          }
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
              status: 'past',
              url: sourceUrl,
              titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl,
              descLen: (detail.description ?? '').length,
            });
          }

          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(
              `martigues_detail_sample status=past url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'}`,
            );
          }
          continue;
        }

        if (detail.imageUrl) withImage++;
        if (detail.description && detail.description.trim() && detail.description.trim() !== detail.titre.trim()) {
          withDescription++;
        }

        const dayStart = new Date(detail.dateDebut);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(detail.dateDebut);
        dayEnd.setHours(23, 59, 59, 999);

        const existing = await this.eventsRepo.findOne({
          where: {
            origin: EventOrigin.MARTIGUES_SITE,
            titre: detail.titre,
            dateDebut: Between(dayStart, dayEnd),
          },
        });

        if (existing) {
          skippedExisting++;
          urls.push(sourceUrl);

          if (debugSamples.length < 20) {
            debugSamples.push({
              status: 'existing',
              url: sourceUrl,
              titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl,
              descLen: (detail.description ?? '').length,
            });
          }

          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(
              `martigues_detail_sample status=existing url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'}`,
            );
          }
          continue;
        }

        wouldCreate++;
        urls.push(sourceUrl);

        if (debugSamples.length < 20) {
          debugSamples.push({
            status: 'addable',
            url: sourceUrl,
            titre: detail.titre,
            dateDebut: detail.dateDebut.toISOString(),
            dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
            image: !!detail.imageUrl,
            descLen: (detail.description ?? '').length,
          });
        }

        if (sampleLogged < 10) {
          sampleLogged++;
          this.logger.log(
            `martigues_detail_sample status=addable url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'} image=${detail.imageUrl ? 1 : 0} descLen=${(detail.description ?? '').length}`,
          );
        }
      } catch {
        if (failures.length < 5) {
          failures.push({ url: sourceUrl, reason: 'exception' });
        }
        if (debugSamples.length < 20) {
          debugSamples.push({ status: 'exception', url: sourceUrl, reason: 'exception' });
        }
        failed++;
      }
    }

    this.logger.log(
      `martigues_preview_done pages=${pages} parsed=${parsed} addable=${wouldCreate} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const futureDbEvents = await this.eventsRepo.find({
      where: { origin: EventOrigin.MARTIGUES_SITE, dateDebut: MoreThanOrEqual(yesterday) },
    });
    const toDelete = futureDbEvents
      .filter((ev) => !titresVus.has(ev.titre))
      .map((ev) => ({
        id: ev.id,
        titre: ev.titre,
        dateDebut: ev.dateDebut.toISOString(),
        dateFin: ev.dateFin ? ev.dateFin.toISOString() : null,
      }));

    this.logger.log(`martigues_preview_toDelete count=${toDelete.length}`);

    return {
      scannedPages: pages,
      foundUrls: allUrls.length,
      dedupedUrls: uniqueUrls.length,
      parsed,
      withImage,
      withDescription,
      wouldCreate,
      skippedExisting,
      skippedPast,
      failed,
      toDelete,
      urls,
      failures,
      debugSamples,
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

    this.logger.log(`martigues_apply_start urls=${uniqueUrls.length}`);
    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          this.logger.warn(`martigues_parse_failed_apply url=${sourceUrl} reason=${parsedRes.reason}`);
          if (debugSamples.length < 20) {
            debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: parsedRes.reason });
          }
          failed++;
          continue;
        }

        const endForPast = this.effectiveEndForPastCheck(detail.dateDebut, detail.dateFin);
        if (endForPast < now) {
          skippedPast++;

          if (sampleLogged < 10) {
            sampleLogged++;
            this.logger.log(
              `martigues_apply_sample status=past url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'}`,
            );
          }
          continue;
        }

        const applyDayStart = new Date(detail.dateDebut);
        applyDayStart.setHours(0, 0, 0, 0);
        const applyDayEnd = new Date(detail.dateDebut);
        applyDayEnd.setHours(23, 59, 59, 999);

        const existing = await this.eventsRepo.findOne({
          where: {
            origin: EventOrigin.MARTIGUES_SITE,
            titre: detail.titre,
            dateDebut: Between(applyDayStart, applyDayEnd),
          },
        });

        if (existing) {
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
            this.logger.log(
              `martigues_apply_sample status=existing_updated url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`,
            );
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
            types: [EtablissementType.ACTIVITE],
            tags: [],
            latitude: detail.latitude,
            longitude: detail.longitude,
          });
          created++;
          this.logger.log(`martigues_apply_everyday_activite url=${sourceUrl} titre=${JSON.stringify(detail.titre)}`);
          continue;
        }

        const ev = this.eventsRepo.create({
          titre: detail.titre,
          description: detail.description,
          categorie: detail.categorie,
          origin: EventOrigin.MARTIGUES_SITE,
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
            status: 'created',
            url: sourceUrl,
            titre: detail.titre,
            dateDebut: detail.dateDebut.toISOString(),
            dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
          });
        }

        if (sampleLogged < 10) {
          sampleLogged++;
          this.logger.log(
            `martigues_apply_sample status=created url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'}`,
          );
        }
      } catch {
        if (debugSamples.length < 20) {
          debugSamples.push({ status: 'exception', url: sourceUrl, reason: 'exception' });
        }
        failed++;
      }
    }

    for (const id of toDeleteIds) {
      try {
        await this.slotsRepo.delete({ eventId: id });
        await this.eventsRepo.delete(id);
        deleted++;
        this.logger.log(`martigues_apply_deleted id=${id}`);
      } catch {
        this.logger.warn(`martigues_apply_delete_failed id=${id}`);
        failed++;
      }
    }

    this.logger.log(
      `martigues_apply_done processed=${uniqueUrls.length} created=${created} deleted=${deleted} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    return {
      processed: uniqueUrls.length,
      created,
      skippedExisting,
      skippedPast,
      deleted,
      failed,
      debugSamples,
    };
  }

  private async listAgendaUrls(pages: number) {
    const allUrls: string[] = [];
    for (let page = 1; page <= pages; page++) {
      const url =
        page === 1
          ? 'https://www.martigues-tourisme.com/agenda-manifestations.html'
          : `https://www.martigues-tourisme.com/agenda-manifestations.html?page=${page}`;
      const html = await this.fetchHtml(url);
      const urls = this.extractDetailUrls(html);

      const title = (this.matchTag(html, 'title') ?? '').replace(/\s+/g, ' ').trim();
      const uniq = [...new Set(urls)];
      this.logger.log(
        `martigues_agenda_page page=${page} url=${url} title=${JSON.stringify(title)} found=${urls.length} unique=${uniq.length}`,
      );
      if (uniq.length) {
        this.logger.log(`martigues_agenda_page_sample page=${page} sample=${JSON.stringify(uniq.slice(0, 5))}`);
      }

      allUrls.push(...urls);
    }
    return allUrls;
  }

  private async fetchHtml(url: string) {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'calenda-bot/1.0',
        accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`fetch_failed_${res.status}`);
    }

    return await res.text();
  }

  private extractDetailUrls(html: string): string[] {
    const out: string[] = [];
    const base = 'https://www.martigues-tourisme.com';

    const add = (raw: string) => {
      const href = this.decodeHtml((raw ?? '').trim());
      if (!href) return;
      try {
        const u = new URL(href, base);
        if (!u.host.endsWith('martigues-tourisme.com')) return;

        const pathname = u.pathname || '';
        if (!pathname.toLowerCase().endsWith('.html')) return;
        if (!(pathname.startsWith('/evenements/') || pathname.startsWith('/activites-'))) return;

        const normalized = new URL(base);
        normalized.pathname = pathname;
        normalized.search = '';
        normalized.hash = '';
        out.push(normalized.toString());
      } catch {
        return;
      }
    };

    const addEscapedUrl = (raw: string) => {
      const s = (raw ?? '').trim();
      if (!s) return;
      const unescaped = s.replace(/\\\//g, '/');
      add(unescaped);
    };

    const reQuoted = /href\s*=\s*(['"])([^'">\s]+)\1/gi;
    let m: RegExpExecArray | null;
    while ((m = reQuoted.exec(html))) {
      if (m?.[2]) add(m[2]);
    }

    const reUnquoted = /href\s*=\s*([^"'\s>]+)(?=\s|>)/gi;
    while ((m = reUnquoted.exec(html))) {
      if (m?.[1]) add(m[1]);
    }

    const reAbs = /https?:\/\/[^\s"'<>]+\.html(?:\?[^\s"'<>]*)?/gi;
    const absMatches = html.match(reAbs) ?? [];
    for (const u of absMatches) {
      add(u);
    }

    const reEscapedAbs = /https?:\\\/\\\/[^\s"'<>]+?\.html(?:\\\?[^\s"'<>]*)?/gi;
    const escMatches = html.match(reEscapedAbs) ?? [];
    for (const u of escMatches) {
      addEscapedUrl(u);
    }

    return out;
  }

  private decodeHtml(s: string) {
    const map: Record<string, string> = {
      amp: '&',
      quot: '"',
      apos: "'",
      nbsp: ' ',
      lt: '<',
      gt: '>',
      eacute: 'é',
      egrave: 'è',
      ecirc: 'ê',
      euml: 'ë',
      agrave: 'à',
      acirc: 'â',
      auml: 'ä',
      ccedil: 'ç',
      icirc: 'î',
      iuml: 'ï',
      ocirc: 'ô',
      ouml: 'ö',
      ugrave: 'ù',
      ucirc: 'û',
      uuml: 'ü',
      oelig: 'œ',
      aelig: 'æ',
      rsquo: '’',
      lsquo: '‘',
      laquo: '«',
      raquo: '»',
      ndash: '–',
      mdash: '—',
      hellip: '…',
      deg: '°',
    };

    return (s ?? '')
      .replace(/&#(\d+);/g, (_m, n) => {
        const code = Number(n);
        if (!Number.isFinite(code)) return '';
        try {
          return String.fromCodePoint(code);
        } catch {
          return '';
        }
      })
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
        const code = Number.parseInt(String(hex), 16);
        if (!Number.isFinite(code)) return '';
        try {
          return String.fromCodePoint(code);
        } catch {
          return '';
        }
      })
      .replace(/&([a-z]+);/gi, (_m, name) => {
        const key = String(name).toLowerCase();
        return map[key] ?? `&${name};`;
      })
      .trim();
  }

  private extractFirstContentImage(html: string): string | null {
    const content = html
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '');
    const skipRe = /logo|icon|sprite|avatar|picto|blank|placeholder|favicon/i;
    const figRe = /<figure[\s\S]*?<img\b[^>]*?\bsrc=['"]([^'"\s]+)['"][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = figRe.exec(content))) {
      const src = m[1];
      if (src && !skipRe.test(src)) return src;
    }
    const re = /<img\b[^>]*?\bsrc=['"]([^'"\s]+)['"][^>]*>/gi;
    while ((m = re.exec(content))) {
      const src = m[1];
      if (!src || skipRe.test(src)) continue;
      if (!/\.(?:jpg|jpeg|png|webp)(\?[^'"]*)?$/i.test(src)) continue;
      return src;
    }
    return null;
  }

  private htmlToText(html: string) {
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

  private extractTextBetweenHeadings(text: string, startTitle: string, stopTitles: string[]) {
    const src = (text ?? '').replace(/\r/g, '');
    const lines = src.split('\n');

    const stripPrefix = (line: string) =>
      line
        .trim()
        .replace(/^[>»›•◉\-–—\s]+/g, '')
        .trim();

    const norm = (line: string) => stripPrefix(line).toLowerCase();

    const startLower = startTitle.toLowerCase();
    const stopLower = stopTitles.map((x) => x.toLowerCase());

    const startLineRe = new RegExp(
      `^\\s*[>»›•◉\\-–—\\s]*${this.escapeRegExp(startTitle)}\\s*:?(.*)$`,
      'i',
    );

    for (let i = 0; i < lines.length; i++) {
      const n = norm(lines[i]);
      if (!n.includes(startLower)) continue;

      const out: string[] = [];
      const m = startLineRe.exec(lines[i]);
      const remainder = (m?.[1] ?? '').trim();
      if (remainder) out.push(remainder);

      for (let j = i + 1; j < lines.length; j++) {
        const nj = norm(lines[j]);
        if (stopLower.some((s) => nj.startsWith(s))) break;
        out.push(stripPrefix(lines[j]));
      }

      const joined = out
        .map((l) => l.trim())
        .filter(Boolean)
        .join('\n')
        .trim();

      if (joined.length >= 20) {
        return joined;
      }
    }

    return null;
  }

  private matchFirstGroup(html: string, re: RegExp) {
    const m = re.exec(html ?? '');
    return m?.[1] ? this.decodeHtml(m[1]).trim() : null;
  }

  private extractAddressFromHtml(html: string): {
    salle: string | null;
    ligne1: string | null;
    codePostal: string | null;
    ville: string | null;
  } | null {
    const src = html ?? '';

    const salle = this.matchFirstGroup(
      src,
      /<div[^>]+class=['"][^'"]*\bsalle\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\blibelle-salle\b[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    );

    const ligne1 = this.matchFirstGroup(
      src,
      /<div[^>]+class=['"][^'"]*\bAdresse-LigneAdresse1\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    );

    const codePostal = this.matchFirstGroup(
      src,
      /<div[^>]+class=['"][^'"]*\bAdresse-CodePostal\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    );

    const ville = this.matchFirstGroup(
      src,
      /<div[^>]+class=['"][^'"]*\bAdresse-Ville\b[^'"]*['"][\s\S]*?<span[^>]+class=['"][^'"]*\bvaleur\b[^'"]*['"][^>]*>([^<]+)<\/span>/i,
    );

    const cleaned = {
      salle: salle && !this.isNoiseLine(salle) ? salle : null,
      ligne1: ligne1 && !this.isNoiseLine(ligne1) ? ligne1 : null,
      codePostal: codePostal ? codePostal.replace(/\s+/g, '').trim() : null,
      ville: ville && !this.isNoiseLine(ville) ? ville : null,
    };

    if (!cleaned.salle && !cleaned.ligne1 && !cleaned.codePostal && !cleaned.ville) return null;
    return cleaned;
  }

  private extractPresentationTextFromPageText(pageText: string) {
    return this.extractTextBetweenHeadings(pageText, 'Présentation', [
      "Période(s) d'ouverture",
      'Tarifs',
      'Localisation',
      'Informations pratiques',
    ]);
  }

  private extractTarifTextFromPageText(pageText: string) {
    return this.extractTextBetweenHeadings(pageText, 'Tarifs', [
      "Période(s) d'ouverture",
      'Modes de paiement',
      'Localisation',
      'Contact',
    ]);
  }

  private extractOpeningHoursTextFromPageText(pageText: string) {
    return this.extractTextBetweenHeadings(pageText, "Période(s) d'ouverture", [
      'Tarifs',
      'Complément Réservation',
      'Complement Réservation',
      'Localisation',
      'Informations pratiques',
    ]);
  }

  private extractLocalisationTextFromPageText(pageText: string) {
    return this.extractTextBetweenHeadings(pageText, 'Localisation', [
      'Tarifs',
      'Modes de paiement',
      "Période(s) d'ouverture",
      'Contact',
    ]);
  }

  private extractContactText(html: string) {
    const sectionHtml =
      this.extractSectionHtml(html, 'Contact', [
        'Localisation',
        'Tarifs',
        'Modes de paiement',
        "Période(s) d'ouverture",
        'Informations pratiques',
        'Carte',
      ]) ?? html;

    const emailFromHref = this.matchFirstGroup(sectionHtml, /href=['"]mailto:([^'"\s>]+)/i);
    const telFromHref = this.matchFirstGroup(sectionHtml, /href=['"]tel:([^'"]+)['"]/i);

    const sectionText = this.htmlToText(sectionHtml);
    const emailFromText = this.matchFirstGroup(
      sectionText,
      /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
    );
    const telFromText = this.matchFirstGroup(sectionText, /((?:\+33|0)\s*[1-9](?:[\s.\-]*\d{2}){4})/i);

    const emailRaw = (emailFromHref ?? emailFromText ?? '').trim();
    const email = emailRaw ? emailRaw.split('?')[0]?.trim() || '' : '';

    const phone = normalizePhone((telFromHref ?? telFromText ?? '').split('?')[0] ?? '');

    if (!email && !phone) return null;
    return `email : ${email || 'non mentionné'} Téléphone : ${phone || 'non mentionné'}`;
  }

  private extractSectionHtml(html: string, title: string, stopTitles?: string[]) {
    const t = this.escapeRegExp(title);
    const headingRe = new RegExp(`<h[1-6][^>]*>[\\s\\S]*?${t}[\\s\\S]*?<\\/h[1-6]>`, 'i');
    const m = headingRe.exec(html);
    if (!m || m.index === undefined) return null;

    const start = m.index + m[0].length;
    const rest = html.slice(start);
    if (!stopTitles || stopTitles.length === 0) {
      return rest;
    }

    const stopsLower = stopTitles.map((x) => x.toLowerCase());
    const nextHeadingBlock = /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi;
    let next: RegExpExecArray | null;
    while ((next = nextHeadingBlock.exec(rest))) {
      const block = next[0].toLowerCase();
      if (stopsLower.some((s) => block.includes(s))) {
        const end = next.index ?? 0;
        return rest.slice(0, end);
      }
    }

    return rest;
  }

  private extractPresentationText(html: string) {
    const pageText = this.htmlToText(html);
    return this.extractPresentationTextFromPageText(pageText);
  }

  private extractTarifText(html: string) {
    const pageText = this.htmlToText(html);
    return this.extractTarifTextFromPageText(pageText);
  }

  private extractOpeningHoursText(html: string) {
    const pageText = this.htmlToText(html);
    return this.extractOpeningHoursTextFromPageText(pageText);
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
    // 3. French format anywhere in raw HTML: "de 7h \u00e0 12h30"
    const frM = /\bde\s+(\d{1,2})h(\d{0,2})\s+[a\u00e0]\s+(\d{1,2})h(\d{0,2})\b/i.exec(html);
    if (frM) {
      const hh1 = parseInt(frM[1]); const mm1 = parseInt(frM[2] || '0');
      const hh2 = parseInt(frM[3]); const mm2 = parseInt(frM[4] || '0');
      if (hh1 >= 4 && hh1 < 20 && hh2 > hh1)
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

  private extractOpeningHoursFromFullText(pageText: string): string | null {
    const dayRe = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|tous les jours|chaque jour)\b/i;
    const hourRe = /\bde\s+\d{1,2}\s*h/i;
    const lines = pageText.split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (dayRe.test(t) && hourRe.test(t) && t.length >= 20 && t.length <= 300) return t;
    }
    return null;
  }

  /**
   * Génère un slot par jour entre dateDebut et dateFin.
   * Tente d'extraire les heures depuis le texte d'ouverture, sinon utilise les heures de dateDebut/dateFin.
   */
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
      hDebutStr = (h === 12 || h === 0 || h === 1) ? '09:00' : toHM(dateDebut);
      const endKey = dateFin ? toKey(dateFin) : toKey(dateDebut);
      const sameDay = dateFin && toKey(dateFin) === toKey(dateDebut);
      if (dateFin && sameDay) {
        const ef = dateFin.getHours();
        const em = dateFin.getMinutes();
        hFinStr = (ef === 23 && em === 59) ? '23:59' : toHM(dateFin);
      } else {
        hFinStr = '23:59';
      }
      void endKey;
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

  /**
   * Extrait les jours de la semaine autorisés depuis un texte d'ouverture.
   * Retourne null si tous les jours sont valides ("tous les jours" ou aucun jour trouvé).
   */
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
    const fallbackTitleRaw = (ogTitle ?? titleTag ?? '').replace(/\s+\|\s+Martigues\s*$/i, '');

    const titre = this.decodeHtml((jsonLd?.name ?? fallbackTitleRaw) || '').trim();
    if (!titre) {
      return { detail: null, isEverydayActivity: false, reason: 'missing_title' };
    }

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
      const jsonldTypes = this.extractJsonLdTypes(html).join(',') || 'none';
      const startRaw = String(jsonLd?.startDate ?? '').slice(0, 80);
      const endRaw = String(jsonLd?.endDate ?? '').slice(0, 80);
      const startMicroRaw = String(startMicro ?? '').slice(0, 80);
      const endMicroRaw = String(endMicro ?? '').slice(0, 80);
      const hintIso = plausible(this.extractIsoDateTime(html)) ? 'iso=1' : 'iso=0';
      const hintYmd = plausible(this.extractYmdDate(html)) ? 'ymd=1' : 'ymd=0';
      const hintFrSlash = plausible(this.extractFrenchSlashDate(html)) ? 'frslash=1' : 'frslash=0';
      const hintFrLong = plausible(this.extractFrenchLongDate(html)) ? 'frlong=1' : 'frlong=0';
      const cands = this.collectCandidateDates(html);
      const candidates = cands.length;
      const sample = cands
        .slice(0, 3)
        .map((d) => d.toISOString())
        .join(';');
      return {
        detail: null,
        isEverydayActivity: false,
        reason: `missing_dates ${hintIso} ${hintYmd} ${hintFrSlash} ${hintFrLong} candidates=${candidates} jsonldTypes=${jsonldTypes} startRaw=${startRaw} endRaw=${endRaw} startMicro=${startMicroRaw} endMicro=${endMicroRaw} sample=${sample}`,
      };
    }

    const ville = 'Martigues';
    const localisationText = this.extractLocalisationTextFromPageText(pageText);
    const localisationLinesRaw = (localisationText ?? '')
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    const localisationLines = localisationLinesRaw.filter((l) => !this.isNoiseLine(l));
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
      'Martigues';
    const lieu = (lieuCandidate || 'Martigues').trim();

    const street = this.decodeHtml(jsonLd?.streetAddress ?? '') || '';
    const postal = this.decodeHtml(jsonLd?.postalCode ?? '') || '';
    const locality = this.decodeHtml(jsonLd?.addressLocality ?? '') || '';
    const addrCityLine = [postal, locality].filter(Boolean).join(' ').trim();
    const adresseFromJsonLd = [street, addrCityLine].filter(Boolean).join(', ').trim();

    const adresseFromHtml =
      htmlAddress
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
    const adresse = (adresseFromHtml || adresseFromJsonLd || adresseFallback || lieu || 'Martigues').trim() || null;

    const categorie = this.guessCategory(sourceUrl, titre);
    const caracteristiques = guessTags(titre, description ?? '');

    const opening = this.extractOpeningHoursText(html) ?? this.extractOpeningHoursFromFullText(pageText);

    if (!range && dateDebut) {
      const hr = opening ? this.extractHoursRange(opening) : null;
      if (hr) {
        dateDebut.setHours(hr.start.hh, hr.start.mm, 0, 0);
        const end = new Date(dateDebut);
        end.setHours(hr.end.hh, hr.end.mm, 0, 0);
        if (end <= dateDebut) end.setDate(end.getDate() + 1);
        dateFin = end;
      } else if (opening) {
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

  private isEverydayPattern(openingText: string | null, dateDebut: Date, dateFin: Date | null): boolean {
    if (!openingText) return false;
    if (!/tous les jours|chaque jour|ouvert tous/i.test(openingText)) return false;
    if (!dateFin) return false;
    const diffDays = (dateFin.getTime() - dateDebut.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 14;
  }

  private effectiveEndForPastCheck(dateDebut: Date, dateFin: Date | null) {
    if (dateFin) return dateFin;
    const d = new Date(dateDebut);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private firstString(v: unknown): string | null {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      const s = v.find((x) => typeof x === 'string');
      return typeof s === 'string' ? s : null;
    }
    if (typeof v === 'object') {
      const anyV = v as any;
      if (typeof anyV.url === 'string') return anyV.url;
    }
    return null;
  }

  private parseNumberLike(v: unknown): number | null {
    if (typeof v === 'number') {
      return Number.isFinite(v) ? v : null;
    }
    if (typeof v === 'string') {
      const n = Number(String(v).trim().replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  private looksLikeAddressLine(line: string) {
    const s = (line ?? '').trim();
    if (!s) return false;
    if (/\b\d{5}\b/.test(s)) return true;
    if (/\b\d+\b/.test(s) && /(rue|avenue|av\.?|boulevard|bd\.?|place|chemin|route|impasse|all[ée]e)/i.test(s)) {
      return true;
    }
    if (/(martigues|saint|st\.?)/i.test(s) && /\b\d{5}\b/.test(s)) return true;
    return false;
  }

  private isNoiseLine(line: string) {
    const s = (line ?? '').trim();
    if (!s) return true;

    const lower = s.toLowerCase();
    if (lower === 'photos') return true;
    if (lower === 'carte' || lower.startsWith('destination')) return true;
    if (lower.startsWith('coordonnées gps') || lower.startsWith('coordonnees gps')) return true;
    if (lower.startsWith('latitude') || lower.startsWith('longitude')) return true;
    if (lower.startsWith('calculer') || lower.startsWith('voir ')) return true;
    if (lower.startsWith('ajouter ') || lower.startsWith('supprimer ')) return true;
    if (lower.includes('newsletter') || lower.includes('bons plans')) return true;
    if (lower.startsWith('#')) return true;

    if (lower === 'facebook' || lower === 'instagram' || lower === 'youtube' || lower === 'google +' || lower === 'tripadvisor') {
      return true;
    }

    if (lower.includes('offices de tourisme') || lower.includes("office de tourisme") || lower.includes('martigues-tourisme')) {
      return true;
    }

    if (/^https?:\/\//i.test(s)) return true;
    if (/(^|\s)(e-mail|email)\b/i.test(s)) return true;
    if (/(^|\s)(t[ée]l|tel)\b/i.test(s)) return true;

    return false;
  }

  private cleanTarifText(raw: string | null) {
    const s = (raw ?? '').trim();
    if (!s) return null;

    const lines = s
      .replace(/\r/g, '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const out: string[] = [];
    for (const l of lines) {
      if (this.isNoiseLine(l)) {
        if (out.length > 0) break;
        continue;
      }
      if (/^(localisation|contact|modes de paiement|carte)\b/i.test(l)) break;
      out.push(l);
      if (out.length >= 3) break;
    }

    const joined = out.join(' ').replace(/\s+/g, ' ').trim();
    if (!joined) return null;
    return joined;
  }

  private extractGeoFromHtml(html: string): { lat: number; lon: number } | null {
    const src = html ?? '';

    const markerRe = /[?&]marker=([-\d.]+)[,%2C]+([-\d.]+)/i;
    const mm = markerRe.exec(src);
    if (mm?.[1] && mm?.[2]) {
      const lat = this.parseNumberLike(mm[1]);
      const lon = this.parseNumberLike(mm[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) {
        return { lat, lon };
      }
    }

    const dataRe = /data-(?:lat|latitude)=["']([-\d.]+)["'][^>]{0,200}data-(?:lon|lng|longitude)=["']([-\d.]+)["']/i;
    const dm = dataRe.exec(src);
    if (dm?.[1] && dm?.[2]) {
      const lat = this.parseNumberLike(dm[1]);
      const lon = this.parseNumberLike(dm[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) {
        return { lat, lon };
      }
    }

    const leafRe = /\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/g;
    let m: RegExpExecArray | null;
    while ((m = leafRe.exec(src))) {
      const lat = this.parseNumberLike(m[1]);
      const lon = this.parseNumberLike(m[2]);
      if (typeof lat === 'number' && typeof lon === 'number' && this.isPlausibleLatLon(lat, lon)) {
        return { lat, lon };
      }
    }

    return null;
  }

  private isPlausibleLatLon(lat: number, lon: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    if (lat < -90 || lat > 90) return false;
    if (lon < -180 || lon > 180) return false;
    return true;
  }

  private parseAnyDateTime(v: unknown): Date | null {
    if (!v || typeof v !== 'string') return null;
    const raw = v.trim();
    if (!raw) return null;

    const iso = new Date(raw);
    if (!isNaN(iso.getTime())) return iso;

    const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw);
    if (fr) {
      const dd = Number(fr[1]);
      const mm = Number(fr[2]);
      const yyyy = Number(fr[3]);
      const hh = fr[4] ? Number(fr[4]) : 12;
      const mi = fr[5] ? Number(fr[5]) : 0;
      const d = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    const ymd = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw);
    if (ymd) {
      const yyyy = Number(ymd[1]);
      const mm = Number(ymd[2]);
      const dd = Number(ymd[3]);
      const hh = ymd[4] ? Number(ymd[4]) : 12;
      const mi = ymd[5] ? Number(ymd[5]) : 0;
      const d = new Date(yyyy, mm - 1, dd, hh, mi, 0, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  }

  private matchItemPropContent(html: string, itemprop: string) {
    const p = this.escapeRegExp(itemprop);
    const re = new RegExp(
      `itemprop=['\"]${p}['\"][^>]*content=['\"]([^'\"]+)['\"]`,
      'i',
    );
    const m = re.exec(html);
    return m?.[1] ?? null;
  }

  private matchDateTimeAttr(html: string) {
    const re = /<time[^>]+datetime=['\"]([^'\"]+)['\"]/i;
    const m = re.exec(html);
    return m?.[1] ?? null;
  }

  private extractIsoDateTime(html: string): Date | null {
    const re = /\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/i;
    const m = re.exec(html);
    return this.parseAnyDateTime(m?.[1] ?? null);
  }

  private extractYmdDate(html: string): Date | null {
    const re = /\b(20\d{2}-\d{2}-\d{2})\b/;
    const m = re.exec(html);
    return this.parseAnyDateTime(m?.[1] ?? null);
  }

  private extractFrenchLongDate(html: string): Date | null {
    const re = /\b(\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/i;
    const m = re.exec(html);
    if (!m?.[1]) return null;
    const d = this.parseFrenchDate(m[1]);
    if (d) return d;
    const parts = /(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i.exec(m[1]);
    if (!parts) return null;
    const day = Number(parts[1]);
    const monthName = (parts[2] ?? '').toLowerCase();
    const year = Number(parts[3]);
    const monthMap: Record<string, number> = {
      janvier: 0,
      février: 1,
      fevrier: 1,
      mars: 2,
      avril: 3,
      mai: 4,
      juin: 5,
      juillet: 6,
      août: 7,
      aout: 7,
      septembre: 8,
      octobre: 9,
      novembre: 10,
      décembre: 11,
      decembre: 11,
    };
    const month = monthMap[monthName];
    if (month === undefined) return null;
    const dd = new Date(year, month, day, 12, 0, 0, 0);
    return isNaN(dd.getTime()) ? null : dd;
  }

  private collectCandidateDates(html: string): Date[] {
    const out: Date[] = [];

    const push = (d: Date | null) => {
      if (!d) return;
      if (isNaN(d.getTime())) return;
      out.push(d);
    };

    const pushAllMatches = (re: RegExp) => {
      let m: RegExpExecArray | null;
      while ((m = re.exec(html))) {
        if (m?.[1]) {
          push(this.parseAnyDateTime(m[1]));
        }
      }
    };

    push(this.extractIsoDateTime(html));
    push(this.extractYmdDate(html));
    push(this.extractFrenchSlashDate(html));
    push(this.extractFrenchLongDate(html));
    push(this.extractStartDateTime(html));

    pushAllMatches(/\b(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)\b/gi);
    pushAllMatches(/\b(20\d{2}-\d{2}-\d{2})\b/g);
    pushAllMatches(/\b(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2})?)\b/g);

    const longRe = /\b(\d{1,2}\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+\d{4})\b/gi;
    let lm: RegExpExecArray | null;
    while ((lm = longRe.exec(html))) {
      if (lm?.[1]) {
        const d = this.parseFrenchDate(lm[1]);
        if (d) {
          d.setHours(12, 0, 0, 0);
        }
        push(d);
      }
    }

    const weekdayRe = /\b((Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+\d{1,2}\s+[a-zàâäçéèêëîïôöùûüÿœ-]+\s+\d{4})\b/gi;
    let wm: RegExpExecArray | null;
    while ((wm = weekdayRe.exec(html))) {
      const d = wm?.[1] ? this.parseFrenchDate(wm[1]) : null;
      push(d);
    }

    return out;
  }

  private pickBestDate(candidates: Date[]): Date | null {
    if (!candidates.length) return null;
    const now = new Date();
    const min = new Date(now);
    min.setFullYear(min.getFullYear() - 1);
    const max = new Date(now);
    max.setFullYear(max.getFullYear() + 3);

    const filtered = candidates.filter((d) => d >= min && d <= max);
    const pool = filtered.length ? filtered : candidates;

    const future = pool.filter((d) => d >= now);
    if (future.length) {
      return future.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    }

    const past = pool.filter((d) => d < now);
    if (past.length) {
      return past.sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    }

    return pool.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }

  private extractFrenchSlashDate(html: string): Date | null {
    const re = /\b(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+(\d{1,2}:\d{2}))?\b/;
    const m = re.exec(html);
    if (!m?.[1]) return null;
    const val = m[2] ? `${m[1]} ${m[2]}` : m[1];
    return this.parseAnyDateTime(val);
  }

  private extractJsonLdTypes(html: string): string[] {
    const blocks = this.extractJsonLdBlocks(html);
    const types = new Set<string>();
    const pushType = (t: any) => {
      if (!t) return;
      if (Array.isArray(t)) {
        for (const x of t) pushType(x);
        return;
      }
      types.add(String(t));
    };

    const walk = (n: any) => {
      if (!n) return;
      if (Array.isArray(n)) {
        for (const x of n) walk(x);
        return;
      }
      if (typeof n === 'object') {
        if (n['@type']) pushType(n['@type']);
        for (const k of Object.keys(n)) walk(n[k]);
      }
    };

    for (const b of blocks) walk(b);
    return [...types].slice(0, 20);
  }

  private extractJsonLdEvent(html: string): {
    name?: string;
    description?: string;
    image?: unknown;
    startDate?: string;
    endDate?: string;
    locationName?: string;
    addressLocality?: string;
    streetAddress?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
  } | null {
    const blocks = this.extractJsonLdBlocks(html);
    for (const block of blocks) {
      const ev = this.findEventLike(block);
      if (!ev) continue;

      const loc = (ev.location ?? null) as any;
      const addr = (loc?.address ?? null) as any;
      const geo = (loc?.geo ?? loc?.hasGeo ?? null) as any;

      const locationName = typeof loc?.name === 'string' ? loc.name : undefined;
      const addressLocality =
        typeof addr?.addressLocality === 'string'
          ? addr.addressLocality
          : typeof addr?.addressRegion === 'string'
            ? addr.addressRegion
            : undefined;

      const streetAddress = typeof addr?.streetAddress === 'string' ? addr.streetAddress : undefined;
      const postalCode = typeof addr?.postalCode === 'string' ? addr.postalCode : undefined;

      const latitude = this.parseNumberLike(geo?.latitude ?? geo?.lat);
      const longitude = this.parseNumberLike(geo?.longitude ?? geo?.lon ?? geo?.lng);

      return {
        name: typeof ev.name === 'string' ? ev.name : undefined,
        description: typeof ev.description === 'string' ? ev.description : undefined,
        image: ev.image,
        startDate: typeof ev.startDate === 'string' ? ev.startDate : undefined,
        endDate: typeof ev.endDate === 'string' ? ev.endDate : undefined,
        locationName,
        addressLocality,
        streetAddress,
        postalCode,
        latitude: typeof latitude === 'number' ? latitude : undefined,
        longitude: typeof longitude === 'number' ? longitude : undefined,
      };
    }
    return null;
  }

  private extractJsonLdBlocks(html: string): any[] {
    const out: any[] = [];
    const re = /<script[^>]+type=['"]application\/ld\+json['"][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const raw = (m[1] ?? '').trim();
      if (!raw) continue;
      try {
        out.push(JSON.parse(raw));
      } catch {
        const cleaned = raw.replace(/\u0000/g, '').trim();
        try {
          out.push(JSON.parse(cleaned));
        } catch {
          continue;
        }
      }
    }
    return out;
  }

  private findEventLike(node: any): any | null {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const ev = this.findEventLike(n);
        if (ev) return ev;
      }
      return null;
    }

    if (typeof node === 'object') {
      const t = node['@type'];
      const types = Array.isArray(t) ? t : t ? [t] : [];
      if (types.some((x) => String(x).toLowerCase() === 'event')) {
        return node;
      }

      if (node['@graph']) {
        const ev = this.findEventLike(node['@graph']);
        if (ev) return ev;
      }

      for (const k of Object.keys(node)) {
        const ev = this.findEventLike(node[k]);
        if (ev) return ev;
      }
    }
    return null;
  }

  private escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private matchMeta(html: string, property: string) {
    const p = this.escapeRegExp(property);
    const re1 = new RegExp(
      `<meta[^>]+property=['\"]${p}['\"][^>]*content=['\"]([^'\"]+)['\"][^>]*>`,
      'i',
    );
    const m1 = re1.exec(html);
    if (m1?.[1]) return m1[1];

    const re2 = new RegExp(
      `<meta[^>]+content=['\"]([^'\"]+)['\"][^>]*property=['\"]${p}['\"][^>]*>`,
      'i',
    );
    const m2 = re2.exec(html);
    return m2?.[1] ?? null;
  }

  private matchTag(html: string, tag: string) {
    const t = this.escapeRegExp(tag);
    const re = new RegExp(`<${t}[^>]*>([^<]+)</${t}>`, 'i');
    const m = re.exec(html);
    return m?.[1] ?? null;
  }

  private extractLieu(html: string) {
    const re = /Localisation\s*:\s*([^<\n\r]+)/i;
    const m = re.exec(html);
    const raw = m?.[1] ? this.decodeHtml(m[1]) : '';
    return raw ? raw.trim() : null;
  }

  private extractStartDateTime(html: string): Date | null {
    const dateRe = /((Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche)\s+\d{1,2}\s+[a-zàâäçéèêëîïôöùûüÿœ-]+\s+\d{4})/i;
    const m = dateRe.exec(html);
    if (!m?.[1]) {
      return null;
    }

    const date = this.parseFrenchDate(m[1]);
    if (!date) return null;

    const time =
      this.extractTime(html, /de\s*(\d{1,2}(?::\d{2}|h\d{0,2})?)/i) ??
      this.extractTime(html, /à\s*partir\s*de\s*(\d{1,2}(?::\d{2}|h\d{0,2})?)/i);
    if (!time) {
      date.setHours(12, 0, 0, 0);
      return date;
    }

    date.setHours(time.hh, time.mm, 0, 0);
    return date;
  }

  private extractFrenchDateRange(html: string): { start: Date; end: Date } | null {
    const month = '(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)';
    const weekday = '(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)';

    const reFull = new RegExp(
      `\\bDu\\s+(?:${weekday}\\s+)?(\\d{1,2}\\s+${month}\\s+\\d{4})\\s+au\\s+(?:${weekday}\\s+)?(\\d{1,2}\\s+${month}\\s+\\d{4})\\b`,
      'i',
    );
    const mFull = reFull.exec(html);
    if (mFull?.[1] && mFull?.[2]) {
      const start = this.parseFrenchDate(mFull[1]);
      const end = this.parseFrenchDate(mFull[2]);
      if (!start || !end) return null;
      start.setHours(12, 0, 0, 0);
      end.setHours(23, 59, 0, 0);
      return { start, end };
    }

    const reMissingYear = new RegExp(
      `\\bDu\\s+(?:${weekday}\\s+)?(\\d{1,2}\\s+${month})(?:\\s+(\\d{4}))?\\s+au\\s+(?:${weekday}\\s+)?(\\d{1,2}\\s+${month})(?:\\s+(\\d{4}))?\\b`,
      'i',
    );
    const m = reMissingYear.exec(html);
    if (!m?.[1] || !m?.[3]) return null;

    const yearEnd = m[4] ?? m[2] ?? null;
    if (!yearEnd) return null;

    const startStr = `${m[1]} ${yearEnd}`;
    const endStr = `${m[3]} ${yearEnd}`;

    const start = this.parseFrenchDate(startStr);
    const end = this.parseFrenchDate(endStr);
    if (!start || !end) return null;
    start.setHours(12, 0, 0, 0);
    end.setHours(23, 59, 0, 0);
    if (end < start) {
      end.setFullYear(end.getFullYear() + 1);
    }
    return { start, end };
  }

  private extractEndDateTime(html: string, start: Date | null): Date | null {
    if (!start) return null;

    const endTime = this.extractTime(html, /à\s*(\d{1,2}(?::\d{2}|h\d{0,2})?)/i);
    if (!endTime) {
      const fallback = new Date(start);
      fallback.setHours(start.getHours() + 2);
      return fallback;
    }

    const end = new Date(start);
    end.setHours(endTime.hh, endTime.mm, 0, 0);
    if (end <= start) {
      end.setDate(end.getDate() + 1);
    }
    return end;
  }

  private extractTime(html: string, re: RegExp) {
    const m = re.exec(html);
    if (!m?.[1]) return null;
    const raw = String(m[1]).trim().toLowerCase();
    let hh: number;
    let mm: number;
    if (raw.includes(':')) {
      const parts = raw.split(':');
      hh = Number(parts[0]);
      mm = Number(parts[1]);
    } else if (raw.includes('h')) {
      const parts = raw.split('h');
      hh = Number(parts[0]);
      mm = parts[1] ? Number(parts[1]) : 0;
    } else {
      hh = Number(raw);
      mm = 0;
    }
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return { hh, mm };
  }

  private extractHoursRange(text: string) {
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    const re = /de\s*(\d{1,2}(?:h\d{0,2}|:\d{2})?)\s*(?:à|a|-|→)\s*(\d{1,2}(?:h\d{0,2}|:\d{2})?)/i;
    const m = re.exec(t);
    if (!m?.[1] || !m?.[2]) return null;
    const start = this.extractTime(m[1], /(.*)/);
    const end = this.extractTime(m[2], /(.*)/);
    if (!start || !end) return null;
    return { start, end };
  }

  private parseFrenchDate(s: string) {
    const re = /(\d{1,2})\s+([a-zàâäçéèêëîïôöùûüÿœ-]+)\s+(\d{4})/i;
    const m = re.exec(s);
    if (!m) return null;

    const day = Number(m[1]);
    const monthName = (m[2] ?? '').toLowerCase();
    const year = Number(m[3]);

    const monthMap: Record<string, number> = {
      janvier: 0,
      février: 1,
      fevrier: 1,
      mars: 2,
      avril: 3,
      mai: 4,
      juin: 5,
      juillet: 6,
      août: 7,
      aout: 7,
      septembre: 8,
      octobre: 9,
      novembre: 10,
      décembre: 11,
      decembre: 11,
    };

    const month = monthMap[monthName];
    if (month === undefined) return null;

    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    return d;
  }

  private guessCategory(sourceUrl: string, titre: string): EventCategory {
    const t = titre.toLowerCase();
    if (/(exposition|galerie|mus[eé]e)/i.test(t)) return EventCategory.ARTS_EXPOS;
    if (/(concert|spectacle|th[eé][aâ]tre|humour|cin[eé]ma)/i.test(t)) return EventCategory.CULTURE_SPECTACLE;
    if (/(soir[eé]e|danse|festival|afterwork|salsa|tango|bachata)/i.test(t)) return EventCategory.SORTIE;
    if (/(sport|bien.?[eê]tre|atelier|cours\b)/i.test(t)) return EventCategory.ACTIVITES;
    if (/(march[eé]|brocante|salon\b)/i.test(t)) return EventCategory.VIE_LOCALE;
    if (/(enfants?|famille|kids|jeunesse)/i.test(t)) return EventCategory.FAMILLE;
    if (/(feux.?d.?artifice|feu.?d.?artifice|feu.?dartifice|pyrotechnie)/i.test(t)) return EventCategory.SPECIAL;
    if (sourceUrl.includes('/evenements/culture/')) return EventCategory.CULTURE_SPECTACLE;
    return EventCategory.SPECIAL;
  }
}
