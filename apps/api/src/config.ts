import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as dotenv } from 'dotenv';
export function projectRoot(start = process.cwd()): string {
  if (process.env.CAMPUS_ROOT) return resolve(process.env.CAMPUS_ROOT);
  let p = resolve(start);
  while (true) {
    const f = join(p, 'package.json');
    if (existsSync(f) && JSON.parse(readFileSync(f, 'utf8')).name === 'campus-secretary-mvp') return p;
    const parent = dirname(p); if (parent === p) throw new Error('请从项目目录启动，或设置 CAMPUS_ROOT。'); p = parent;
  }
}
export interface Config { root: string; dataDir: string; modelStateDir:string; localDir: string; dbPath: string; host: string; port: number; origins: string[]; cookieSecure: boolean; rateLimit: number; loginRateLimit:number; botToken: string; modelKey: string; modelUrl: string; model: string; zhipuKey:string; zhipuUrl:string; zhipuModel:string; zhipuVisionModel:string; zhipuAsrModel:string; modelTimeout: number; modelConcurrency: number; modelDailyLimit: number; developerKey:string; developerUsername:string; developerPassword:string;registrationCode:string; logger: boolean }
interface RuntimeSecrets { botToken?:string;developerKey?:string;developerUsername?:string;developerPassword?:string;registrationCode?:string }
const number = (value: string | undefined, fallback: number, min: number, max: number) => { const n = Number(value || fallback); if (!Number.isInteger(n) || n < min || n > max) throw new Error('配置数值超出允许范围。'); return n; };
export function loadConfig(overrides: Partial<Config> = {}): Config {
  const root = overrides.root || projectRoot(); dotenv({ path: join(root, '.env'), quiet: true });
  const dataDir=overrides.dataDir||resolve(root,process.env.CAMPUS_DATA_DIR||'data'),localDir=overrides.localDir||resolve(root,process.env.CAMPUS_LOCAL_DIR||'.local');
  let stored:RuntimeSecrets={}; const secretPath = join(dataDir, 'runtime-secrets.json');
  if (existsSync(secretPath)) {
    try { stored=JSON.parse(readFileSync(secretPath,'utf8')) as RuntimeSecrets; }
    catch { throw new Error('运行时密钥文件格式无效，请检查 data/runtime-secrets.json。'); }
  }
  return {
    root,dataDir,localDir,modelStateDir:resolve(root,process.env.CAMPUS_MODEL_STATE_DIR||dataDir), dbPath: resolve(root, process.env.DATABASE_PATH || join(dataDir,'campus.db')),
    host: process.env.API_HOST || '127.0.0.1', port: number(process.env.API_PORT, 3001, 1, 65535),
    origins: (process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:5173,http://localhost:5173').split(',').map(x => x.trim()),
    cookieSecure: process.env.COOKIE_SECURE === '1', rateLimit: number(process.env.QUESTION_RATE_LIMIT, 10, 1, 10000),loginRateLimit:number(process.env.LOGIN_RATE_LIMIT,5,1,1000),
    botToken: process.env.BOT_API_TOKEN || stored.botToken || '',
    modelKey: process.env.DEEPSEEK_API_KEY || '', modelUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', modelTimeout: number(process.env.DEEPSEEK_TIMEOUT_MS, 15000, 100, 15000),
    zhipuKey:process.env.ZHIPU_API_KEY||'',zhipuUrl:process.env.ZHIPU_BASE_URL||'https://open.bigmodel.cn/api/paas/v4',zhipuModel:process.env.ZHIPU_MODEL||'glm-5.3-flash',zhipuVisionModel:process.env.ZHIPU_VISION_MODEL||'glm-4.6v-flash',zhipuAsrModel:process.env.ZHIPU_ASR_MODEL||'glm-asr-2512',
    modelConcurrency: number(process.env.MODEL_CONCURRENCY, 2, 1, 10), modelDailyLimit: number(process.env.MODEL_DAILY_LIMIT, 500, 1, 100000), logger: true,
    developerKey:process.env.CAMPUS_DEVELOPER_KEY||stored.developerKey||'',
    developerUsername:process.env.CAMPUS_DEVELOPER_USERNAME||stored.developerUsername||'developer',developerPassword:process.env.CAMPUS_DEVELOPER_PASSWORD||stored.developerPassword||'',registrationCode:process.env.CAMPUS_REGISTRATION_CODE||stored.registrationCode||'',
    ...overrides,
  };
}
