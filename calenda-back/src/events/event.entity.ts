import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EventCategory } from '../common/enums/event-category.enum';
import { User } from '../users/user.entity';

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

  @Column()
  /** Ville. */
  ville!: string;

  @Column()
  /** Lieu (adresse / salle / etc.). */
  lieu!: string;

  @Column({ type: 'text', nullable: true })
  /** Thème (optionnel) utilisé pour l'UI. */
  theme!: string | null;

  @Column({ type: 'datetime' })
  /** Date/heure de début. */
  dateDebut!: Date;

  @Column({ type: 'datetime' })
  /** Date/heure de fin. */
  dateFin!: Date;

  @Column({ default: false })
  /** Indique si l'événement est public (visible pour tous). */
  public!: boolean;

  @Column({ default: false })
  /** Indique si l'événement est mis en avant (homepage). */
  enAvant!: boolean;

  @Column({ type: 'text', nullable: true })
  /** Couleur custom (optionnel). */
  couleur!: string | null;

  @ManyToOne(() => User, (user) => user.organizedEvents, { eager: true })
  /** Organisateur (relation n-1). */
  organisateur!: User;

  @ManyToMany(() => User, (user) => user.favorites)
  /** Utilisateurs ayant mis l'événement en favori (relation n-n). */
  favoritedBy!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
