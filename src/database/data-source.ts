import { DataSource } from 'typeorm';
import { EvaluationHistoryEntity } from '../evaluation-history/evaluation-history.entity';

/**
 * CLI entry point for `typeorm migration:run`/`migration:generate` — separate from
 * DatabaseModule's forRootAsync (which NestJS uses at runtime) because the TypeORM CLI
 * needs a plain DataSource, not a NestJS-wrapped async factory.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'postgres',
  port: Number(process.env.POSTGRES_PORT ?? '5432'),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  entities: [EvaluationHistoryEntity],
  migrations: [__dirname + '/migrations/*.js'],
});
