import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { Pool } from "pg";
import { AuthService } from "./service.js";

type User = { id:string; email:string; password_hash:string; role:"user"; status:"active" };
type Key = { id:string; user_id:string; name:string; key_prefix:string; key_hash:string; revoked_at:string|null };
function fakePool() {
  const users:User[]=[];
  const keys:Key[]=[];
  const pool={ query: async (sql:string, values:unknown[] = []) => {
    if(sql.startsWith("INSERT INTO users")) {
      if(users.some(x=>x.email===values[1])) throw Object.assign(new Error("duplicate"),{code:"23505"});
      const user:User={id:String(values[0]),email:String(values[1]),password_hash:String(values[2]),role:"user",status:"active"};
      users.push(user); return {rows:[{id:user.id,email:user.email,role:user.role}],rowCount:1};
    }
    if(sql.startsWith("SELECT id,email,password_hash,role,status FROM users WHERE email")) {
      const u=users.find(x=>x.email===values[0]); return {rows:u?[u]:[],rowCount:u?1:0};
    }
    if(sql.startsWith("SELECT status FROM users")) {
      const u=users.find(x=>x.id===values[0]); return {rows:u?[{status:u.status}]:[],rowCount:u?1:0};
    }
    if(sql.startsWith("INSERT INTO api_keys")) {
      keys.push({id:String(values[0]),user_id:String(values[1]),name:String(values[2]),key_prefix:String(values[3]),key_hash:String(values[4]),revoked_at:null});
      return {rows:[],rowCount:1};
    }
    if(sql.startsWith("UPDATE api_keys SET last_used_at")) {
      const k=keys.find(x=>x.key_hash===values[0]&&!x.revoked_at);
      return {rows:k?[{user_id:k.user_id}]:[],rowCount:k?1:0};
    }
    if(sql.startsWith("SELECT id,email,role,status FROM users")) {
      const u=users.find(x=>x.id===values[0]); return {rows:u?[{id:u.id,email:u.email,role:u.role,status:u.status}]:[],rowCount:u?1:0};
    }
    if(sql.startsWith("SELECT id,name,key_prefix,last_used_at")) {
      const found=keys.filter(x=>x.user_id===values[0]&&!x.revoked_at).map(({id,name,key_prefix})=>({id,name,key_prefix}));
      return {rows:found,rowCount:found.length};
    }
    if(sql.startsWith("UPDATE api_keys SET revoked_at")) {
      const k=keys.find(x=>x.id===values[0]&&x.user_id===values[1]&&!x.revoked_at);
      if(k)k.revoked_at="now";
      return {rows:k?[{id:k.id}]:[],rowCount:k?1:0};
    }
    throw new Error("Unexpected SQL: "+sql);
  }};
  return pool as unknown as Pool;
}

describe("AuthService",()=>{
  it("registers users, issues signed sessions, and manages revocable API keys",async()=>{
    const service=new AuthService(fakePool(),"test-signing-secret-that-is-long-enough-32");
    const app=Fastify();
    app.decorateRequest("principal",null);
    app.addHook("onRequest",async(request,reply)=>{
      if(request.url.startsWith("/v1/auth/register")||request.url.startsWith("/v1/auth/login"))return;
      const token=request.headers.authorization?.replace(/^Bearer /,"");
      request.principal=await service.authenticate(token);
      if(!request.principal)return reply.code(401).send({error:"unauthorized"});
    });
    await service.register(app);
    const registration=await app.inject({method:"POST",url:"/v1/auth/register",payload:{email:"User@Example.com",password:"a-very-long-password"}});
    expect(registration.statusCode).toBe(201);
    const token=registration.json().token as string;
    expect(registration.json().user.email).toBe("user@example.com");
    expect(registration.json().user).not.toHaveProperty("password_hash");
    const me=await app.inject({method:"GET",url:"/v1/auth/me",headers:{authorization:"Bearer "+token}});
    expect(me.statusCode).toBe(200);
    const created=await app.inject({method:"POST",url:"/v1/auth/api-keys",headers:{authorization:"Bearer "+token},payload:{name:"test agent"}});
    expect(created.statusCode).toBe(201);
    const key=created.json().key as string;
    const keyMe=await app.inject({method:"GET",url:"/v1/auth/me",headers:{authorization:"Bearer "+key}});
    expect(keyMe.statusCode).toBe(200);
    const revoked=await app.inject({method:"DELETE",url:"/v1/auth/api-keys/"+created.json().id,headers:{authorization:"Bearer "+token}});
    expect(revoked.statusCode).toBe(200);
    const rejected=await app.inject({method:"GET",url:"/v1/auth/me",headers:{authorization:"Bearer "+key}});
    expect(rejected.statusCode).toBe(401);
    await app.close();
  });

  it("rejects weak passwords and duplicate account registrations",async()=>{
    const service=new AuthService(fakePool(),"test-signing-secret-that-is-long-enough-32");
    const app=Fastify();
    app.decorateRequest("principal",null);
    await service.register(app);
    const weak=await app.inject({method:"POST",url:"/v1/auth/register",payload:{email:"weak@example.com",password:"short"}});
    expect(weak.statusCode).toBe(400);
    const payload={email:"same@example.com",password:"a-very-long-password"};
    expect((await app.inject({method:"POST",url:"/v1/auth/register",payload})).statusCode).toBe(201);
    expect((await app.inject({method:"POST",url:"/v1/auth/register",payload})).statusCode).toBe(409);
    await app.close();
  });
});
