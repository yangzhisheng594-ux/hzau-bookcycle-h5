<template>
  <router-view v-slot="{ Component }">
    <transition name="page-fade">
      <keep-alive :include="TAB_PAGES">
        <component :is="Component" :key="$route.fullPath" />
      </keep-alive>
    </transition>
  </router-view>
  <TabBar v-if="$route.meta.tab" />
</template>

<script setup>
import TabBar from './components/TabBar.vue';

// 5 个 tab 页保持常驻（等价小程序 tab 页面不销毁，onShow 时走刷新逻辑）
const TAB_PAGES = ['IndexPage', 'SellPage', 'RequestPage', 'CartPage', 'ProfilePage'];
</script>
