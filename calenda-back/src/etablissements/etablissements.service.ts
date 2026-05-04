import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Etablissement } from './etablissement.entity';
import { EtablissementType } from '../common/enums/etablissement-type.enum';
import { CreateEtablissementDto, UpdateEtablissementDto } from './dto/create-etablissement.dto';

export { CreateEtablissementDto, UpdateEtablissementDto };

@Injectable()
export class EtablissementsService {
  constructor(
    @InjectRepository(Etablissement)
    private readonly repo: Repository<Etablissement>,
  ) {}

  async list(type?: EtablissementType, tag?: string): Promise<Etablissement[]> {
    const qb = this.repo.createQueryBuilder('e').where('e.public = :pub', { pub: true });
    if (type) qb.andWhere('e.type = :type', { type });
    qb.orderBy('e.featuredTier', 'DESC').addOrderBy('e.featured', 'DESC').addOrderBy('e.createdAt', 'DESC');
    const items = await qb.getMany();
    if (tag) return items.filter((e) => (e.tags ?? []).includes(tag));
    return items;
  }

  async findOne(id: string): Promise<Etablissement> {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException('etablissement_not_found');
    return e;
  }

  async create(dto: CreateEtablissementDto): Promise<Etablissement> {
    const e = this.repo.create({
      ...dto,
      tags: dto.tags ?? [],
      public: dto.public ?? true,
      featured: dto.featured ?? false,
    });
    return this.repo.save(e);
  }

  async update(id: string, dto: UpdateEtablissementDto): Promise<Etablissement> {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    return this.repo.save(e);
  }

  async listAll(): Promise<Etablissement[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async listPending(): Promise<Etablissement[]> {
    return this.repo.find({ where: { public: false }, order: { createdAt: 'DESC' } });
  }

  async validatePublic(id: string): Promise<Etablissement> {
    const e = await this.findOne(id);
    e.public = true;
    return this.repo.save(e);
  }

  async remove(id: string): Promise<void> {
    const e = await this.findOne(id);
    await this.repo.remove(e);
  }

  async topTags(type?: EtablissementType, limit = 5): Promise<{ tag: string; count: number }[]> {
    const qb = this.repo.createQueryBuilder('e').where('e.public = :pub', { pub: true });
    if (type) qb.andWhere('e.type = :type', { type });
    const items = await qb.getMany();
    const counts = new Map<string, number>();
    for (const item of items) {
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
