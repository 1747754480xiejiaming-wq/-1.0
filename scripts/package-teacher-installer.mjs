import { build, Platform, Arch } from 'electron-builder';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packaged = join(root, 'release/desktop/win-unpacked');
if (!existsSync(join(packaged, '校园教务小助手.exe'))) throw new Error('请先构建桌面程序：npm run desktop:dir');
const appRoot = join(packaged, 'resources/app');
for (const name of ['data', '.local', '.env', 'backups', 'qa', 'docs', 'tests', 'qq-credentials.json', 'model-connections.json']) {
  if (existsSync(join(appRoot, name))) throw new Error(`安装内容包含非部署文件：${name}`);
}
const output = join(root, 'qa/teacher-installer-build');
mkdirSync(output, {recursive: true});
const artifactName = '校园教务小助手-教师电脑安装包.exe';
await build({
  projectDir: root,
  prepackaged: packaged,
  targets: Platform.WINDOWS.createTarget('nsis', Arch.x64),
  publish: 'never',
  config: {
    directories: {output},
    nsis: {
      artifactName,
      oneClick: true,
      perMachine: false,
      allowElevation: false,
      createDesktopShortcut: 'always',
      createStartMenuShortcut: true,
      shortcutName: '校园教务小助手',
      runAfterFinish: true,
      deleteAppDataOnUninstall: false,
      differentialPackage: false,
      packElevateHelper: false,
      installerLanguages: ['zh_CN'],
      language: '2052',
    },
  },
});
const destination = join(root, 'release', artifactName);
copyFileSync(join(output, artifactName), destination);
const report = {
  createdAt: new Date().toISOString(), artifact: destination,
  sizeBytes: statSync(destination).size,
  sha256: createHash('sha256').update(readFileSync(destination)).digest('hex'),
  architecture: 'Windows x64', offlineInstaller: true, currentUserInstall: true,
  desktopShortcut: true, startMenuShortcut: true, includesUserData: false,
  includesCredentials: false, includesProjectDocumentation: false,
};
writeFileSync(join(root, 'qa/teacher-installer-package.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
