<template>
  <view class="container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">确认订单</text></view>
    <view class="section product-info-section">
      <view class="section-heading"><view class="section-title">本次购买</view><text class="section-tip">校内面交</text></view>
      <view class="order-item" v-for="item in orderItems" :key="item.cartItemId || item.id">
        <img class="item-cover" :src="item.coverUrl || ''" v-if="item.coverUrl" />
        <view class="item-cover placeholder-block" v-else></view>
        <view class="item-details"><view class="item-title">{{ item.title }}</view><view class="item-code">{{ item.courseCode || item.spec || '课程教材' }}</view><view class="item-quantity" v-if="item.quantity && item.quantity > 1">数量 × {{ item.quantity }}</view></view>
        <view class="item-price" v-if="item.displayPrice !== undefined">¥{{ item.displayPrice }}</view><view class="item-price" v-else>¥0.00</view>
      </view>
    </view>
    <view class="trade-note"><view class="trade-note-title">确认购买 ≠ 立即支付</view><text>确认购买后系统会为你锁定教材（其他同学暂时无法购买），不会扣款。请与卖家约定校内面交，当面验书无误后再确认完成交易。订单取消或超时，商品自动恢复可购买。</text></view>
    <view class="bottom-checkout-bar">
      <view class="total-amount-display"><text>合计</text><text class="amount-value">¥{{ totalOrderPrice }}</text></view>
      <button class="pay-button" @click="handlePayment" :disabled="isPaying || isLoading || errorLoading">{{ isPaying ? '锁定中…' : '确认购买' }}</button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { globalData, requireApproved } from '../store';

const route = useRoute();
const orderItems = ref([]);
const totalOrderPrice = ref('0.00');
const source = ref('');
const isLoading = ref(true);
const errorLoading = ref(false);
const isPaying = ref(false);

let checkoutFallbackTimer = null;
let receivedData = false;

onMounted(() => {
  source.value = route.query.from || 'cart';
  isLoading.value = true;
  errorLoading.value = false;

  // 等价 EventChannel：购物车 / 立即购买 传入结算数据
  const eventChannel = wx.getEventChannel('/pages/checkout/checkout');
  if (eventChannel) {
    eventChannel.on('acceptDataFromCartPage', event => {
      const itemsFromEvent = event.data;
      if (itemsFromEvent && Array.isArray(itemsFromEvent) && itemsFromEvent.length > 0) {
        receivedData = true;
        processCheckoutItems(itemsFromEvent);
      } else {
        handleLoadingError('未能获取到有效的结算商品信息');
      }
    });
  }

  // 兼容入口：本地暂存的结算商品（等价原 checkoutItems 本地缓存兜底）
  checkoutFallbackTimer = setTimeout(() => {
    if (receivedData || !isLoading.value) return;
    const storedItems = wx.getStorageSync('checkoutItems');
    if (Array.isArray(storedItems) && storedItems.length) {
      wx.removeStorageSync('checkoutItems');
      processCheckoutItems(storedItems);
    } else {
      handleLoadingError('无法获取结算信息，请返回重试');
    }
  }, 500);
});

onUnmounted(() => {
  if (checkoutFallbackTimer) clearTimeout(checkoutFallbackTimer);
});

function processCheckoutItems(items) {
  let calculatedTotalPrice = 0;
  const processedOrderItems = items.map(item => {
    const numericPrice = parseFloat(item.price);
    const quantity = parseInt(item.quantity) || 1;
    let itemSubTotal = 0;
    const isValidItem = !isNaN(numericPrice) && !isNaN(quantity) && quantity > 0;
    if (isValidItem) {
      itemSubTotal = numericPrice * quantity;
      calculatedTotalPrice += itemSubTotal;
    }
    return {
      ...item,
      id: item.id || item.bookId,
      price: isValidItem ? numericPrice : 0,
      quantity,
      displayPrice: item.displayPrice || (isValidItem ? numericPrice.toFixed(2) : '0.00'),
      cartItemId: item.cartItemId || null
    };
  });
  orderItems.value = processedOrderItems;
  totalOrderPrice.value = calculatedTotalPrice.toFixed(2);
  isLoading.value = false;
  errorLoading.value = false;
}

function handleLoadingError(message) {
  isLoading.value = false;
  errorLoading.value = true;
  wx.showToast({ title: message || '加载结算信息失败', icon: 'none', duration: 2000 });
  setTimeout(() => { wx.navigateBack(); }, 2000);
}

async function handlePayment() {
  if (!orderItems.value || orderItems.value.length === 0 || isLoading.value || errorLoading.value) {
    const title = isLoading.value ? '页面加载中...' : (errorLoading.value ? '页面加载错误' : '没有商品可以购买');
    wx.showToast({ title, icon: 'none' });
    return;
  }
  if (!(await requireApproved('确认购买'))) return;

  wx.showModal({
    title: '确认购买这些书吗？',
    content: `合计 ¥${totalOrderPrice.value}。确认购买不会扣款，系统会为你锁定这些教材，请与卖家约定面交完成线下交付。`,
    confirmText: '确认购买',
    cancelText: '再想想',
    success: async res => {
      if (!res.confirm) return;
      wx.showLoading({ title: '正在锁定…', mask: true });
      isPaying.value = true;
      try {
        const orderRes = await wx.cloud.callFunction({
          name: 'confirmPurchase',
          data: {
            source: source.value === 'cart' ? 'cart' : 'buy_now',
            items: orderItems.value.map(item => ({
              bookId: item.id,
              quantity: item.quantity,
              cartItemId: item.cartItemId || null
            }))
          }
        });
        if (!orderRes.result || !orderRes.result.success) {
          throw new Error((orderRes.result && orderRes.result.message) || '锁定失败，请重试');
        }
        globalData.cartNeedRefresh = true;
        globalData.orderListNeedRefresh = true;
        const failedItems = (orderRes.result.data && orderRes.result.data.failed) || [];
        if (failedItems.length) {
          const names = failedItems.map(f => `《${f.title}》`).join('、');
          wx.showModal({
            title: '部分教材被抢先锁定',
            content: `${names} 刚被其他同学锁定；其余教材已为你锁定，可在订单页查看。`,
            confirmText: '查看订单',
            cancelText: '返回',
            success: r => {
              if (r.confirm) wx.navigateTo({ url: '/pages/orderList/orderList' });
              else wx.navigateBack();
            }
          });
        } else {
          wx.showModal({
            title: '已为你锁定',
            content: '教材已锁定，不会扣款。请与卖家约定校内面交，当面验书后确认完成交易。',
            confirmText: '查看订单',
            cancelText: '继续逛逛',
            success: r => {
              if (r.confirm) wx.navigateTo({ url: '/pages/orderList/orderList' });
              else wx.switchTab({ url: '/pages/index/index' });
            }
          });
        }
      } catch (err) {
        console.error('[CheckoutPage] confirm purchase error:', err);
        wx.showModal({
          title: '未能锁定',
          content: (err && err.message) || '订单处理异常，请稍后重试',
          showCancel: false,
          confirmText: '我知道了'
        });
      } finally {
        isPaying.value = false;
        wx.hideLoading();
      }
    }
  });
}

function goBack() { wx.navigateBack(); }
</script>

<style scoped>
.container { padding: 0 calc(24 * var(--rpx)) calc(calc(130 * var(--rpx)) + env(safe-area-inset-bottom)); }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.section, .trade-note { padding: calc(24 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(20 * var(--rpx)) rgba(22, 106, 63,.03); }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: calc(17 * var(--rpx)); }
.section-title { position: relative; padding-left: calc(15 * var(--rpx)); color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.section-title::before { position: absolute; top: calc(6 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(27 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.section-tip { padding: calc(5 * var(--rpx)) calc(10 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #edf6ef; color: #5a856f; font-size: calc(20 * var(--rpx)); }
.order-item { display: flex; align-items: center; padding: calc(18 * var(--rpx)) 0 calc(4 * var(--rpx)); border-top: calc(1 * var(--rpx)) solid #f0eeea; }
.order-item:first-of-type { border-top: 0; }
.item-cover { width: calc(116 * var(--rpx)); height: calc(150 * var(--rpx)); margin-right: calc(17 * var(--rpx)); border-radius: calc(11 * var(--rpx)); background: #eff3ef; flex-shrink: 0; object-fit: cover; }
.placeholder-block { background: #eff3ef; }
.item-details { display: flex; flex: 1; flex-direction: column; min-width: 0; align-self: stretch; padding: calc(4 * var(--rpx)) 0; }
.item-title { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(28 * var(--rpx)); font-weight: 650; line-height: 1.42; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.item-code { align-self: flex-start; margin-top: calc(10 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(9 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #f3f5f1; color: #8f9f94; font-size: calc(20 * var(--rpx)); }
.item-quantity { margin-top: auto; color: #809287; font-size: calc(21 * var(--rpx)); }
.item-price { align-self: flex-start; margin-left: calc(12 * var(--rpx)); color: #c98f1b; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.trade-note { margin-top: calc(18 * var(--rpx)); background: #f0f6fa; border-color: #e0ebf1; box-shadow: none; color: #63758b; font-size: calc(23 * var(--rpx)); line-height: 1.65; }
.trade-note-title { margin-bottom: calc(7 * var(--rpx)); color: #3d725d; font-size: calc(25 * var(--rpx)); font-weight: 700; }
.bottom-checkout-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 100; display: flex; align-items: center; justify-content: space-between; max-width: var(--app-max-width); margin: 0 auto; height: calc(108 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); padding-bottom: env(safe-area-inset-bottom); border-top: calc(1 * var(--rpx)) solid #e8e5df; background: rgba(255,255,255,.98); box-shadow: 0 calc(-7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.04); box-sizing: content-box; }
.total-amount-display { display: flex; align-items: baseline; color: #6c7787; font-size: calc(24 * var(--rpx)); }
.amount-value { margin-left: calc(12 * var(--rpx)); color: #c98f1b; font-size: calc(36 * var(--rpx)); font-weight: 750; }
.pay-button { display: flex; align-items: center; justify-content: center; width: calc(212 * var(--rpx)); height: calc(74 * var(--rpx)); margin: 0; border-radius: calc(16 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(27 * var(--rpx)); font-weight: 700; line-height: calc(74 * var(--rpx)); box-shadow: 0 calc(7 * var(--rpx)) calc(14 * var(--rpx)) rgba(22, 106, 63,.16); }
.pay-button[disabled] { background: #d9dde2; box-shadow: none; }
</style>
