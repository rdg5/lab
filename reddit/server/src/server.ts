import Koa from "koa";
import cors from "@koa/cors";
import bodyParser from "@koa/bodyparser";
import { createKoaMiddleware } from "trpc-koa-adapter";
import { appRouter } from "./router";
import { createContext } from "./context";

const app = new Koa();

app.use(cors({
  origin: '*',
  credentials: true,
}));

app.use(bodyParser());

app.use(
  createKoaMiddleware({
    router: appRouter,
    createContext,
    prefix: "/trpc",
  }),
);

const port = 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
