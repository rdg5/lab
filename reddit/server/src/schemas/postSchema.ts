import { z } from 'zod';

export const postOutputSchema = z.object({
  id: z.bigint(),
  title: z.string(),
  url: z.string().url(),
  voteCount: z.number(),
});

export const postsArraySchema = z.array(postOutputSchema);