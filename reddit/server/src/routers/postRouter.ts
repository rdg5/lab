import { getAllPosts, getPostById, createPost, votePost } from '../services/postService';
import { t } from '../trpc';
import { z } from 'zod';

export const postRouter = t.router({
  getAllPosts: t.procedure.query(async () => {
    return await getAllPosts();
  }),
	getPostById: t.procedure.input(z.object({ id: z.bigint() })).query(async ({ input }) => {
		return await getPostById(input.id);
  }),
	createPost: t.procedure.input(z.object({ title: z.string(), url: z.string()})).mutation(async ({ input }) => {
		return await createPost(input);
  }),
	votePost: t.procedure.input(z.object({id: z.string().transform((id) => BigInt(id)), vote: z.enum(['up', 'down'])})).mutation(async ({ input }) => {
		return await votePost(input.id, input.vote);
	})
})

export type PostRouter = typeof postRouter;
