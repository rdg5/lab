import { db } from '../db'
import { sql } from 'kysely'
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
    .execute();
}

export async function createNewPost(post: any) {
	return await db.insertInto("post").values(post).returning(['id','title','url','voteCount']).execute();
}

export async function updatePost(id: bigint, vote: any) {
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
