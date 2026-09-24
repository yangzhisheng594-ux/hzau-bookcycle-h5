<template>
  <view class="scrollarea">
    <view class="log-item" v-for="(log, index) in logs" :key="log.timeStamp">{{ index + 1 }}. {{ log.date }}</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as wx from '../services/wx';

const logs = ref([]);

const formatNumber = n => {
  n = n.toString();
  return n[1] ? n : `0${n}`;
};
const formatTime = date => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`;
};

onMounted(() => {
  logs.value = (wx.getStorageSync('logs') || []).map(log => ({
    date: formatTime(new Date(log)),
    timeStamp: log
  }));
});
</script>

<style scoped>
.scrollarea { display: flex; flex-direction: column; min-height: 100vh; padding-top: calc(20 * var(--rpx)); box-sizing: border-box; }
.log-item { margin-top: calc(20 * var(--rpx)); text-align: center; }
.log-item:last-child { padding-bottom: env(safe-area-inset-bottom); }
</style>
