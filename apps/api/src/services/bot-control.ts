import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync,spawn } from 'node:child_process';
import { join } from 'node:path';

export interface BotCredentialsInput { appId: string; appSecret?: string }
export interface BotConfigView { appId: string; appSecretConfigured: boolean; processRunning: boolean }
export interface BotActionResult { ok: true; message: string; processRunning: boolean }
export interface BotController {
  status(): BotConfigView;
  save(input: BotCredentialsInput): BotConfigView;
  start(): Promise<BotActionResult>;
  stop(): BotActionResult;
}

export class BotControlError extends Error {
  constructor(public code: string, message: string, public statusCode = 400) { super(message); }
}

type StoredCredentials = { appId: string; appSecret: string };

export class LocalBotController implements BotController {
  private readonly ownedPids = new Set<number>();
  private readonly dataDirectory: string;
  private readonly localDirectory: string;
  private readonly credentialsPath: string;
  private readonly pidPath: string;
  private readonly logPath: string;
  private readonly runnerPath: string;

  constructor(private readonly root: string, private readonly botToken: string, dataDirectory=join(root,'data'), localDirectory=join(root,'.local')) {
    this.dataDirectory = dataDirectory;
    this.localDirectory = localDirectory;
    this.credentialsPath = join(this.dataDirectory, 'qq-credentials.json');
    this.pidPath = join(this.dataDirectory, 'qq-bot.pid');
    this.logPath = join(this.localDirectory, 'qq-bot.log');
    this.runnerPath = join(root, 'apps', 'qq-bot', 'dist', 'index.js');
  }

  private credentials(required = false): StoredCredentials | null {
    if (!existsSync(this.credentialsPath)) {
      if (required) throw new BotControlError('BOT_CREDENTIALS_REQUIRED', '请先填写并保存 QQ 机器人的 AppID 和 AppSecret。');
      return null;
    }
    try {
      const value = JSON.parse(readFileSync(this.credentialsPath, 'utf8')) as Partial<StoredCredentials>;
      if (!value.appId || !/^\d{5,20}$/.test(value.appId) || typeof value.appSecret !== 'string' || value.appSecret.length < 8 || value.appSecret.length > 200 || /\s/.test(value.appSecret)) throw new Error();
      return { appId: value.appId, appSecret: value.appSecret };
    } catch {
      throw new BotControlError('BOT_CREDENTIALS_INVALID', '已保存的 QQ 机器人凭证格式无效，请重新填写。');
    }
  }

  private pid(): number | null {
    if (!existsSync(this.pidPath)) return null;
    const pid = Number(readFileSync(this.pidPath, 'utf8'));
    if (Number.isInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); if (this.isExpectedProcess(pid)) return pid; } catch { /* stale record */ }
    }
    try { unlinkSync(this.pidPath); } catch { /* already gone */ }
    return null;
  }

  private isExpectedProcess(pid: number): boolean {
    if (this.ownedPids.has(pid)) return true;
    try {
      const commandLine = process.platform === 'win32'
        ? execFileSync('powershell.exe', ['-NoLogo','-NoProfile','-Command', `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new(); (Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`], { encoding: 'utf8', windowsHide: true, timeout: 3000 })
        : readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      return commandLine.replaceAll('\\','/').toLowerCase().includes(this.runnerPath.replaceAll('\\','/').toLowerCase());
    } catch { return false; }
  }

  status(): BotConfigView {
    const credentials = this.credentials(false);
    return { appId: credentials?.appId || '', appSecretConfigured: !!credentials, processRunning: this.pid() !== null };
  }

  save(input: BotCredentialsInput): BotConfigView {
    const appId = input.appId.trim();
    if (!/^\d{5,20}$/.test(appId)) throw new BotControlError('BOT_APP_ID_INVALID', 'AppID 应为 5 至 20 位数字。');
    const current = this.credentials(false);
    if(current&&current.appId!==appId&&!input.appSecret?.trim())throw new BotControlError('BOT_NEW_SECRET_REQUIRED','更换 AppID 时必须同时填写新机器人的 AppSecret。');
    const appSecret = input.appSecret?.trim() || current?.appSecret || '';
    if (appSecret.length < 8 || appSecret.length > 200 || /\s/.test(appSecret)) throw new BotControlError('BOT_APP_SECRET_INVALID', 'AppSecret 应为 8 至 200 个不含空格的字符。');
    if(current&&(current.appId!==appId||current.appSecret!==appSecret))this.stop();
    mkdirSync(this.dataDirectory, { recursive: true });
    writeFileSync(this.credentialsPath, JSON.stringify({ appId, appSecret }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    return this.status();
  }

  async start(): Promise<BotActionResult> {
    this.credentials(true);
    if (!this.botToken) throw new BotControlError('BOT_TOKEN_REQUIRED', '机器人内部服务令牌尚未生成，请先重新初始化系统。');
    if (!existsSync(this.runnerPath)) throw new BotControlError('BOT_BUILD_MISSING', process.env.CAMPUS_DESKTOP==='1'?'机器人组件缺失，请关闭所有桌面窗口后重新打开最新版程序。':'机器人程序尚未构建，请先运行 npm run build。', 503);
    if (this.pid()) return { ok: true, message: '机器人进程已经在运行。', processRunning: true };
    mkdirSync(this.dataDirectory, { recursive: true });
    mkdirSync(this.localDirectory, { recursive: true });
    const log = openSync(this.logPath, 'a');
    try {
      const child = spawn(process.execPath, [this.runnerPath], {
        cwd: this.root,
        env: { ...process.env, CAMPUS_ROOT: this.root, CAMPUS_DATA_DIR: this.dataDirectory, CAMPUS_LOCAL_DIR: this.localDirectory, QQBOT_CREDENTIALS_FILE: this.credentialsPath, BOT_API_TOKEN: this.botToken },
        windowsHide: true,
        stdio: ['ignore', log, log],
      });
      if (!child.pid) throw new Error('missing pid');
      this.ownedPids.add(child.pid);
      writeFileSync(this.pidPath, String(child.pid), { encoding: 'utf8', mode: 0o600 });
      child.once('exit', () => {
        this.ownedPids.delete(child.pid!);
        try { if (existsSync(this.pidPath) && readFileSync(this.pidPath, 'utf8') === String(child.pid)) unlinkSync(this.pidPath); } catch { /* best effort */ }
      });
      child.unref();
      await new Promise(resolve => setTimeout(resolve, 500));
      if (!this.pid()) throw new BotControlError('BOT_START_FAILED', '机器人启动失败，请检查 AppID、AppSecret 和 QQ 开放平台权限。', 503);
      return { ok: true, message: '机器人已启动，正在连接 QQ 开放平台。', processRunning: true };
    } catch (error) {
      if (error instanceof BotControlError) throw error;
      throw new BotControlError('BOT_START_FAILED', '机器人进程未能启动，请检查本机运行环境。', 503);
    } finally { closeSync(log); }
  }

  stop(): BotActionResult {
    const pid = this.pid();
    if (!pid) return { ok: true, message: '机器人当前没有运行。', processRunning: false };
    try { process.kill(pid, 'SIGTERM'); }
    catch { throw new BotControlError('BOT_STOP_FAILED', '机器人进程未能停止，请稍后重试。', 503); }
    try { unlinkSync(this.pidPath); } catch { /* exit handler may have removed it */ }
    return { ok: true, message: '机器人已停止。', processRunning: false };
  }
}
