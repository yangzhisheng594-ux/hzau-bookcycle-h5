// 把仓库根目录的 images/ 接入 h5-web/public/images/
//
// 为什么本仓库不重复提交图片：
//   h5-web 用到的 54 张图与仓库根目录已有的 images/ **完全一致（同名同路径）**，
//   重复提交二进制没有意义。克隆后执行一次本脚本即可。
//
// 用法（在 h5-web/ 目录下）：node scripts/link-images.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const src = path.join(repoRoot, 'images');
const dest = path.resolve(here, '..', 'public', 'images');

if (!fs.existsSync(src)) {
  console.error('找不到仓库根目录的 images/，期望位置：' + src);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });

try {
  // Windows 下用 junction，不需要管理员权限；类 Unix 用目录软链
  fs.symlinkSync(src, dest, process.platform === 'win32' ? 'junction' : 'dir');
  console.log('已创建软链：' + dest + '  →  ' + src);
} catch (err) {
  fs.cpSync(src, dest, { recursive: true });
  console.log('软链不可用（' + err.code + '），已改为复制：' + src + '  →  ' + dest);
}
console.log('完成。现在可以 npm install && npm run dev 了。');
