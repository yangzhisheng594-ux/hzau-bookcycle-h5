import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { bindRouter, PAGE_TITLES } from './services/wx';
import { checkUserLoginState, startStatusWatch } from './store';
import './styles/global.css';

bindRouter(router);

// 等价 app.js onLaunch：恢复登录态 / 静默登录
checkUserLoginState();
// 启动审核结果监听：管理员通过/拒绝后，用户端即时收到通知
startStatusWatch();

router.afterEach(to => {
  document.title = PAGE_TITLES[to.path] || '华农书循环';
  window.scrollTo(0, 0);
});

createApp(App).use(router).mount('#app');
