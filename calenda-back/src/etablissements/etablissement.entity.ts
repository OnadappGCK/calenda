import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { EtablissementType } from '../common/enums/etablissement-type.enum';

@Entity('etablissements')
export class Etablissement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  nom!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  adresse!: string | null;

  @Column({ nullable: true })
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

  @Column({ default: true })
  public!: boolean;

  @Column({ default: false })
  featured!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
