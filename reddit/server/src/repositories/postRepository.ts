import { db } from "../db";
import { sql } from "kysely";

interface Post {
  id?: bigint;
  title: string;
  url: string;
  voteCount?: bigint;
}

export async function getPosts() {
  const posts = await db.selectFrom("post").selectAll().execute();

  return posts.map((post) => ({
    ...post,
    id: post.id.toString(),
    voteCount: post.voteCount.toString(),
  }));
}

export async function getOnePostById(id: bigint) {
  const post = await db
    .selectFrom("post")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();

  return {
    ...post,
    id: post?.id.toString(),
    voteCount: post?.voteCount.toString(),
  };
}

export async function createNewPost(post: Post) {
  const [newPost] = await db
    .insertInto("post")
    .values(post)
    .returning(["id", "title", "url", "voteCount"])
    .execute();

  return {
    ...newPost,
    id: newPost.id.toString(),
    voteCount: newPost.voteCount.toString(),
  };
}

export async function updatePost(id: bigint, vote: string) {
  const increment = vote === "up" ? 1 : -1;
  const [updatedPost] = await db
    .updateTable("post")
    .set({
      voteCount: sql`voteCount + ${increment}`,
    })
    .where("id", "=", id)
    .returning(["id", "title", "url", "voteCount"])
    .execute();

  return {
    ...updatedPost,
    id: updatedPost.id.toString(),
    voteCount: updatedPost.voteCount.toString(),
  };
}
