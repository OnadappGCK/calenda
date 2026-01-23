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
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  titre!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text' })
  categorie!: EventCategory;

  @Column()
  ville!: string;

  @Column()
  lieu!: string;

  @Column({ type: 'text', nullable: true })
  theme!: string | null;

  @Column({ type: 'datetime' })
  dateDebut!: Date;

  @Column({ type: 'datetime' })
  dateFin!: Date;

  @Column({ default: false })
  public!: boolean;

  @Column({ default: false })
  enAvant!: boolean;

  @Column({ type: 'text', nullable: true })
  couleur!: string | null;

  @ManyToOne(() => User, (user) => user.organizedEvents, { eager: true })
  organisateur!: User;

  @ManyToMany(() => User, (user) => user.favorites)
  favoritedBy!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
