import { Kysely, SqliteDialect } from "kysely";
import { Db } from "./types"
import Database from "better-sqlite3";

export const db = new Kysely<Db>({
  dialect: new SqliteDialect({
    database: new Database("reddit_posts.db"),
  }),
});
