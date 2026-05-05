import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EtablissementType } from '../common/enums/etablissement-type.enum';

@Entity('etablissements')
export class Etablissement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  nom!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  adresse!: string | null;

  @Column({ type: 'text', nullable: true })
  ville!: string | null;

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'text' })
  type!: EtablissementType;

  @Column({ type: 'simple-json', nullable: true, default: '[]' })
  tags!: string[];

  @Column({ type: 'real', nullable: true })
  latitude!: number | null;

  @Column({ type: 'real', nullable: true })
  longitude!: number | null;

  @Column({ type: 'text', nullable: true })
  sourceUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  contact!: string | null;

  @Column({ type: 'text', nullable: true })
  horaires!: string | null;

  @Column({ type: 'text', nullable: true })
  heureOuverture!: string | null;

  @Column({ type: 'text', nullable: true })
  heureFermeture!: string | null;

  @Column({ type: 'boolean', default: true })
  public!: boolean;

  @Column({ type: 'boolean', default: false })
  featured!: boolean;

  @Column({ type: 'integer', default: 0 })
  featuredTier!: number;

  @Column({ type: 'text', nullable: true })
  featuredStart!: string | null;

  @Column({ type: 'text', nullable: true })
  featuredEnd!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
