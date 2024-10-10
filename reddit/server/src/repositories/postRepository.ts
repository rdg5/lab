import { db } from '../db'
import { sql } from 'kysely'

interface Post {
  id?: bigint;
  title: string;
  url: string;
  voteCount?: bigint;
}

export async function getPosts() {
  return await db.selectFrom('post')
    .selectAll()
    .execute()
}

export async function getOnePostById(id: bigint) {
  return await db
    .selectFrom("post")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function createNewPost(post: Post) {
	return await db.insertInto("post").values(post).returning(['id','title','url','voteCount']).execute();
}

export async function updatePost(id: bigint, vote: string) {
	const increment = vote === 'up' ? 1 : -1;
  return await db
	.updateTable('post')
	.set({
		voteCount: sql`voteCount + ${increment}`,
	})
	.where('id', '=', id)
	.returning(['id', 'title', 'url', 'voteCount'])
	.execute();
}
