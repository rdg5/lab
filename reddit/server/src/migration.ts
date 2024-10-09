import { Kysely } from 'kysely'
import { db } from './db';



export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('post')
    .addColumn('id', 'integer', (col) => col.primaryKey())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('url', 'text', (col) => col.notNull())
    .addColumn('voteCount', 'integer', (col) => col.notNull().defaultTo(0))
    .execute()
	}
 
export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('post').execute()
}

up(db).then(() => process.exit(0)).catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});