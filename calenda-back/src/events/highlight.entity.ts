import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Event } from './event.entity';

const dbType = (process.env.DB_TYPE ?? '').toLowerCase();
const usePostgres = dbType === 'postgres' || !!process.env.DB_HOST;
const dateColumnType = usePostgres ? 'timestamptz' : 'datetime';

@Entity('highlights')
/** Mise en avant d'un événement sur une période avec priorité (standard=0, premium>0). */
export class Highlight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  eventId!: string;

  @ManyToOne(() => Event, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'eventId' })
  event!: Event;

  @Column({ type: dateColumnType })
  startAt!: Date;

  @Column({ type: dateColumnType })
  endAt!: Date;

  /** 0 = standard, valeur positive = premium (plus élevé = affiché en premier). */
  @Column({ default: 0 })
  priority!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
