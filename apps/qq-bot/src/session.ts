import { existsSync,mkdirSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PersistedSession,SessionPersistencePort } from '@tencent-connect/qqbot-nodejs/protocol';

interface SessionFile extends PersistedSession {appId:string;savedAt:number}

export function createFileSessionPersistence(path:string,appId:string,maxAgeMs=10*60_000):SessionPersistencePort {
  const clear=()=>rmSync(path,{force:true});
  return {
    load:()=>{
      try{
        const value=JSON.parse(readFileSync(path,'utf8')) as Partial<SessionFile>;
        if(value.appId!==appId||typeof value.sessionId!=='string'||!value.sessionId||!(value.lastSeq===null||Number.isSafeInteger(value.lastSeq))||typeof value.savedAt!=='number'||Date.now()-value.savedAt>maxAgeMs){clear();return null;}
        return {sessionId:value.sessionId,lastSeq:value.lastSeq as number|null};
      }catch{if(existsSync(path))clear();return null;}
    },
    save:(session)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({...session,appId,savedAt:Date.now()}),{mode:0o600});},
    clear,
  };
}
