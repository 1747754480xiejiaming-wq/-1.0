import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('桌面版运行时只能在 Windows x64 的 Node.js 环境中准备。');
}

const destination = resolve('desktop/runtime/node.exe');
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(process.execPath, destination);
console.log('已从当前 Node.js 准备 desktop/runtime/node.exe（该文件不会提交到 Git）。');
