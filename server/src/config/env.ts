import path from "node:path";
import dotenv from "dotenv";

const environmentFile =
  process.env.NODE_ENV === "production" ? ".env.prod" : ".env.local";

if (process.env.NODE_ENV !== "test")
  dotenv.config({
    path: path.resolve(process.cwd(), environmentFile),
  });

export { environmentFile };
