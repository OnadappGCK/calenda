import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventSlot } from './event-slot.entity';
import { EventCategory } from '../common/enums/event-category.enum';
import { EventOrigin } from '../common/enums/event-origin.enum';
import { EventTag } from '../common/enums/event-tag.enum';
import { User } from '../users/user.entity';

const dbType = (process.env.DB_TYPE ?? '').toLowerCase();
const usePostgres = dbType === 'postgres' || !!process.env.DB_HOST;
const dateColumnType = usePostgres ? 'timestamptz' : 'datetime';

@Entity('events')
/** Entité TypeORM représentant un événement (dates, localisation, visibilité, organisateur, favoris). */
export class Event {
  @PrimaryGeneratedColumn('uuid')
  /** Identifiant unique UUID. */
  id!: string;

  @Column()
  /** Titre de l'événement. */
  titre!: string;

  @Column({ type: 'text' })
  /** Description détaillée. */
  description!: string;

  @Column({ type: 'text' })
  /** Catégorie (enum). */
  categorie!: EventCategory;

  @Column({ type: 'text', default: EventOrigin.MANUAL })
  /** Origine de l'événement (création manuelle vs import externe). */
  origin!: EventOrigin;

  @Column()
  /** Ville. */
  ville!: string;

  @Column()
  /** Lieu (adresse / salle / etc.). */
  lieu!: string;

  @Column({ type: 'text', nullable: true })
  adresse!: string | null;

  @Column({ type: 'real', nullable: true })
  latitude!: number | null;

  @Column({ type: 'real', nullable: true })
  longitude!: number | null;

  @Column({ type: 'text', nullable: true })
  /** Thème (optionnel) utilisé pour l'UI. */
  theme!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  /** Liste de caractéristiques (tags) associées à l'événement (max 3). */
  caracteristiques!: EventTag[] | null;

  @Column({ type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'text', nullable: true, default: 'Non renseigné' })
  tarif!: string | null;

  @Column({ type: 'text', nullable: true })
  contact!: string | null;

  @Column({ type: dateColumnType })
  /** Date/heure de début. */
  dateDebut!: Date;

  @Column({ type: dateColumnType, nullable: true })
  /** Date/heure de fin. */
  dateFin!: Date | null;

  @Column({ default: false })
  /** Indique si l'événement est public (visible pour tous). */
  public!: boolean;

  @Column({ default: false })
  /** Indique si l'événement est mis en avant (homepage). */
  enAvant!: boolean;

  @Column({ type: 'text', nullable: true })
  /** Couleur custom (optionnel). */
  couleur!: string | null;

  @ManyToOne(() => User, (user) => user.organizedEvents, { eager: true, nullable: true })
  /** Organisateur (relation n-1). */
  organisateur!: User | null;

  @OneToMany(() => EventSlot, (slot) => slot.event, { cascade: ['insert', 'update', 'remove'], eager: false })
  /** Créneaux horaires de l'événement (chaque slot = date + heure début + heure fin). */
  slots!: EventSlot[];

  @ManyToMany(() => User, (user) => user.favorites)
  /** Utilisateurs ayant mis l'événement en favori (relation n-n). */
  favoritedBy!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
