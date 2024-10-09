import { initTRPC } from '@trpc/server';
import { postRouter } from './routers/postRouter';

const t = initTRPC.create();

export const appRouter = t.router({
  post: postRouter,
});

export type AppRouter = typeof appRouter;