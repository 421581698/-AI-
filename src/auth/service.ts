import { createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";

const scrypt = promisify(scryptCallback);
export type Principal = { userId: string; email: string; role: "admin" | "user"; authType: "session" | "api_key" | "bootstrap" };
declare module "fastify" {
  interface FastifyRequest { principal: Principal | null }
}
const credentials = z.object({ email: z.string().trim().email().max(254).transform(v => v.toLowerCase()), password: z.string().min(12).max(128) }).strict();
const keyName = z.object({ name: z.string().trim().min(1).max(80) }).strict();

async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt.toString("base64url")}:${derived.toString("base64url")}`;
}
async function passwordMatches(password: string, encoded: string): Promise<boolean> {
  const [scheme, saltText, hashText] = encoded.split(":");
  if (scheme !== "scrypt" || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, "base64url");
  const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function sign(payload: Record<string, unknown>, secret: string) {
  const head = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const data = `${head}.${body}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}
function verify(token: string, secret: string): Principal | null {
  try {
    const [head, body, signature] = token.split(".");
    if (!head || !body || !signature) return null;
    const data = `${head}.${body}`;
    const expected = createHmac("sha256", secret).update(data).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    if (typeof claims.sub !== "string" || typeof claims.email !== "string" || (claims.role !== "admin" && claims.role !== "user") || typeof claims.exp !== "number" || claims.exp <= Date.now()/1000) return null;
    return { userId: claims.sub, email: claims.email, role: claims.role, authType: "session" };
  } catch { return null; }
}

export class AuthService {
  private readonly attempts = new Map<string, number[]>();
  private limited(request: FastifyRequest, action: string): boolean {
    const now = Date.now();
    const key = action + ":" + request.ip;
    const recent = (this.attempts.get(key) ?? []).filter((time) => now - time < 60_000);
    recent.push(now);
    this.attempts.set(key, recent);
    if (this.attempts.size > 5000) {
      for (const [entry, values] of this.attempts) if (values.every((time) => now - time >= 60_000)) this.attempts.delete(entry);
    }
    return recent.length > 10;
  }
  constructor(private readonly pool: Pool, private readonly secret: string, private readonly bootstrapKey?: string) {}
  async authenticate(token: string | undefined): Promise<Principal | null> {
    if (!token) return null;
    if (this.bootstrapKey && token.length === this.bootstrapKey.length && timingSafeEqual(Buffer.from(token), Buffer.from(this.bootstrapKey))) {
      return { userId: "00000000-0000-4000-8000-000000000001", email: "bootstrap@local", role: "admin", authType: "bootstrap" };
    }
    const session = verify(token, this.secret);
    if (session) {
      const user = await this.pool.query("SELECT status FROM users WHERE id=$1", [session.userId]);
      return user.rows[0]?.status === "active" ? session : null;
    }
    const hash = digest(token);
    const result = await this.pool.query(
      "UPDATE api_keys SET last_used_at=now() WHERE key_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) RETURNING user_id",
      [hash]
    );
    if (!result.rowCount) return null;
    const user = await this.pool.query("SELECT id,email,role,status FROM users WHERE id=$1", [result.rows[0].user_id]);
    const row = user.rows[0];
    return row?.status === "active" ? { userId: row.id, email: row.email, role: row.role, authType: "api_key" } : null;
  }
  private token(user: { id: string; email: string; role: "admin" | "user" }) {
    const now = Math.floor(Date.now()/1000);
    return sign({ sub: user.id, email: user.email, role: user.role, iat: now, exp: now + 60*60*12 }, this.secret);
  }
  async register(app: FastifyInstance) {
    app.post("/v1/auth/register", async (request, reply) => {
      if (this.limited(request, "register")) return reply.code(429).send({error:"rate_limited"});
      const parsed = credentials.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
      const id = randomUUID();
      try {
        const hash = await passwordHash(parsed.data.password);
        const result = await this.pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3) RETURNING id,email,role", [id, parsed.data.email, hash]);
        const user = result.rows[0] as {id:string;email:string;role:"user"|"admin"};
        return reply.code(201).send({ user: { id:user.id,email:user.email,role:user.role }, token:this.token(user), tokenType:"Bearer", expiresIn:43200 });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error:"email_already_registered" });
        throw error;
      }
    });
    app.post("/v1/auth/login", async (request, reply) => {
      if (this.limited(request, "login")) return reply.code(429).send({error:"rate_limited"});
      const parsed = credentials.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error:"invalid_request" });
      const result = await this.pool.query("SELECT id,email,password_hash,role,status FROM users WHERE email=$1", [parsed.data.email]);
      const user = result.rows[0];
      if (!user || user.status !== "active" || !(await passwordMatches(parsed.data.password,user.password_hash))) return reply.code(401).send({ error:"invalid_credentials" });
      return { user:{id:user.id,email:user.email,role:user.role}, token:this.token(user), tokenType:"Bearer", expiresIn:43200 };
    });
    app.get("/v1/auth/me", async (request, reply) => request.principal ? { user:request.principal } : reply.code(401).send({error:"unauthorized"}));
    app.get("/v1/auth/api-keys", async (request, reply) => {
      if (!request.principal || request.principal.authType === "bootstrap") return reply.code(403).send({error:"user_identity_required"});
      const result = await this.pool.query("SELECT id,name,key_prefix,last_used_at,expires_at,created_at FROM api_keys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC", [request.principal.userId]);
      return { keys:result.rows };
    });
    app.post("/v1/auth/api-keys", async (request, reply) => {
      if (!request.principal || request.principal.authType === "bootstrap") return reply.code(403).send({error:"user_identity_required"});
      const parsed = keyName.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({error:"invalid_request"});
      const key = `oah_${randomBytes(32).toString("base64url")}`;
      const id = randomUUID();
      await this.pool.query("INSERT INTO api_keys(id,user_id,name,key_prefix,key_hash) VALUES($1,$2,$3,$4,$5)", [id,request.principal.userId,parsed.data.name,key.slice(0,12),digest(key)]);
      return reply.code(201).send({id,name:parsed.data.name,key,keyPrefix:key.slice(0,12),warning:"Store this key now. It cannot be retrieved again."});
    });
    app.delete<{Params:{id:string}}>("/v1/auth/api-keys/:id", async (request, reply) => {
      if (!request.principal || request.principal.authType === "bootstrap") return reply.code(403).send({error:"user_identity_required"});
      const result = await this.pool.query("UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", [request.params.id,request.principal.userId]);
      return result.rowCount ? {revoked:true,id:request.params.id} : reply.code(404).send({error:"api_key_not_found"});
    });
  }
}
