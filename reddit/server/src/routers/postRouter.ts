import { getAllPosts, getPostById, createPost, votePost } from '../services/postService';
import { postOutputSchema, postsArraySchema } from '../schemas/postSchema';
import { t,  } from '../trpc';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

export const postRouter = t.router({
  getAllPosts: t.procedure.query(async () => {
		const posts = await getAllPosts();
		const validatedPosts = postsArraySchema.safeParse(posts);

    if (!validatedPosts.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `We couldn't find any posts`,
      });
		}
  }),
	getPostById: t.procedure.input(z.object({ id: z.bigint() })).query(async ({ input }) => {
		const post = await getPostById(input.id);
		const validatedPost = postOutputSchema.safeParse(post);
	  if (!validatedPost.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `We couldn't find this post`,
      });
		}	
  }),
	createPost: t.procedure.input(z.object({ title: z.string(), url: z.string()})).mutation(async ({ input }) => {
		const newPost = await createPost(input);
		const validatedPost = postOutputSchema.safeParse(newPost);
	  if (!validatedPost.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `We couldn't create this post`,
      });
		}
  }),
	votePost: t.procedure.input(z.object({id: z.string().transform((id) => BigInt(id)), vote: z.enum(['up', 'down'])})).mutation(async ({ input }) => {
		const updatedPost = await votePost(input.id, input.vote);
		const validatedPost = postOutputSchema.safeParse(updatedPost);
	  if (!validatedPost.success) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Something went wrong!`,
      });
		}
	})
})

export type PostRouter = typeof postRouter;
