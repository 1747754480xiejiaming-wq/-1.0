import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from '../db/store.js';

// The official group-info response includes the name, but no numeric QQ group number.
// Names come from QQ; visible group numbers are confirmed by the teacher.
export class QqGroups {
  private nextSync=0;
  private fingerprint='';
  private pending:Promise<void>|null=null;
  constructor(private store:Store,private dataDir:string,private fetcher:typeof fetch=fetch){}
  invalidate(){this.nextSync=0;}
  sync():Promise<void>{
    let credentials:{appId:string;appSecret:string};
    try{credentials=JSON.parse(readFileSync(join(this.dataDir,'qq-credentials.json'),'utf8'));}catch{return Promise.resolve();}
    const fingerprint=JSON.stringify(credentials);
    if(this.pending)return this.pending;
    if(this.fingerprint===fingerprint&&Date.now()<this.nextSync)return Promise.resolve();
    this.fingerprint=fingerprint;this.nextSync=Date.now()+60_000;
    this.pending=this.refresh(credentials).catch(()=>{}).finally(()=>{this.pending=null;});
    return this.pending;
  }
  private async refresh(credentials:{appId:string;appSecret:string}){
    const groups=this.store.groupsToSync(credentials.appId);if(!groups.length)return;
    const response=await this.fetcher('https://bots.qq.com/app/getAppAccessToken',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:credentials.appId,clientSecret:credentials.appSecret}),redirect:'error',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return;
    const {access_token:token}=await response.json() as {access_token?:string};if(!token)return;
    // At most two metadata requests in flight. No messages are sent by this service.
    let next=0;
    await Promise.all([0,1].map(async()=>{while(next<groups.length){const group=groups[next++];try{
      const reply=await this.fetcher('https://api.sgroup.qq.com/v2/groups/'+encodeURIComponent(group.open_id)+'/info',{headers:{Authorization:'QQBot '+token},redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!reply.ok)continue;const info=await reply.json() as {group_openid?:string;group_name?:string};
      const current=JSON.parse(readFileSync(join(this.dataDir,'qq-credentials.json'),'utf8'));
      if(current.appId!==credentials.appId||current.appSecret!==credentials.appSecret)return;
      if(info.group_openid===group.open_id&&typeof info.group_name==='string')this.store.syncQqGroup(group.id,credentials.appId,info.group_name);
    }catch{/* Keep previously verified names; never replace them with an OpenID suffix. */}}}));
  }
}
