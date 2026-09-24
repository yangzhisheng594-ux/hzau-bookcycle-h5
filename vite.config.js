import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        // view / text 按小程序标签语义作为原生自定义元素渲染
        isCustomElement: tag => ['view', 'text'].includes(tag)
      }
    }
  })],
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    emptyOutDir: false // 沙箱安全组件会拦截构建期批量删除；产物均为 hash 命名，覆盖写无残留问题
  },
  server: {
    port: 8300
  }
});
