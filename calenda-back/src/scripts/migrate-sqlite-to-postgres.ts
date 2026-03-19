import 'reflect-metadata';
import 'dotenv/config';

import { DataSource } from 'typeorm';
import { Event } from '../events/event.entity';
import { News } from '../news/news.entity';
import { User } from '../users/user.entity';

type FavoriteRow = Record<string, any>;

function pickKnownColumns<T>(rows: Array<Record<string, any>>, ds: DataSource, entity: { new (): T }): Array<Record<string, any>> {
  const repo = ds.getRepository(entity);
  const allowed = new Set(repo.metadata.columns.map((c) => c.databaseName));
  return rows.map((r) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(r)) {
      if (allowed.has(k)) out[k] = v;
    }
    return out;
  });
}

function asBool(v: any): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === 'true' || v === '1';
  return !!v;
}

function asDate(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(v);
  return null;
}

function asNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function asJsonArray(v: any): any[] | null {
  if (v === null || v === undefined || v === '') return null;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function ensureTargetIsEmpty(pg: DataSource) {
  const usersCount = await pg.getRepository(User).count();
  const eventsCount = await pg.getRepository(Event).count();
  const newsCount = await pg.getRepository(News).count();

  if (usersCount || eventsCount || newsCount) {
    throw new Error(
      `Target database is not empty (users=${usersCount}, events=${eventsCount}, news=${newsCount}). Aborting to avoid duplicates.`,
    );
  }
}

async function migrateFavorites(sqlite: DataSource, pg: DataSource) {
  let rows: FavoriteRow[] = [];
  try {
    rows = (await sqlite.manager.query('SELECT * FROM user_favorites')) as FavoriteRow[];
  } catch {
    return;
  }

  if (!rows.length) return;

  const keys = Object.keys(rows[0] ?? {});
  if (keys.length < 2) return;

  const cleaned = rows
    .map((r) => {
      const out: FavoriteRow = {};
      for (const k of keys) out[k] = r[k];
      return out;
    })
    .filter((r) => keys.every((k) => !!r[k]));

  if (!cleaned.length) return;

  await pg.createQueryBuilder().insert().into('user_favorites').values(cleaned).execute();
}

async function main() {
  const sqlitePath = process.env.SQLITE_PATH ?? 'calenda.sqlite';

  const pgHost = process.env.DB_HOST ?? 'localhost';
  const pgPort = Number(process.env.DB_PORT ?? 5432);
  const pgUser = process.env.DB_USER ?? 'postgres';
  const pgPass = process.env.DB_PASS ?? '';
  const pgName = process.env.DB_NAME ?? 'calenda';

  const sqlite = new DataSource({
    type: 'sqlite',
    database: sqlitePath,
    entities: [],
    synchronize: false,
  });

  const pg = new DataSource({
    type: 'postgres',
    host: pgHost,
    port: pgPort,
    username: pgUser,
    password: pgPass,
    database: pgName,
    entities: [User, Event, News],
    synchronize: true,
    uuidExtension: 'pgcrypto',
    installExtensions: true,
  });

  await sqlite.initialize();
  await pg.initialize();

  try {
    await ensureTargetIsEmpty(pg);

    process.stdout.write(`Reading source SQLite: ${sqlitePath}\n`);

    const users = (await sqlite.manager.query('SELECT * FROM users')) as Array<Record<string, any>>;
    const news = (await sqlite.manager.query('SELECT * FROM news')) as Array<Record<string, any>>;
    const events = (await sqlite.manager.query('SELECT * FROM events')) as Array<Record<string, any>>;

    process.stdout.write(`Source rows: users=${users.length} events=${events.length} news=${news.length}\n`);

    const usersPicked = pickKnownColumns(users, pg, User);
    const newsPicked = pickKnownColumns(news, pg, News);
    const eventsPicked = pickKnownColumns(events, pg, Event);

    const usersValues = usersPicked.map((u) => ({
      ...u,
      isAdmin: asBool(u.isAdmin),
      emailVerified: asBool(u.emailVerified),
      createdAt: asDate(u.createdAt) ?? undefined,
      updatedAt: asDate(u.updatedAt) ?? undefined,
    }));

    const newsValues = newsPicked.map((n) => ({
      ...n,
      createdAt: asDate(n.createdAt) ?? undefined,
    }));

    const eventsValues = eventsPicked.map((e) => ({
      ...e,
      public: asBool(e.public),
      enAvant: asBool(e.enAvant),
      latitude: asNumber(e.latitude),
      longitude: asNumber(e.longitude),
      caracteristiques: asJsonArray(e.caracteristiques),
      dateDebut: asDate(e.dateDebut) ?? undefined,
      dateFin: asDate(e.dateFin),
      createdAt: asDate(e.createdAt) ?? undefined,
      updatedAt: asDate(e.updatedAt) ?? undefined,
    }));

    if (usersValues.length) await pg.getRepository(User).insert(usersValues);
    if (newsValues.length) await pg.getRepository(News).insert(newsValues);
    if (eventsValues.length) await pg.getRepository(Event).insert(eventsValues);

    await migrateFavorites(sqlite, pg);

    const doneUsers = await pg.getRepository(User).count();
    const doneEvents = await pg.getRepository(Event).count();
    const doneNews = await pg.getRepository(News).count();

    process.stdout.write(
      `Migration completed. users=${doneUsers} events=${doneEvents} news=${doneNews}\n`,
    );
  } finally {
    await sqlite.destroy();
    await pg.destroy();
  }
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
