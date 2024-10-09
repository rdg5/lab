import { CreateTrpcKoaContextOptions } from "trpc-koa-adapter";

export const createContext = ({ req, res }: CreateTrpcKoaContextOptions) => ({
  req,
  res,
});

export type Context = ReturnType<typeof createContext>;
