<template>
  <view class="page-wrap">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">售出订单</text></view>
    <view class="order-list" v-if="orders.length">
      <view class="order-card" v-for="item in orders" :key="item.orderId">
        <view class="order-header"><text>订单 {{ item.orderNumber }}</text><text class="status" :class="'st-' + item.status">{{ item.statusText }}</text></view>
        <view class="book-row">
          <img class="cover" v-if="item.coverUrl" :src="item.coverUrl" /><view class="cover cover-placeholder" v-else>暂无封面</view>
          <view class="book-info"><view class="title">{{ item.title }}</view><view class="meta">{{ item.courseCode || '课程教材' }}</view><view class="meta">买家：{{ item.buyerName }}</view><view class="price">¥{{ item.displayPrice }}</view></view>
        </view>
        <view class="seller-note" v-if="item.status === 'locked'">买家已确认购买并锁定，请尽快与买家 {{ item.buyerName }} 约定面交</view>
        <view class="actions">
          <button v-if="item.status === 'locked'" @click="toTrading(item.orderId)">确认交易</button>
          <button class="btn-plain" v-if="item.status === 'locked'" @click="cancelOrder(item.orderId)">取消订单</button>
          <button v-if="item.status === 'trading'" @click="completeOrder(item.orderId)">确认完成</button>
        </view>
      </view>
    </view>
    <view class="empty" v-else-if="!isLoading && !loadFailed">暂无售出订单</view>
    <view class="state" v-if="isLoading">正在加载…</view>
    <view class="state retry" v-if="loadFailed" @click="retryLoad">加载失败，点击重试</view>
    <view class="state more" v-if="hasMore && !isLoading" @click="loadMore">加载更多</view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import * as wx from '../services/wx';

const orders = ref([]);
const page = ref(1);
const pageSize = 20;
const hasMore = ref(false);
const isLoading = ref(false);
const loadFailed = ref(false);

onMounted(() => {
  loadOrders(true);
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onUnmounted(() => window.removeEventListener('scroll', onReachBottom));

async function loadOrders(reset = false) {
  if (isLoading.value || (!reset && !hasMore.value)) return;
  const pageToLoad = reset ? 1 : page.value + 1;
  isLoading.value = true;
  loadFailed.value = false;
  try {
    const res = await wx.cloud.callFunction({ name: 'getSellerOrders', data: { page: pageToLoad, pageSize } });
    if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '加载失败');
    orders.value = reset ? (res.result.data || []) : orders.value.concat(res.result.data || []);
    page.value = pageToLoad;
    hasMore.value = Boolean(res.result.pagination && res.result.pagination.hasMore);
  } catch (error) {
    console.error('[SoldOrders] loadOrders failed:', error);
    loadFailed.value = true;
    wx.showToast({ title: (error && error.message) || '加载售出订单失败', icon: 'none' });
  } finally {
    isLoading.value = false;
  }
}

function toTrading(orderId) {
  wx.showModal({
    title: '确认交易',
    content: '确认接受这笔订单，与买家进入交易流程吗？',
    confirmText: '确认交易',
    success: async result => {
      if (!result.confirm) return;
      wx.showLoading({ title: '处理中…' });
      try {
        const res = await wx.cloud.callFunction({ name: 'orderTrading', data: { orderId } });
        if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '操作失败');
        wx.showToast({ title: '已进入交易', icon: 'success' });
        loadOrders(true);
      } catch (error) {
        wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
  });
}

function completeOrder(orderId) {
  wx.showModal({
    title: '确认完成交易',
    content: '确认已与买家完成校内面交并交付书籍吗？',
    confirmText: '确认完成',
    success: async result => {
      if (!result.confirm) return;
      wx.showLoading({ title: '处理中…' });
      try {
        const res = await wx.cloud.callFunction({ name: 'orderComplete', data: { orderId } });
        if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '操作失败');
        wx.showToast({ title: '交易完成', icon: 'success' });
        loadOrders(true);
      } catch (error) {
        wx.showToast({ title: (error && error.message) || '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
  });
}

function cancelOrder(orderId) {
  wx.showModal({
    title: '取消订单',
    content: '取消后这本书会恢复可购买状态。确定无法交易吗？',
    confirmText: '确定取消',
    cancelText: '再想想',
    success: async result => {
      if (!result.confirm) return;
      wx.showLoading({ title: '处理中…' });
      try {
        const res = await wx.cloud.callFunction({ name: 'orderCancel', data: { orderId, reason: '卖家取消' } });
        if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '取消失败');
        wx.showToast({ title: '订单已取消', icon: 'success' });
        loadOrders(true);
      } catch (error) {
        wx.showToast({ title: (error && error.message) || '取消失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
  });
}

function retryLoad() { loadOrders(true); }
function goBack() { wx.navigateBack(); }
function loadMore() { loadOrders(false); }
function onReachBottom() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  if (nearBottom) loadOrders(false);
}
</script>

<style scoped>
.page-wrap { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(104 * var(--rpx)); }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(26 * var(--rpx)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.order-card { margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(21 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.order-header { display: flex; justify-content: space-between; height: calc(76 * var(--rpx)); align-items: center; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; color: #8893a2; font-size: calc(21 * var(--rpx)); }
.status { padding: calc(5 * var(--rpx)) calc(10 * var(--rpx)); border-radius: calc(6 * var(--rpx)); font-weight: 650; }
.st-locked { background: #fdf6e3; color: #c98f1b; }
.st-trading { background: #edf6ef; color: #4d806b; }
.st-completed { background: #f3f5f1; color: #7b8797; }
.st-cancelled, .st-timeout { background: #f4f4f2; color: #a3a39e; }
.seller-note { padding: calc(11 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #fff8ee; color: #a5783f; font-size: calc(20 * var(--rpx)); line-height: 1.45; }
.book-row { display: flex; padding: calc(18 * var(--rpx)) 0 calc(6 * var(--rpx)); }
.cover { width: calc(116 * var(--rpx)); height: calc(150 * var(--rpx)); border-radius: calc(10 * var(--rpx)); background: #eff3ef; flex: none; object-fit: cover; }
.cover-placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: calc(20 * var(--rpx)); }
.book-info { display: flex; flex: 1; flex-direction: column; min-width: 0; padding: calc(3 * var(--rpx)) 0 calc(2 * var(--rpx)) calc(17 * var(--rpx)); }
.title { color: #294438; font-size: calc(27 * var(--rpx)); font-weight: 650; line-height: 1.42; }
.meta { margin-top: calc(8 * var(--rpx)); color: #83998d; font-size: calc(21 * var(--rpx)); }
.price { margin-top: auto; color: #c98f1b; font-size: calc(28 * var(--rpx)); font-weight: 750; }
.actions { display: flex; justify-content: flex-end; gap: calc(14 * var(--rpx)); padding-top: calc(12 * var(--rpx)); }
.actions button { display: flex; align-items: center; justify-content: center; min-width: calc(138 * var(--rpx)); height: calc(58 * var(--rpx)); margin: 0; border: 0; border-radius: calc(14 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(23 * var(--rpx)); line-height: calc(58 * var(--rpx)); cursor: pointer; }
.actions .btn-plain { border: calc(1 * var(--rpx)) solid #dfe9e1; background: #fff; color: #687d71; }
.empty, .state { padding: calc(100 * var(--rpx)) 0; color: #9daaa1; font-size: calc(26 * var(--rpx)); text-align: center; }
.retry, .more { padding: calc(26 * var(--rpx)) 0; color: #b07f16; cursor: pointer; }
</style>
