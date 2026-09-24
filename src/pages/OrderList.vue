<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">我的订单</text></view>
    <view class="order-list" v-if="orders.length > 0">
      <view class="order-card" v-for="item in orders" :key="item.orderId">
        <view class="order-header"><text class="order-id">订单 {{ item.orderNumber }}</text><text class="order-status" :class="'st-' + item.status">{{ item.statusText }}</text></view>
        <view class="product-item" @click="openBook(item.bookId)">
          <img class="product-cover" v-if="item.coverUrl" :src="item.coverUrl" /><view class="product-cover product-cover-placeholder" v-else>暂无封面</view>
          <view class="product-info"><view class="product-title">{{ item.title }}</view><view class="product-specs">卖家：{{ item.sellerName }} · {{ item.courseCode || '课程教材' }}</view></view><view class="product-price">¥{{ item.displayPrice }}</view>
        </view>
        <view class="order-summary"><text>{{ formatTime(item.createdAt) }}</text><text class="total-amount">¥{{ item.displayPrice }}</text></view>
        <view class="handover-note" v-if="item.status === 'locked'"><text class="handover-mark">锁</text><text>教材已为你锁定（未扣款），请尽快与卖家 {{ item.sellerName }} 约定校内面交</text></view>
        <view class="handover-note received" v-if="item.status === 'trading'"><text class="handover-mark">验</text><text>卖家已确认交易，面交验书无误后请点击「确认完成」</text></view>
        <view class="handover-note closed" v-if="item.status === 'timeout'"><text class="handover-mark">时</text><text>订单超时已自动关闭，商品已恢复可购买</text></view>
        <view class="handover-note closed" v-if="item.status === 'cancelled'"><text class="handover-mark">消</text><text>订单已取消（{{ item.cancelReason || '主动取消' }}），商品已恢复可购买</text></view>
        <view class="order-actions">
          <button class="btn-cancel" v-if="item.status === 'locked'" @click="cancelOrder(item.orderId)">取消订单</button>
          <button v-if="item.status === 'trading'" @click="completeOrder(item.orderId)">确认完成</button>
          <button class="btn-cancel" v-if="item.status === 'locked'" @click="completeOrder(item.orderId)">已面交，直接完成</button>
        </view>
      </view>
    </view>
    <view class="empty-orders" v-else-if="!isLoading && !loadFailed"><view class="empty-icon">订单</view><text class="empty-text">暂无相关订单</text><button class="empty-btn" @click="goToHome">去逛逛</button></view>
    <view class="loading-state" v-if="isLoading">正在加载订单…</view><view class="loading-state retry" v-if="loadFailed" @click="retryLoad">加载失败，点击重试</view><view class="loading-state more" v-if="hasMore && !isLoading" @click="loadMore">加载更多</view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';

const route = useRoute();
const currentStatus = ref('all');
const orders = ref([]);
const page = ref(1);
const pageSize = 20;
const hasMore = ref(false);
const isLoading = ref(false);
const loadFailed = ref(false);

onMounted(() => {
  const status = route.query.status || 'all';
  currentStatus.value = status;
  wx.setNavigationBarTitle({ title: getNavTitleByStatus(status) });
  loadOrders(true);
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onUnmounted(() => window.removeEventListener('scroll', onReachBottom));

function getNavTitleByStatus(status) {
  switch (status) {
    case 'locked': return '待面交订单';
    case 'trading': return '交易中订单';
    case 'completed': return '已完成订单';
    default: return '我的订单';
  }
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function loadOrders(reset = false) {
  if (isLoading.value || (!reset && !hasMore.value)) return;
  const pageToLoad = reset ? 1 : page.value + 1;
  isLoading.value = true;
  loadFailed.value = false;
  try {
    const res = await wx.cloud.callFunction({
      name: 'getOrders',
      data: { status: currentStatus.value, page: pageToLoad, pageSize }
    });
    if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '加载订单失败');
    orders.value = reset ? (res.result.data || []) : orders.value.concat(res.result.data || []);
    page.value = pageToLoad;
    hasMore.value = Boolean(res.result.pagination && res.result.pagination.hasMore);
  } catch (error) {
    console.error('[OrderList] loadOrders failed:', error);
    if (reset) orders.value = [];
    loadFailed.value = true;
    wx.showToast({ title: (error && error.message) || '加载订单失败', icon: 'none' });
  } finally {
    isLoading.value = false;
  }
}

function openBook(bookId) {
  if (bookId) wx.navigateTo({ url: '/pages/bookDetail/bookDetail?id=' + bookId });
}

function cancelOrder(orderId) {
  wx.showModal({
    title: '取消订单',
    content: '取消后这本书会恢复可购买状态，其他同学可以购买。确定取消吗？',
    confirmText: '确定取消',
    cancelText: '再想想',
    success: async result => {
      if (!result.confirm) return;
      wx.showLoading({ title: '处理中…' });
      try {
        const res = await wx.cloud.callFunction({ name: 'orderCancel', data: { orderId, reason: '买家取消' } });
        if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '取消失败');
        wx.showToast({ title: '订单已取消', icon: 'success' });
        loadOrders(true);
      } catch (error) {
        wx.showToast({ title: (error && error.message) || '取消失败，请重试', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    }
  });
}

function completeOrder(orderId) {
  wx.showModal({
    title: '确认完成交易',
    content: '确认已与卖家完成校内面交，并验收书籍无误吗？',
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

function goToHome() { wx.switchTab({ url: '/pages/index/index' }); }
function goBack() { wx.navigateBack(); }
function retryLoad() { loadOrders(true); }
function loadMore() { loadOrders(false); }
function onReachBottom() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  if (nearBottom) loadOrders(false);
}
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.order-card { margin-bottom: calc(18 * var(--rpx)); padding: 0 calc(21 * var(--rpx)) calc(21 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.order-header { display: flex; align-items: center; justify-content: space-between; height: calc(78 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.order-id { color: #83998d; font-size: calc(21 * var(--rpx)); }
.order-status { padding: calc(5 * var(--rpx)) calc(10 * var(--rpx)); border-radius: calc(6 * var(--rpx)); font-size: calc(21 * var(--rpx)); font-weight: 650; }
.order-status.st-locked { background: #fdf6e3; color: #c98f1b; }
.order-status.st-trading { background: #eef7f3; color: #43836d; }
.order-status.st-completed { background: #f3f5f1; color: #7b8797; }
.order-status.st-cancelled, .order-status.st-timeout { background: #f4f4f2; color: #a3a39e; }
.product-item { display: flex; align-items: center; padding: calc(19 * var(--rpx)) 0; cursor: pointer; }
.product-cover { width: calc(112 * var(--rpx)); height: calc(142 * var(--rpx)); margin-right: calc(16 * var(--rpx)); border-radius: calc(10 * var(--rpx)); background: #eff3ef; object-fit: cover; flex: none; }
.product-cover-placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: calc(20 * var(--rpx)); }
.product-info { flex: 1; min-width: 0; }
.product-title { overflow: hidden; color: #294438; font-size: calc(27 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.product-specs { margin-top: calc(10 * var(--rpx)); color: #8994a4; font-size: calc(21 * var(--rpx)); }
.product-price { color: #c98f1b; font-size: calc(27 * var(--rpx)); font-weight: 750; }
.order-summary { display: flex; align-items: center; justify-content: space-between; padding-top: calc(17 * var(--rpx)); border-top: calc(1 * var(--rpx)) solid #f0eeea; color: #809287; font-size: calc(22 * var(--rpx)); }
.total-amount { color: #c98f1b; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.handover-note { display: flex; align-items: center; margin-top: calc(15 * var(--rpx)); padding: calc(11 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #fff8ee; color: #a5783f; font-size: calc(20 * var(--rpx)); line-height: 1.45; }
.handover-note.received { background: #edf7ef; color: #4d806b; }
.handover-note.closed { background: #f4f4f2; color: #8a8a86; }
.handover-mark { display: flex; align-items: center; justify-content: center; width: calc(30 * var(--rpx)); height: calc(30 * var(--rpx)); margin-right: calc(8 * var(--rpx)); border-radius: 50%; background: rgba(255,255,255,.85); font-size: calc(18 * var(--rpx)); font-weight: 750; flex: none; }
.order-actions { display: flex; justify-content: flex-end; gap: calc(14 * var(--rpx)); margin-top: calc(17 * var(--rpx)); }
.order-actions button { display: flex; align-items: center; justify-content: center; min-width: calc(164 * var(--rpx)); height: calc(58 * var(--rpx)); margin: 0; padding: 0 calc(16 * var(--rpx)); border: 0; border-radius: calc(14 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(23 * var(--rpx)); line-height: calc(58 * var(--rpx)); cursor: pointer; }
.order-actions .btn-cancel { border: calc(1 * var(--rpx)) solid #dfe9e1; background: #fff; color: #687d71; }
.empty-orders { display: flex; flex-direction: column; align-items: center; padding-top: calc(160 * var(--rpx)); }
.empty-icon { display: flex; align-items: center; justify-content: center; width: calc(110 * var(--rpx)); height: calc(110 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); border-radius: 50%; background: #eceff2; color: #789080; font-size: calc(22 * var(--rpx)); }
.empty-text { color: #8c97a7; font-size: calc(27 * var(--rpx)); }
.empty-btn { display: flex; align-items: center; justify-content: center; width: calc(190 * var(--rpx)); height: calc(70 * var(--rpx)); margin-top: calc(24 * var(--rpx)); border: 0; border-radius: calc(16 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(25 * var(--rpx)); }
.loading-state { padding: calc(34 * var(--rpx)); color: #9daaa1; font-size: calc(25 * var(--rpx)); text-align: center; }
.retry, .more { color: #b07f16; cursor: pointer; }
</style>
