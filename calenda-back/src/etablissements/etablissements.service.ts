import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Etablissement } from './etablissement.entity';
import { User } from '../users/user.entity';
import { EtablissementType } from '../common/enums/etablissement-type.enum';
import { CreateEtablissementDto, UpdateEtablissementDto } from './dto/create-etablissement.dto';

export { CreateEtablissementDto, UpdateEtablissementDto };

@Injectable()
export class EtablissementsService {
  constructor(
    @InjectRepository(Etablissement)
    private readonly repo: Repository<Etablissement>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  private etabDto(e: Etablissement) {
    return {
      ...e,
      proprietaireId: e.proprietaire?.id ?? null,
      proprietairePseudo: e.proprietaire?.pseudo ?? null,
    };
  }

  async list(type?: EtablissementType, tag?: string) {
    const items = await this.repo.find({
      relations: { proprietaire: true },
      order: { featuredTier: 'DESC', featured: 'DESC', createdAt: 'DESC' },
    });
    const filtered = items.filter((e) => {
      if (!e.public) return false;
      if (type && !(e.types ?? []).includes(type)) return false;
      if (tag && !(e.tags ?? []).includes(tag)) return false;
      return true;
    });
    return filtered.map((e) => this.etabDto(e));
  }

  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id }, relations: { proprietaire: true } });
    if (!e) throw new NotFoundException('etablissement_not_found');
    return this.etabDto(e);
  }

  async findOneRaw(id: string): Promise<Etablissement> {
    const e = await this.repo.findOne({ where: { id }, relations: { proprietaire: true } });
    if (!e) throw new NotFoundException('etablissement_not_found');
    return e;
  }

  async create(dto: CreateEtablissementDto) {
    const e = this.repo.create({
      ...dto,
      types: dto.types ?? [],
      tags: dto.tags ?? [],
      public: dto.public ?? true,
      featured: dto.featured ?? false,
    });
    if (dto.proprietaireId) {
      const user = await this.usersRepo.findOne({ where: { id: dto.proprietaireId } });
      if (user) e.proprietaire = user;
    }
    const saved = await this.repo.save(e);
    return this.etabDto(saved);
  }

  /** Mise à jour admin (tous les champs, y compris proprietaireId). */
  async update(id: string, dto: UpdateEtablissementDto) {
    const e = await this.findOneRaw(id);
    const { proprietaireId, ...rest } = dto as any;
    Object.assign(e, rest);
    if (proprietaireId !== undefined) {
      if (proprietaireId === null || proprietaireId === '') {
        e.proprietaire = null;
      } else {
        const user = await this.usersRepo.findOne({ where: { id: proprietaireId } });
        if (user) e.proprietaire = user;
      }
    }
    const saved = await this.repo.save(e);
    return this.etabDto(saved);
  }

  /** Mise à jour par le propriétaire ou un admin (champs limités pour non-admin). */
  async updateByUser(
    id: string,
    dto: UpdateEtablissementDto,
    userId: string,
    isAdmin: boolean,
  ) {
    const e = await this.findOneRaw(id);
    const isOwner = e.proprietaire?.id === userId;
    if (!isAdmin && !isOwner) throw new ForbiddenException('forbidden');

    const allowed: (keyof UpdateEtablissementDto)[] = [
      'nom', 'description', 'adresse', 'ville', 'imageUrl', 'types',
      'tags', 'contact', 'horaires', 'sourceUrl', 'latitude', 'longitude',
      'heureOuverture', 'heureFermeture',
    ];
    const patch: Partial<Etablissement> = {};
    for (const key of allowed) {
      if ((dto as any)[key] !== undefined) (patch as any)[key] = (dto as any)[key];
    }
    if (isAdmin) {
      if (dto.public !== undefined) patch.public = dto.public;
      if (dto.featured !== undefined) patch.featured = dto.featured;
      if (dto.featuredTier !== undefined) patch.featuredTier = dto.featuredTier;
      if ((dto as any).featuredStart !== undefined) (patch as any).featuredStart = (dto as any).featuredStart;
      if ((dto as any).featuredEnd !== undefined) (patch as any).featuredEnd = (dto as any).featuredEnd;
    }
    Object.assign(e, patch);
    const saved = await this.repo.save(e);
    return this.etabDto(saved);
  }

  async listAll() {
    const items = await this.repo.find({
      relations: { proprietaire: true },
      order: { createdAt: 'DESC' },
    });
    return items.map((e) => this.etabDto(e));
  }

  async listPending() {
    const items = await this.repo.find({
      where: { public: false },
      relations: { proprietaire: true },
      order: { createdAt: 'DESC' },
    });
    return items.map((e) => this.etabDto(e));
  }

  async validatePublic(id: string) {
    const e = await this.findOneRaw(id);
    e.public = true;
    const saved = await this.repo.save(e);
    return this.etabDto(saved);
  }

  async remove(id: string): Promise<void> {
    const e = await this.findOneRaw(id);
    await this.repo.remove(e);
  }

  async topTags(type?: EtablissementType, limit = 5): Promise<{ tag: string; count: number }[]> {
    const items = await this.repo.find({ where: { public: true } });
    const filtered = type ? items.filter((e) => (e.types ?? []).includes(type)) : items;
    const counts = new Map<string, number>();
    for (const item of filtered) {
      for (const tag of item.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async allTags(): Promise<{ tag: string; count: number }[]> {
    return this.topTags(undefined, 200);
  }

  async upsertFromSource(
    sourceUrl: string,
    dto: Omit<CreateEtablissementDto, 'public'>,
  ): Promise<{ created: boolean; etablissement: Etablissement }> {
    const existing = await this.repo.findOne({ where: { sourceUrl } });
    if (existing) {
      if (dto.nom) existing.nom = dto.nom;
      if (dto.description) existing.description = dto.description;
      if (dto.imageUrl) existing.imageUrl = dto.imageUrl;
      if (dto.adresse) existing.adresse = dto.adresse;
      if (dto.contact) existing.contact = dto.contact;
      if (dto.horaires) existing.horaires = dto.horaires;
      const saved = await this.repo.save(existing);
      return { created: false, etablissement: saved };
    }
    const created = await this.create({ ...dto, public: false });
    return { created: true, etablissement: created };
  }
}
