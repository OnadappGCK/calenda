import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Event } from '../events/event.entity';

@Entity('users')
/** Entité TypeORM représentant un utilisateur (auth + profil + favoris). */
export class User {
  @PrimaryGeneratedColumn('uuid')
  /** Identifiant unique UUID. */
  id!: string;

  @Column({ unique: true })
  /** Email unique utilisé pour la connexion. */
  email!: string;

  @Column({ unique: true })
  /** Pseudo unique affiché dans l'application. */
  pseudo!: string;

  @Column()
  /** Ville du profil. */
  ville!: string;

  @Column()
  /** Lieu (ex: quartier) du profil. */
  lieu!: string;

  @Column({ type: 'text', nullable: true })
  profileImage!: string | null;

  @Column({ type: 'text', nullable: true })
  numero!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column()
  /** Hash bcrypt du mot de passe (jamais exposé au front). */
  passwordHash!: string;

  @Column({ default: false })
  isAdmin!: boolean;

  @Column({ default: false })
  /** Indique si l'email est vérifié. */
  emailVerified!: boolean;

  @Column({ default: false })
  isBanned!: boolean;

  @Column({ type: 'text', nullable: true })
  /** Token de vérification email (null si non utilisé). */
  emailVerificationToken!: string | null;

  @OneToMany(() => Event, (event) => event.organisateur)
  /** Événements organisés (relation 1-n). */
  organizedEvents!: Event[];

  @ManyToMany(() => Event, (event) => event.favoritedBy)
  @JoinTable({ name: 'user_favorites' })
  /** Événements favoris (relation n-n). */
  favorites!: Event[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
