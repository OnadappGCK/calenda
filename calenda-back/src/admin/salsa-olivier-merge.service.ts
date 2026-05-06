import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { Event } from '../events/event.entity';
import { EventSlot } from '../events/event-slot.entity';

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
export class SalsaOlivierMergeService {
  private readonly logger = new Logger(SalsaOlivierMergeService.name);

  constructor(
    @InjectRepository(Event) private readonly eventsRepo: Repository<Event>,
    @InjectRepository(EventSlot) private readonly slotsRepo: Repository<EventSlot>,
  ) {}

  private async updateExistingIfBetter(existing: Event, detail: { description: string; contact: string | null; tarif: string | null; adresse: string | null }) {
    let changed = false;

    const curDesc = (existing.description ?? '').trim();
    const nextDesc = (detail.description ?? '').trim();
    if (nextDesc && (!curDesc || curDesc.length < nextDesc.length)) {
      existing.description = nextDesc;
      changed = true;
    }

    if ((!existing.contact || !existing.contact.trim()) && detail.contact) {
      existing.contact = detail.contact;
      changed = true;
    }

    if ((!existing.tarif || existing.tarif === 'Non renseigné') && detail.tarif) {
      existing.tarif = detail.tarif;
      changed = true;
    }

    if ((!existing.adresse || !existing.adresse.trim()) && detail.adresse) {
      existing.adresse = detail.adresse;
      changed = true;
    }

    if (changed) {
      await this.eventsRepo.save(existing);
    }
  }

  async merge(options?: MergeOptions): Promise<MergeResult> {
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
    const maxItems = Math.max(1, Math.min(1000, pages * 50));

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

    const allUrls = await this.listEventUrls(maxItems);
    const uniqueUrls = [...new Set(allUrls)];
    const urls: string[] = [];

    this.logger.log(
      `salsa_preview_start pages=${pages} maxItems=${maxItems} foundUrls=${allUrls.length} uniqueUrls=${uniqueUrls.length}`,
    );

    let sampleLogged = 0;

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          this.logger.warn(`salsa_parse_failed url=${sourceUrl} reason=${parsedRes.reason}`);
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
              status: 'past',
              url: sourceUrl,
              titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
              image: !!detail.imageUrl,
              descLen: (detail.description ?? '').length,
            });
          }
          continue;
        }

        if (detail.imageUrl) withImage++;
        if (detail.description && detail.description.trim() && detail.description.trim() !== detail.titre.trim()) {
          withDescription++;
        }

        const start = new Date(detail.dateDebut);
        const end = new Date(detail.dateDebut);
        start.setMinutes(start.getMinutes() - 1);
        end.setMinutes(end.getMinutes() + 1);

        const existing = await this.eventsRepo.findOne({
          where: {
            origin: EventOrigin.SALSA_OLIVIER,
            titre: detail.titre,
            dateDebut: Between(start, end),
          },
        });

        if (existing) {
          await this.updateExistingIfBetter(existing, {
            description: detail.description,
            contact: detail.contact,
            tarif: detail.tarif,
            adresse: detail.adresse,
          });
          skippedExisting++;
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
            `salsa_detail_sample status=addable url=${sourceUrl} titre=${JSON.stringify(detail.titre)} debut=${detail.dateDebut.toISOString()} fin=${detail.dateFin ? detail.dateFin.toISOString() : 'null'}`,
          );
        }
      } catch {
        if (failures.length < 5) failures.push({ url: sourceUrl, reason: 'exception' });
        if (debugSamples.length < 20) debugSamples.push({ status: 'exception', url: sourceUrl, reason: 'exception' });
        failed++;
      }
    }

    this.logger.log(
      `salsa_preview_done pages=${pages} parsed=${parsed} addable=${wouldCreate} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
    );

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const futureDbEvents = await this.eventsRepo.find({
      where: { origin: EventOrigin.SALSA_OLIVIER, dateDebut: MoreThanOrEqual(yesterday) },
    });
    const toDelete = futureDbEvents
      .filter((ev) => !titresVus.has(ev.titre))
      .map((ev) => ({
        id: ev.id,
        titre: ev.titre,
        dateDebut: ev.dateDebut.toISOString(),
        dateFin: ev.dateFin ? ev.dateFin.toISOString() : null,
      }));
    this.logger.log(`salsa_preview_toDelete count=${toDelete.length}`);

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

    this.logger.log(`salsa_apply_start urls=${uniqueUrls.length}`);

    for (const sourceUrl of uniqueUrls) {
      try {
        const detailHtml = await this.fetchHtml(sourceUrl);
        const parsedRes = this.parseDetailResult(sourceUrl, detailHtml);
        const detail = parsedRes.detail;
        if (!detail) {
          if (debugSamples.length < 20) {
            debugSamples.push({ status: 'parse_failed', url: sourceUrl, reason: parsedRes.reason });
          }
          failed++;
          continue;
        }

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
            });
          }
          continue;
        }

        const start = new Date(detail.dateDebut);
        const end = new Date(detail.dateDebut);
        start.setMinutes(start.getMinutes() - 1);
        end.setMinutes(end.getMinutes() + 1);

        const existing = await this.eventsRepo.findOne({
          where: {
            origin: EventOrigin.SALSA_OLIVIER,
            titre: detail.titre,
            dateDebut: Between(start, end),
          },
        });

        if (existing) {
          await this.updateExistingIfBetter(existing, {
            description: detail.description,
            contact: detail.contact,
            tarif: detail.tarif,
            adresse: detail.adresse,
          });
          skippedExisting++;
          if (debugSamples.length < 20) {
            debugSamples.push({
              status: 'existing',
              url: sourceUrl,
              titre: detail.titre,
              dateDebut: detail.dateDebut.toISOString(),
              dateFin: detail.dateFin ? detail.dateFin.toISOString() : null,
            });
          }
          continue;
        }

        const ev = this.eventsRepo.create({
          titre: detail.titre,
          description: detail.description,
          categorie: detail.categorie,
          origin: EventOrigin.SALSA_OLIVIER,
          ville: detail.ville,
          lieu: detail.lieu,
          adresse: detail.adresse,
          latitude: detail.latitude,
          longitude: detail.longitude,
          theme: null,
          caracteristiques: detail.caracteristiques?.length ? detail.caracteristiques : null,
          imageUrl: detail.imageUrl,
          tarif: detail.tarif ?? 'Non renseigné',
          contact: detail.contact,
          dateDebut: detail.dateDebut,
          dateFin: detail.dateFin,
          couleur: null,
          enAvant: false,
          public: false,
          organisateur: null,
        });

        await this.eventsRepo.save(ev);
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
        this.logger.log(`salsa_apply_deleted id=${id}`);
      } catch {
        this.logger.warn(`salsa_apply_delete_failed id=${id}`);
        failed++;
      }
    }

    this.logger.log(
      `salsa_apply_done processed=${uniqueUrls.length} created=${created} deleted=${deleted} skippedPast=${skippedPast} skippedExisting=${skippedExisting} failed=${failed}`,
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

  private effectiveEndForPastCheck(dateDebut: Date, dateFin: Date | null) {
    if (dateFin) return dateFin;
    const d = new Date(dateDebut);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private async fetchHtml(url: string) {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'calenda-bot/1.0',
        accept: 'text/html,application/xhtml+xml,application/rss+xml',
      },
    });

    if (!res.ok) {
      throw new Error(`fetch_failed_${res.status}`);
    }

    return await res.text();
  }

  private async listEventUrls(maxItems: number): Promise<string[]> {
    // RSS is more stable than HTML and contains canonical event URLs.
    const rss = await this.fetchHtml('https://salsa.faurax.fr/rss.php?dpt=13');
    const urls = this.extractRssGuids(rss);
    return urls.slice(0, maxItems);
  }

  private extractRssGuids(xml: string): string[] {
    const out: string[] = [];
    const re = /<guid>([^<]+)<\/guid>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      const raw = this.decodeXmlEntities((m[1] ?? '').trim());
      if (!raw) continue;
      try {
        const u = new URL(raw);
        if (!u.host.endsWith('salsa.faurax.fr')) continue;
        if (!u.pathname.startsWith('/index.php/evt/')) continue;
        u.search = '';
        u.hash = '';
        out.push(u.toString());
      } catch {
        // ignore
      }
    }
    return out;
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
      ville: string;
      lieu: string;
      adresse: string | null;
      latitude: number | null;
      longitude: number | null;
      categorie: EventCategory;
      caracteristiques: EventTag[];
    };
    reason: string;
  } {
    const titleHeading = this.matchFirstTagText(html, 'h2');
    const titreRaw = this.decodeXmlEntities((titleHeading ?? '').trim());

    const { titre, city } = this.extractTitleAndCity(titreRaw);
    if (!titre) {
      return { detail: null, reason: 'missing_title' };
    }

    const dateFromUrl = this.extractDateFromUrl(sourceUrl);
    if (!dateFromUrl) {
      return { detail: null, reason: 'missing_date_in_url' };
    }

    const pageText = this.htmlToText(html);

    const timeRange = this.extractTimeRange(pageText);
    if (!timeRange) {
      return { detail: null, reason: 'missing_time_range' };
    }

    const dateDebut = new Date(dateFromUrl);
    dateDebut.setHours(timeRange.start.hh, timeRange.start.mm, 0, 0);

    const dateFin = new Date(dateFromUrl);
    dateFin.setHours(timeRange.end.hh, timeRange.end.mm, 0, 0);
    if (dateFin <= dateDebut) {
      dateFin.setDate(dateFin.getDate() + 1);
    }

    const tarif = this.extractTarif(pageText);
    const contact = this.extractPhone(pageText);
    const adresse = this.extractAddress(pageText);

    const description = this.extractFullDescription(html) || titre;

    // Salsa site doesn't provide consistent images.
    const imageUrl = null;

    const ville = city || this.extractCityFromAddress(adresse) || 'Bouches-du-Rhône';
    const lieu = ville;

    return {
      detail: {
        titre,
        description,
        imageUrl,
        tarif,
        contact,
        dateDebut,
        dateFin,
        ville,
        lieu,
        adresse,
        latitude: null,
        longitude: null,
        categorie: EventCategory.VIE_SOCIALE,
        caracteristiques: [EventTag.DANSE, EventTag.MUSIQUE],
      },
      reason: 'ok',
    };
  }

  private extractTitleAndCity(raw: string) {
    const s = (raw ?? '').trim();
    if (!s) return { titre: '', city: '' };

    const m = s.match(/^(.*?)(?:\s*\(([^)]+)\))\s*$/);
    if (m) {
      const titre = (m[1] ?? '').trim();
      const city = (m[2] ?? '').trim();
      return { titre, city };
    }

    return { titre: s, city: '' };
  }

  private extractDateFromUrl(url: string): Date | null {
    const m = (url ?? '').match(/\/evt\/(\d{8})-/i);
    if (!m?.[1]) return null;
    const y = Number(m[1].slice(0, 4));
    const mo = Number(m[1].slice(4, 6));
    const d = Number(m[1].slice(6, 8));
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d);
  }

  private extractTimeRange(text: string): { start: { hh: number; mm: number }; end: { hh: number; mm: number } } | null {
    const s = (text ?? '').replace(/\s+/g, ' ');
    const re = /(\d{1,2})(?:h|:)(\d{2})\s*[→\-–]\s*(\d{1,2})(?:h|:)(\d{2})/;
    const m = s.match(re);
    if (!m) return null;
    const hh1 = Number(m[1]);
    const mm1 = Number(m[2]);
    const hh2 = Number(m[3]);
    const mm2 = Number(m[4]);
    if ([hh1, mm1, hh2, mm2].some((n) => !Number.isFinite(n))) return null;
    if (hh1 < 0 || hh1 > 23 || hh2 < 0 || hh2 > 23 || mm1 < 0 || mm1 > 59 || mm2 < 0 || mm2 > 59) return null;
    return { start: { hh: hh1, mm: mm1 }, end: { hh: hh2, mm: mm2 } };
  }

  private extractTarif(text: string): string | null {
    const s = (text ?? '').replace(/\s+/g, ' ');
    const m = s.match(/,\s*([0-9]+(?:[\.,][0-9]+)?)\s*€/);
    if (!m?.[1]) return null;
    const raw = m[1].replace(',', '.').trim();
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const cleaned = n % 1 === 0 ? String(Math.trunc(n)) : String(n);
    return `${cleaned}€`;
  }

  private extractPhone(text: string): string | null {
    const s = (text ?? '').replace(/\s+/g, ' ');
    const m = s.match(/T[ée]l\.?\s*([0-9][0-9\s]{8,20})/i);
    if (!m?.[1]) return null;
    const digits = m[1].replace(/\s+/g, '').trim();
    if (digits.length < 9) return null;
    return digits;
  }

  private extractAddress(text: string): string | null {
    const s = (text ?? '').replace(/\s+/g, ' ');
    const telIndex = s.toLowerCase().indexOf('tél');
    const beforeTel = telIndex >= 0 ? s.slice(0, telIndex) : s;
    const euroIndex = beforeTel.lastIndexOf('€');
    if (euroIndex < 0) return null;
    const addr = beforeTel.slice(euroIndex + 1).trim();
    return addr ? addr : null;
  }

  private extractCityFromAddress(adresse: string | null): string | null {
    const s = (adresse ?? '').trim();
    if (!s) return null;
    const m = s.match(/\b\d{5}\b\s+([^,]+)$/);
    if (!m?.[1]) return null;
    return m[1].trim();
  }

  private matchMeta(html: string, name: string): string | null {
    const n = (name ?? '').trim();
    if (!n) return null;

    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${this.escapeRegExp(n)}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i',
    );
    const m = html.match(re);
    return m?.[1] ? this.decodeXmlEntities(m[1]) : null;
  }

  private matchFirstTagText(html: string, tag: string): string | null {
    const t = (tag ?? '').trim();
    if (!t) return null;
    const re = new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i');
    const m = html.match(re);
    if (!m?.[1]) return null;
    const inner = m[1].replace(/<[^>]+>/g, ' ');
    return inner.replace(/\s+/g, ' ').trim();
  }

  private htmlToText(html: string) {
    return this.decodeXmlEntities(
      (html ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(p|div|li|h\d|tr|td|ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
  }

  private htmlToTextPreserveNewlines(html: string) {
    return this.decodeXmlEntitiesPreserveNewlines(
      (html ?? '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<br\s*\/?\s*>/gi, '\n')
        .replace(/<\/(p|div|li|h\d|tr|td|ul|ol)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim(),
    );
  }

  private extractFullDescription(html: string): string {
    const text = this.htmlToTextPreserveNewlines(html);
    const lines = text
      .split('\n')
      .map((l) => l.replace(/[ \t]+/g, ' ').trim())
      .filter((l) => l !== '');

    const startIdx = lines.findIndex(
      (l) => /Modification\s*\?/i.test(l) || /Signaler une erreur/i.test(l) || /supprimer l['’]annonce/i.test(l),
    );
    const begin = startIdx >= 0 ? startIdx + 1 : 0;

    const stopRe = /^(?:-\s*)?(Partager sur|Dernière modif\.|Lettre d'information|Vous pouvez aussi trouver|Page générée)/i;
    let end = lines.length;
    for (let i = begin; i < lines.length; i++) {
      if (stopRe.test(lines[i] ?? '')) {
        end = i;
        break;
      }
    }

    return lines.slice(begin, end).join('\n').trim();
  }

  private decodeXmlEntities(s: string) {
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
      rsquo: '’',
      ndash: '–',
      mdash: '—',
      hellip: '…',
      deg: '°',
    };

    return (s ?? '')
      .replace(/&(#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_m, _g1, dec, hex, named) => {
        if (dec) {
          const n = Number(dec);
          return Number.isFinite(n) ? String.fromCharCode(n) : '';
        }
        if (hex) {
          const n = parseInt(hex, 16);
          return Number.isFinite(n) ? String.fromCharCode(n) : '';
        }
        const key = String(named ?? '').toLowerCase();
        return map[key] ?? '';
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  private decodeXmlEntitiesPreserveNewlines(s: string) {
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
      rsquo: '’',
      ndash: '–',
      mdash: '—',
      hellip: '…',
      deg: '°',
    };

    const decoded = (s ?? '').replace(/&(#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (_m, _g1, dec, hex, named) => {
      if (dec) {
        const n = Number(dec);
        return Number.isFinite(n) ? String.fromCharCode(n) : '';
      }
      if (hex) {
        const n = parseInt(hex, 16);
        return Number.isFinite(n) ? String.fromCharCode(n) : '';
      }
      const key = String(named ?? '').toLowerCase();
      return map[key] ?? '';
    });

    return decoded
      .replace(/\r/g, '')
      .replace(/[\t ]+\n/g, '\n')
      .replace(/\n[\t ]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private escapeRegExp(s: string) {
    return (s ?? '').replace(/[.*+?^${}()|[\[\]\\]]/g, '\\$&');
  }
}
