<template>
  <view class="container">
    <!-- 顶部栏 -->
    <view class="header">
      <text class="title">购物车</text>
      <view class="header-right">
        <view class="manage-container">
          <text class="manage-btn" @click="toggleManageMode">{{ isManageMode ? '完成' : '管理' }}</text>
        </view>
      </view>
    </view>

    <!-- 中间内容区域 -->
    <view class="content-section">
      <view class="cart-caption" v-if="books.length > 0">已为你保留 {{ books.length }} 本好书</view>
      <view v-if="books.length > 0">
        <view class="product-item" v-for="(book, index) in books" :key="book.cartItemId">
          <view class="wx-checkbox product-checkbox" :class="{ checked: book.selected }" @click="toggleSelect(index)"></view>
          <img class="product-cover" :src="book.coverUrl || ''" />
          <view class="product-info">
            <view class="product-title">{{ book.title }}</view>
            <view class="product-spec">{{ book.spec }}</view>
            <view class="product-price" v-if="book.displayPrice !== undefined">¥{{ book.displayPrice }}</view>
            <view class="product-price" v-else>¥0.00</view>
          </view>
        </view>
      </view>
      <view v-else class="empty-cart">
        <text>购物车还是空的哦，快去逛逛吧～</text>
      </view>
    </view>

    <!-- 底部栏 -->
    <view class="footer">
      <view class="checkbox-label" @click="books.length > 0 && toggleSelectAll()">
        <view class="wx-checkbox checkbox" :class="{ checked: isAllSelected, disabled: books.length === 0 }"></view>
        <text>全选</text>
      </view>
      <view class="total" v-if="!isManageMode">
        <text>合计：</text>
        <text class="price">¥{{ totalPrice }}</text>
      </view>
      <view class="total-selected" v-else>
        <text>已选{{ selectedCount }}件</text>
      </view>
      <button
        class="checkout-btn"
        :class="{ 'delete-mode': isManageMode }"
        @click="isManageMode ? deleteSelected() : checkout()"
        :disabled="selectedCount === 0"
      >
        {{ isManageMode ? '删除' : '结算' }}({{ selectedCount }})
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onActivated, onUnmounted } from 'vue';
import * as wx from '../services/wx';
import { globalData, registerLoginCallback, unregisterLoginCallback } from '../store';

defineOptions({ name: 'CartPage' });
const PAGE_NAME = 'cartPage';

const books = ref([]);
const isAllSelected = ref(false);
const totalPrice = ref('0.00');
const selectedCount = ref(0);
const isManageMode = ref(false);
const isLoading = ref(false);
const isLoggedIn = ref(false);

onMounted(() => {
  registerLoginCallback(PAGE_NAME, handleLoginStateChange);
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  if (globalData.isUserLoggedIn) {
    loadCartItems();
  } else {
    resetCartView();
  }
});

onActivated(() => {
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  if (isLoggedIn.value) {
    if (globalData.cartNeedRefresh || (books.value.length === 0 && !isLoading.value)) {
      loadCartItems();
      globalData.cartNeedRefresh = false;
    } else if (books.value.length > 0) {
      updateSelectionAndPrice();
    }
  } else {
    resetCartView();
  }
});

onUnmounted(() => unregisterLoginCallback(PAGE_NAME));

function resetCartView() {
  books.value = [];
  isAllSelected.value = false;
  totalPrice.value = '0.00';
  selectedCount.value = 0;
}

function handleLoginStateChange(loggedIn) {
  const previousIsLoggedIn = isLoggedIn.value;
  isLoggedIn.value = Boolean(loggedIn);
  if (loggedIn) {
    if ((!previousIsLoggedIn || books.value.length === 0) && !isLoading.value) loadCartItems();
  } else {
    resetCartView();
  }
}

// 加载购物车数据
async function loadCartItems() {
  if (!isLoggedIn.value) {
    resetCartView();
    isLoading.value = false;
    return;
  }
  if (isLoading.value) return;
  isLoading.value = true;
  wx.showLoading({ title: '加载中...' });

  try {
    const res = await wx.cloud.callFunction({ name: 'getCartItems' });
    wx.hideLoading();
    isLoading.value = false;
    if (res.result && res.result.success && Array.isArray(res.result.data)) {
      const rawBooks = res.result.data;
      books.value = rawBooks.map(item => {
        const numericPrice = parseFloat(item.price);
        const quantity = parseInt(item.quantity) || 1;
        const isValidPrice = !isNaN(numericPrice);
        const previousSelectedState = (books.value.find(b => b.cartItemId === item.cartItemId) || {}).selected || false;
        return {
          ...item,
          price: isValidPrice ? numericPrice : 0,
          displayPrice: isValidPrice ? numericPrice.toFixed(2) : '0.00',
          quantity,
          selected: previousSelectedState
        };
      });
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
      books.value = [];
    }
  } catch (err) {
    wx.hideLoading();
    isLoading.value = false;
    books.value = [];
    console.error(`[${PAGE_NAME}] Error calling getCartItems:`, err);
    wx.showToast({ title: '网络请求失败', icon: 'none' });
  }
  updateSelectionAndPrice();
}

// 切换管理/完成模式
function toggleManageMode() {
  isManageMode.value = !isManageMode.value;
  updateSelectionAndPrice();
}

// 切换单个商品选中状态
function toggleSelect(index) {
  const list = books.value;
  if (list[index]) {
    list[index].selected = !list[index].selected;
    updateSelectionAndPrice();
  }
}

// 切换全选/取消全选状态
function toggleSelectAll() {
  const newSelectState = !isAllSelected.value;
  books.value.forEach(book => { book.selected = newSelectState; });
  updateSelectionAndPrice();
}

// 更新选中状态、总价格和选中数量
function updateSelectionAndPrice() {
  const list = books.value;
  let total = 0;
  let count = 0;
  let allSelected = list.length > 0;
  list.forEach(book => {
    if (book.selected) {
      const price = typeof book.price === 'number' ? book.price : parseFloat(book.price);
      const quantity = typeof book.quantity === 'number' ? book.quantity : parseInt(book.quantity) || 1;
      if (!isNaN(price) && !isNaN(quantity)) total += price * quantity;
      count++;
    } else {
      allSelected = false;
    }
  });
  totalPrice.value = total.toFixed(2);
  selectedCount.value = count;
  isAllSelected.value = allSelected;
}

// 结算
function checkout() {
  if (selectedCount.value === 0) {
    wx.showToast({ title: '请选择要结算的商品', icon: 'none' });
    return;
  }
  const itemsToCheckout = books.value.filter(book => book.selected);
  wx.emitCheckoutData(itemsToCheckout);
  wx.navigateTo({ url: '/pages/checkout/checkout' });
}

// 删除选中的商品
function deleteSelected() {
  if (selectedCount.value === 0) {
    wx.showToast({ title: '请选择要删除的商品', icon: 'none' });
    return;
  }
  wx.showModal({
    title: '确认删除',
    content: `确定要删除选中的 ${selectedCount.value} 件商品吗？`,
    success: async res => {
      if (!res.confirm) return;
      const cartItemIdsToDelete = books.value.filter(book => book.selected).map(book => book.cartItemId);
      if (cartItemIdsToDelete.length > 0) {
        wx.showLoading({ title: '删除中...' });
        try {
          const deleteRes = await wx.cloud.callFunction({ name: 'deleteCartItems', data: { cartItemIds: cartItemIdsToDelete } });
          wx.hideLoading();
          if (deleteRes.result && deleteRes.result.success) {
            wx.showToast({ title: '删除成功', icon: 'success' });
            books.value = books.value.filter(book => !cartItemIdsToDelete.includes(book.cartItemId));
            updateSelectionAndPrice();
          } else {
            wx.showToast({ title: (deleteRes.result && deleteRes.result.message) || '删除失败', icon: 'none' });
          }
        } catch (err) {
          wx.hideLoading();
          console.error(`[${PAGE_NAME}] Error calling deleteCartItems:`, err);
          wx.showToast({ title: '删除请求失败', icon: 'none' });
        }
      }
    }
  });
}
</script>

<style scoped>
.container { position: relative; display: flex; flex-direction: column; height: calc(100vh - var(--tabbar-h)); }
.header { position: absolute; top: 0; right: 0; left: 0; z-index: 2; display: flex; align-items: center; justify-content: center; height: calc(204 * var(--rpx)); padding: calc(100 * var(--rpx)) calc(24 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #ebe8e2; background: rgba(246,245,242,.98); box-sizing: border-box; }
.title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.header-right { position: absolute; left: calc(24 * var(--rpx)); display: flex; align-items: center; }
.manage-btn { display: flex; align-items: center; justify-content: center; min-width: calc(82 * var(--rpx)); height: calc(52 * var(--rpx)); padding: 0 calc(14 * var(--rpx)); border: calc(1 * var(--rpx)) solid #d8e7db; border-radius: calc(26 * var(--rpx)); background: #f7fbf6; color: #477963; font-size: calc(22 * var(--rpx)); font-weight: 650; line-height: calc(52 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.content-section { position: absolute; top: calc(204 * var(--rpx)); right: 0; bottom: calc(116 * var(--rpx)); left: 0; overflow-y: auto; padding: 0 calc(24 * var(--rpx)) calc(20 * var(--rpx)); background: #f6f5f2; box-sizing: border-box; }
.cart-caption { padding: calc(18 * var(--rpx)) 0 calc(12 * var(--rpx)); color: #8c9e92; font-size: calc(23 * var(--rpx)); }
.product-item { display: flex; align-items: center; margin-bottom: calc(16 * var(--rpx)); padding: calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.product-checkbox { margin-right: calc(16 * var(--rpx)); cursor: pointer; }
.product-cover { width: calc(126 * var(--rpx)); height: calc(160 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border-radius: calc(11 * var(--rpx)); background: #eff3ef; object-fit: cover; }
.product-info { display: flex; flex: 1; flex-direction: column; align-self: stretch; padding: calc(5 * var(--rpx)) 0; min-width: 0; }
.product-title { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(28 * var(--rpx)); font-weight: 650; line-height: 1.42; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.product-spec { align-self: flex-start; margin-top: calc(12 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(10 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #f4f6f2; color: #90a095; font-size: calc(21 * var(--rpx)); }
.product-price { margin-top: auto; color: #c98f1b; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.empty-cart { padding-top: calc(180 * var(--rpx)); color: #9daaa1; font-size: calc(27 * var(--rpx)); text-align: center; }
.footer { position: absolute; right: 0; bottom: 0; left: 0; z-index: 3; display: flex; align-items: center; height: calc(116 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); border-top: calc(1 * var(--rpx)) solid #e8e5df; background: rgba(255,255,255,.98); box-shadow: 0 calc(-6 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.04); box-sizing: border-box; }
.checkbox-label { display: flex; align-items: center; margin-right: calc(12 * var(--rpx)); color: #687d71; cursor: pointer; }
.checkbox-label text { margin-left: calc(7 * var(--rpx)); font-size: calc(24 * var(--rpx)); }
.total, .total-selected { flex: 1; color: #74897d; font-size: calc(24 * var(--rpx)); text-align: right; }
.price { color: #c98f1b; font-size: calc(34 * var(--rpx)); font-weight: 750; }
.checkout-btn { display: flex; align-items: center; justify-content: center; min-width: calc(178 * var(--rpx)); height: calc(74 * var(--rpx)); margin-left: calc(14 * var(--rpx)); padding: 0 calc(18 * var(--rpx)); border-radius: calc(16 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(27 * var(--rpx)); font-weight: 700; line-height: calc(74 * var(--rpx)) !important; box-shadow: 0 calc(7 * var(--rpx)) calc(14 * var(--rpx)) rgba(22, 106, 63,.15); }
.checkout-btn.delete-mode { background: #5f6875; box-shadow: none; }
.checkout-btn[disabled] { background: #d9dde2; box-shadow: none; }
</style>
