import { getPosts, getOnePostById, createNewPost, updatePost } from "../repositories/postRepository";

export async function getAllPosts() {
  return await getPosts();
}

export async function getPostById(id: bigint) {
  return await getOnePostById(id);
}

export async function createPost(post: any) {
	const [newPost] = await createNewPost(post);
	return {...newPost, id:Number(newPost.id)}
}

export async function votePost(id: bigint, vote: string) {
	const [updatedPost] = await updatePost(id, vote);
	return {...updatedPost, id:Number(updatedPost.id)}
}
