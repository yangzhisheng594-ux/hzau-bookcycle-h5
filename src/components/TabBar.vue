<template>
  <view class="tabbar">
    <view
      v-for="item in tabs"
      :key="item.path"
      class="tabbar-item"
      :class="{ active: isActive(item.path) }"
      @click="go(item.path)"
    >
      <img class="tabbar-icon" :src="isActive(item.path) ? item.selectedIcon : item.icon" :alt="item.text" />
      <text class="tabbar-text">{{ item.text }}</text>
    </view>
  </view>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router';

// 与 app.json tabBar 配置一致（large 版插画图标）
const tabs = [
  { path: '/pages/index/index', text: '主页', icon: '/images/tabbar/home_illustrated_large_normal.png', selectedIcon: '/images/tabbar/home_illustrated_large_selected.png' },
  { path: '/pages/sell/sell', text: '卖书', icon: '/images/tabbar/sell_illustrated_large_normal.png', selectedIcon: '/images/tabbar/sell_illustrated_large_selected.png' },
  { path: '/pages/request/request', text: '求购', icon: '/images/tabbar/request_illustrated_large_normal.png', selectedIcon: '/images/tabbar/request_illustrated_large_selected.png' },
  { path: '/pages/cart/cart', text: '购物车', icon: '/images/tabbar/cart_illustrated_large_normal.png', selectedIcon: '/images/tabbar/cart_illustrated_large_selected.png' },
  { path: '/pages/profile/profile', text: '我的', icon: '/images/tabbar/profile_illustrated_large_normal.png', selectedIcon: '/images/tabbar/profile_illustrated_large_selected.png' }
];

const route = useRoute();
const router = useRouter();
const isActive = path => route.path === path;
const go = path => { if (route.path !== path) router.push(path); };
</script>

<style scoped>
.tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 200;
  display: flex;
  max-width: var(--app-max-width);
  margin: 0 auto;
  padding-bottom: env(safe-area-inset-bottom);
  border-top: calc(1 * var(--rpx)) solid rgba(0, 0, 0, .08);
  background: #ffffff;
}
.tabbar-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: calc(100 * var(--rpx));
  color: #7d9485;
  cursor: pointer;
}
.tabbar-item.active { color: #166a3f; }
.tabbar-icon {
  width: calc(52 * var(--rpx));
  height: calc(52 * var(--rpx));
  margin-bottom: calc(2 * var(--rpx));
}
.tabbar-text { font-size: calc(20 * var(--rpx)); line-height: 1.2; }
</style>
