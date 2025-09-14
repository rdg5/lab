import { router } from './trpc.js';
import { authRouter } from './routers/auth.js';
import { todosRouter } from './routers/todos.js';

export const appRouter = router({
  auth: authRouter,
  todos: todosRouter,
});

export type AppRouter = typeof appRouter;