import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: z.string().url().optional(),
  API_KEY: z.string().min(16).optional(),
  AUTH_TOKEN_SECRET: z.string().min(32).optional(),
  CORS_ORIGINS: z.string().default("")
}).superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !value.AUTH_TOKEN_SECRET) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["AUTH_TOKEN_SECRET"], message: "AUTH_TOKEN_SECRET is required in production" });
  }
  if (value.NODE_ENV === "production" && !value.DATABASE_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["DATABASE_URL"], message: "DATABASE_URL is required in production" });
  }
  if (value.NODE_ENV === "production" && !value.API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["API_KEY"],
      message: "API_KEY is required in production"
    });
  }
});

export const config = schema.parse(process.env);
