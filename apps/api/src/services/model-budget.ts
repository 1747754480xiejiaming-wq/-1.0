import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelProvider,ModelUsage } from '@campus/contracts';
import { AppError } from '../errors.js';

export const WEEKLY_LIMIT_NANO=20_000_000_000;
export const PRICING_VERSION='2026-09-04';
// CNY per million tokens converted to integer nano-CNY per token.
// Conservative peak/no-cache prices avoid depending on provider discounts.
export const PRICES={deepseek:{input:3000,output:9000},zhipu:{input:800,output:2000},qwen:{input:800,output:2000}} as const;
export function weekWindow(now=Date.now()) {
  const local=new Date(now+8*3600000),day=local.getUTCDay()||7;
  const start=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()-(day-1))-8*3600000;
  return {key:new Date(start+8*3600000).toISOString().slice(0,10),start,resetAt:start+7*86400000};
}
export class ModelBudget {
  readonly db:Database.Database;
  constructor(path:string,private concurrency=2){
    if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new Database(path);this.db.pragma('journal_mode=WAL');this.db.pragma('busy_timeout=5000');
    this.db.exec(`CREATE TABLE IF NOT EXISTS model_calls(id TEXT PRIMARY KEY,week_key TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,reserved_nano INTEGER NOT NULL,charged_nano INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,finished_at INTEGER,pricing_version TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS model_calls_week ON model_calls(week_key,provider);
      CREATE INDEX IF NOT EXISTS model_calls_active ON model_calls(status,created_at);
      CREATE TABLE IF NOT EXISTS account_plan(id INTEGER PRIMARY KEY CHECK(id=1),plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),updated_at INTEGER NOT NULL);
      INSERT OR IGNORE INTO account_plan(id,plan,updated_at) VALUES(1,'plus',0);`);
  }
  close(){if(this.db.open)this.db.close();}
  plan(){const row=this.db.prepare('SELECT plan,updated_at FROM account_plan WHERE id=1').get() as {plan:'plus'|'pro';updated_at:number};return {plan:row.plan,quotaMultiplier:(row.plan==='pro'?5:1) as 1|5,updatedAt:row.updated_at};}
  upgradeToPro(now=Date.now()){this.db.prepare("UPDATE account_plan SET plan='pro',updated_at=? WHERE id=1").run(now);return this.plan();}
  private limit(){return WEEKLY_LIMIT_NANO*this.plan().quotaMultiplier;}
  reserve(provider:ModelProvider,model:string,inputUpper:number,outputUpper:number,now=Date.now()){
    const rate=PRICES[provider],cost=Math.ceil(inputUpper*rate.input+outputUpper*rate.output),week=weekWindow(now);
    return this.db.transaction(()=>{
      this.db.prepare("UPDATE model_calls SET status='unknown',charged_nano=reserved_nano,finished_at=? WHERE status='reserved' AND created_at<?").run(now,now-120000);
      const used=(this.db.prepare("SELECT coalesce(sum(CASE WHEN status='reserved' THEN reserved_nano ELSE charged_nano END),0) AS n FROM model_calls WHERE week_key=?").get(week.key) as {n:number}).n;
      if(used+cost>this.limit())throw new AppError(429,'WEEKLY_LIMIT','本周模型额度已用尽或剩余额度不足，已拒绝调用模型，请下周额度重置后再试。');
      const active=(this.db.prepare("SELECT count(*) AS n FROM model_calls WHERE status='reserved'").get() as {n:number}).n;
      if(active>=this.concurrency)throw new AppError(429,'MODEL_CAPACITY','模型正在处理其他问题，请稍后重试。');
      const id=randomUUID();this.db.prepare("INSERT INTO model_calls(id,week_key,provider,model,status,reserved_nano,created_at,pricing_version) VALUES(?,?,?,?,'reserved',?,?,?)").run(id,week.key,provider,model,cost,now,PRICING_VERSION);return id;
    }).immediate();
  }
  settle(id:string,usage:{inputTokens:number;outputTokens:number}|null,rejected=false,now=Date.now()){
    this.db.transaction(()=>{
      const row=this.db.prepare('SELECT * FROM model_calls WHERE id=?').get(id) as {status:string;provider:ModelProvider;reserved_nano:number}|undefined;
      if(!row||!['reserved','unknown'].includes(row.status))return;
      const rate=PRICES[row.provider];const charge=rejected?0:usage?Math.ceil(usage.inputTokens*rate.input+usage.outputTokens*rate.output):row.reserved_nano;
      this.db.prepare('UPDATE model_calls SET status=?,charged_nano=?,input_tokens=?,output_tokens=?,finished_at=? WHERE id=?').run(rejected?'rejected':usage?'completed':'unknown',charge,usage?.inputTokens||0,usage?.outputTokens||0,now,id);
    }).immediate();
  }
  usage(now=Date.now()):ModelUsage {
    this.db.prepare("UPDATE model_calls SET status='unknown',charged_nano=reserved_nano,finished_at=? WHERE status='reserved' AND created_at<?").run(now,now-120000);
    const week=weekWindow(now),rows=this.db.prepare(`SELECT provider,count(*) AS calls,sum(input_tokens) AS inputTokens,sum(output_tokens) AS outputTokens,
      sum(CASE WHEN status='reserved' THEN reserved_nano ELSE charged_nano END) AS total,
      sum(CASE WHEN status='reserved' THEN 1 ELSE 0 END) AS active,
      sum(CASE WHEN status='unknown' THEN 1 ELSE 0 END) AS unknownCalls
      FROM model_calls WHERE week_key=? GROUP BY provider`).all(week.key) as {provider:ModelProvider;calls:number;inputTokens:number;outputTokens:number;total:number;active:number;unknownCalls:number}[];
    const providers=(['qwen','deepseek','zhipu'] as const).map(provider=>{const row=rows.find(r=>r.provider===provider);return {provider,inputTokens:row?.inputTokens||0,outputTokens:row?.outputTokens||0,totalTokens:(row?.inputTokens||0)+(row?.outputTokens||0),calls:row?.calls||0};});
    const used=rows.reduce((n,r)=>n+r.total,0),limit=this.limit();
    return {weekStart:week.key,resetAt:week.resetAt,updatedAt:now,consumedPercent:Math.min(100,Math.ceil(used/limit*10000)/100),exhausted:used>=limit,totalTokens:providers.reduce((n,p)=>n+p.totalTokens,0),activeCalls:rows.reduce((n,r)=>n+r.active,0),unknownCalls:rows.reduce((n,r)=>n+r.unknownCalls,0),providers};
  }
}
