import { z } from "zod";

export const postOutputSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  voteCount: z.string(),
});

export const postsArraySchema = z.array(postOutputSchema);

