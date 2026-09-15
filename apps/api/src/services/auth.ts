import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Store } from '../db/store.js';
import { AppError } from '../errors.js';
const derive = (password: string, salt: string) => new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password: string) {
  if(password.length<12 || password.length>128) throw new AppError(400,'WEAK_PASSWORD','口令长度需要为 12–128 个字符。');
  const salt=randomBytes(16).toString('hex');
  const key=await derive(password,salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored?: string) {
  const [,salt,expected]=stored?.split('$') || [];
  const valid=!!salt && /^[a-f0-9]{32}$/.test(salt) && !!expected && /^[a-f0-9]{128}$/.test(expected);
  const actual=await derive(password,valid?salt:'00000000000000000000000000000000');
  const matches=timingSafeEqual(actual,valid?Buffer.from(expected,'hex'):Buffer.alloc(64)); return valid && matches;
}
export async function login(store: Store,username: string,password: string) {
  const admin=store.findAdmin(username.trim());
  if(!await verifyPassword(password,admin?.password_hash) || !admin) throw new AppError(401,'INVALID_CREDENTIALS','账号或口令不正确。');
  const token=randomBytes(32).toString('base64url'),csrfToken=randomBytes(24).toString('base64url');
  store.saveSession(token,admin.id,csrfToken); return {token,csrfToken,user:{id:admin.id,username:admin.username,role:admin.role},workspaceId:admin.workspace_id};
}
export function constantEqual(a: string,b: string) { const x=Buffer.from(a),y=Buffer.from(b); return x.length===y.length && x.length>0 && timingSafeEqual(x,y); }
