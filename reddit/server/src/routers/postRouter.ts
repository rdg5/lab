import {
  getAllPosts,
  getPostById,
  createPost,
  votePost,
} from "../services/postService";
import { postOutputSchema, postsArraySchema } from "../schemas/postSchema";
import { t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const postRouter = t.router({
  getAllPosts: t.procedure.query(async () => {
    const posts = await getAllPosts();
    const validatedPosts = postsArraySchema.safeParse(posts);
    if (!validatedPosts.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `We couldn't find any posts`,
      });
    }
    return validatedPosts.data;
  }),
  getPostById: t.procedure
    .input(
      z.object({
        id: z.union([z.string(), z.number()]).transform((val) => BigInt(val)),
      }),
    )
    .query(async ({ input }) => {
      const post = await getPostById(input.id);
      const validatedPost = postOutputSchema.safeParse(post);
      if (!validatedPost.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Post doesn't exist`,
        });
      }
      return validatedPost.data;
    }),
  createPost: t.procedure
    .input(z.object({ title: z.string(), url: z.string().url() }))
    .mutation(async ({ input }) => {
      const newPost = await createPost(input);
      const validatedPost = postOutputSchema.safeParse(newPost);
      if (!validatedPost.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `We couldn't create this post`,
        });
      }
      return validatedPost.data;
    }),
  votePost: t.procedure
    .input(
      z.object({
        id: z.string().transform((id) => BigInt(id)),
        vote: z.enum(["up", "down"]),
      }),
    )
    .mutation(async ({ input }) => {
      const updatedPost = await votePost(input.id, input.vote);
      const validatedPost = postOutputSchema.safeParse(updatedPost);
      if (!validatedPost.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Something went wrong!`,
        });
      }
      return validatedPost.data;
    }),
});

export type PostRouter = typeof postRouter;
