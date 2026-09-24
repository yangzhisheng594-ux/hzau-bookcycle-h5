<template>
  <view class="container">
    <view class="page-nav"><text class="page-nav-title">华农书循环</text><view class="nav-publish-link" @click="navigateToPublishNew">发布闲置书 ›</view></view>

    <!-- 主区：书市浏览（别人发布的在售教材，可点进购买） -->
    <view class="section market-section">
      <view class="section-title-row">
        <view class="section-title-cluster"><view class="section-title">在售教材</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view>
        <text class="sold-orders-link" @click="submitSearch('')">搜索 ›</text>
      </view>

      <view class="book-list" v-if="marketBooks.length > 0">
        <view class="book-item" v-for="item in marketBooks" :key="item.id" @click="navigateToBookDetail(item.id)">
          <img class="book-cover" v-if="item.coverUrl" :src="item.coverUrl" />
          <view class="book-cover book-cover-placeholder" v-else>暂无封面</view>
          <view class="book-info">
            <view class="book-name">{{ item.title }}</view>
            <view class="book-detail-line">
              <text class="book-code">课程代码: {{ item.courseCode || 'N/A' }}</text>
              <text class="status-badge status-available">可购买</text>
            </view>
            <view class="book-price">出售价格: ¥{{ item.price }}</view>
          </view>
          <button class="buy-button" @click.stop="navigateToBookDetail(item.id)"><text class="button-label">看详情</text></button>
        </view>
      </view>

      <view class="empty-list" v-else-if="!isLoadingMarket && marketLoaded">
        <view class="empty-icon">书架空空</view>
        <text>暂无在售教材，去首页看看或自己发布一本</text>
        <button class="publish-guidance-button" @click="navigateToPublishNew">去发布一本</button>
      </view>

      <view class="list-footer-tip">
        <view class="load-more-text" v-if="isLoadingMarket && hasMoreMarket">正在加载更多...</view>
        <view class="load-more-text" v-else-if="!isLoadingMarket && hasMoreMarket && marketBooks.length > 0" @click="loadMoreMarket">点击加载更多</view>
        <view class="no-more-text" v-else-if="!hasMoreMarket && marketBooks.length > 0">已经到底啦~</view>
      </view>
    </view>

    <!-- 次区：我的在售（仅登录后展示，用于管理自己发布的书） -->
    <view class="section my-sell-section" v-if="isLoggedIn">
      <view class="section-title-row">
        <view class="section-title-cluster"><view class="section-title">我的在售</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view>
        <view class="sold-orders-link" @click="navigateToSoldOrders">售出订单 ›</view>
      </view>

      <view class="book-list" v-if="myBooks.length > 0">
        <view class="book-item" v-for="item in myBooks" :key="item.id" @click="manageBook(item.id, item.status)">
          <img class="book-cover" v-if="item.coverUrl" :src="item.coverUrl" />
          <view class="book-cover book-cover-placeholder" v-else>暂无封面</view>
          <view class="book-info">
            <view class="book-name">{{ item.title }}</view>
            <view class="book-detail-line">
              <text class="book-code">课程代码: {{ item.courseCode || 'N/A' }}</text>
              <text class="status-badge" :class="'status-' + item.status">{{ statusText(item.status) }}</text>
            </view>
            <view class="book-price">出售价格: ¥{{ item.price }}</view>
          </view>
          <button class="manage-button" @click.stop="manageBook(item.id, item.status)"><text class="button-label">{{ ['locked','trading'].includes(item.status) ? '订单' : '管理' }}</text></button>
        </view>
      </view>
      <view class="empty-list" v-else-if="myLoaded && !isLoadingMy">
        <view class="empty-icon">暂无书籍</view>
        <text>您还没有发布任何书籍</text>
        <button class="publish-guidance-button" @click="navigateToPublishNew">去发布一本</button>
      </view>
    </view>

    <!-- 最近求购区域 -->
    <view class="section seeking-list-section">
      <view class="section-title-cluster"><view class="section-title">同学正在找</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view>
      <view class="book-list" v-if="seekingBooks.length > 0">
        <view class="book-item" v-for="item in seekingBooks" :key="item.id">
          <img class="book-cover" v-if="item.coverUrl" :src="item.coverUrl" />
          <view class="book-cover book-cover-placeholder" v-else>暂无封面</view>
          <view class="book-info">
            <view class="book-name">{{ item.title }}</view>
            <view class="book-detail-line"><text class="book-code">课程代码: {{ item.courseCode }}</text></view>
            <view class="book-price seeking-price">求购价格: ¥{{ item.seekingPrice }}</view>
          </view>
          <button class="manage-button respond-button" @click="respondToSeek"><text class="button-label">我有此书</text></button>
        </view>
      </view>
      <view class="empty-list" v-else>
        <view class="empty-icon">暂无求购</view>
        <text>暂无求购信息</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onActivated, onUnmounted, onDeactivated } from 'vue';
import * as wx from '../services/wx';
import { globalData, registerLoginCallback, unregisterLoginCallback, requireApproved } from '../store';

defineOptions({ name: 'SellPage' });
const PAGE_NAME = 'sellPage';

const BOOK_STATUS_TEXT = { available: '可购买', locked: '已锁定', trading: '交易中', sold: '已售出' };
function statusText(status) { return BOOK_STATUS_TEXT[status] || '可购买'; }

const marketBooks = ref([]);
const hasMoreMarket = ref(true);
const marketPage = ref(1);
const marketPageSize = 10;
const isLoadingMarket = ref(false);
const marketLoaded = ref(false);

const myBooks = ref([]);
const hasMoreMy = ref(true);
const myPage = ref(1);
const myPageSize = 10;
const isLoadingMy = ref(false);
const myLoaded = ref(false);

const seekingBooks = ref([]);
const hasMoreSeeking = ref(true);
const seekingPage = ref(1);
const seekingPageSize = 10;
const isLoadingSeeking = ref(false);

const isLoggedIn = ref(false);

onMounted(() => {
  registerLoginCallback(PAGE_NAME, handleLoginStateChange);
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  loadMarketBooks(true);
  loadSeekingBooks(true);
  if (isLoggedIn.value) loadMyBooks(true);
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onActivated(() => {
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  if (globalData.sellListNeedRefresh) { loadMarketBooks(true); globalData.sellListNeedRefresh = false; }
  if (globalData.seekingListNeedRefresh) { loadSeekingBooks(true); globalData.seekingListNeedRefresh = false; }
  if (isLoggedIn.value && globalData.sellListNeedRefresh === undefined) loadMyBooks(true);
  else if (isLoggedIn.value) loadMyBooks(true);
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onDeactivated(() => window.removeEventListener('scroll', onReachBottom));
onUnmounted(() => {
  unregisterLoginCallback(PAGE_NAME);
  window.removeEventListener('scroll', onReachBottom);
});

function handleLoginStateChange(loggedIn) {
  isLoggedIn.value = Boolean(loggedIn);
  if (loggedIn) { if (myBooks.value.length === 0) loadMyBooks(true); }
  else { myBooks.value = []; hasMoreMy.value = true; myPage.value = 1; myLoaded.value = false; }
}

// --- 书市（所有人可购买的在售教材） ---
async function loadMarketBooks(refresh = false) {
  if (isLoadingMarket.value && !refresh) return;
  if (!refresh && !hasMoreMarket.value) return;
  isLoadingMarket.value = true;
  const pageToLoad = refresh ? 1 : marketPage.value + 1;
  if (refresh) { marketPage.value = 1; marketBooks.value = []; }
  try {
    const res = await wx.cloud.callFunction({ name: 'getBooks', data: { page: pageToLoad, pageSize: marketPageSize } });
    isLoadingMarket.value = false;
    if (res.result && res.result.success) {
      const newBooks = (res.result.data || []);
      marketBooks.value = refresh ? newBooks : marketBooks.value.concat(newBooks);
      hasMoreMarket.value = Boolean(res.result.pagination && res.result.pagination.hasMore);
      marketPage.value = pageToLoad;
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载失败，请稍后重试', icon: 'none' });
      if (refresh) hasMoreMarket.value = false;
    }
  } catch (err) {
    isLoadingMarket.value = false;
    console.error('Error calling getBooks:', err);
    wx.showToast({ title: '网络请求异常', icon: 'none' });
    if (refresh) hasMoreMarket.value = false;
  } finally {
    marketLoaded.value = true;
  }
}
function loadMoreMarket() { loadMarketBooks(false); }

// --- 我的在售 ---
async function loadMyBooks(refresh = false) {
  if (!isLoggedIn.value) { myBooks.value = []; return; }
  if (isLoadingMy.value && !refresh) return;
  if (!refresh && !hasMoreMy.value) return;
  isLoadingMy.value = true;
  const pageToLoad = refresh ? 1 : myPage.value + 1;
  if (refresh) { myPage.value = 1; myBooks.value = []; }
  wx.showLoading({ title: '加载中...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'getUserSellingBooks', data: { page: pageToLoad, pageSize: myPageSize } });
    wx.hideLoading();
    isLoadingMy.value = false;
    if (res.result && res.result.success) {
      const newBooks = (res.result.data || []);
      myBooks.value = refresh ? newBooks : myBooks.value.concat(newBooks);
      hasMoreMy.value = Boolean(res.result.hasMore);
      myPage.value = pageToLoad;
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
      if (refresh) hasMoreMy.value = false;
    }
  } catch (err) {
    wx.hideLoading();
    isLoadingMy.value = false;
    console.error('Error calling getUserSellingBooks:', err);
    wx.showToast({ title: '网络请求异常', icon: 'none' });
    if (refresh) hasMoreMy.value = false;
  } finally {
    myLoaded.value = true;
  }
}

// --- 最近求购相关 ---
async function loadSeekingBooks(refresh = false) {
  if (isLoadingSeeking.value && !refresh) return;
  if (!refresh && !hasMoreSeeking.value) return;
  isLoadingSeeking.value = true;
  const pageToLoad = refresh ? 1 : seekingPage.value + 1;
  if (refresh) { seekingPage.value = 1; seekingBooks.value = []; }
  try {
    const res = await wx.cloud.callFunction({ name: 'getSeekingPosts', data: { page: pageToLoad, pageSize: seekingPageSize } });
    isLoadingSeeking.value = false;
    if (res.result && res.result.success) {
      const newPosts = (res.result.data || []);
      seekingBooks.value = refresh ? newPosts : seekingBooks.value.concat(newPosts);
      hasMoreSeeking.value = Boolean(res.result.hasMore);
      seekingPage.value = pageToLoad;
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载求购失败', icon: 'none' });
      if (refresh) hasMoreSeeking.value = false;
    }
  } catch (err) {
    isLoadingSeeking.value = false;
    console.error('Error calling getSeekingPosts:', err);
    wx.showToast({ title: '网络请求异常', icon: 'none' });
    if (refresh) hasMoreSeeking.value = false;
  }
}

function navigateToBookDetail(bookId) {
  if (bookId) wx.navigateTo({ url: `/pages/bookDetail/bookDetail?id=${bookId}` });
}
function manageBook(bookId, status) {
  if (['locked', 'trading'].includes(status)) {
    wx.navigateTo({ url: '/pages/soldOrders/soldOrders' });
    return;
  }
  if (bookId) wx.navigateTo({ url: `/pages/publish/publish?id=${bookId}` });
}
function respondToSeek() {
  wx.showToast({ title: '请通过校园联系方式与求购者沟通', icon: 'none' });
}

async function navigateToPublishNew() {
  if (!isLoggedIn.value) {
    wx.showModal({
      title: '请先登录',
      content: '登录后才能发布书籍哦～',
      confirmText: '去登录',
      showCancel: false,
      success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/auth/auth' }); }
    });
    return;
  }
  if (!(await requireApproved('发布书籍'))) return;
  wx.navigateTo({ url: '/pages/publish/publish' });
}

function navigateToLogin() { wx.navigateTo({ url: '/pages/auth/auth' }); }

function navigateToSoldOrders() {
  if (!isLoggedIn.value) { navigateToLogin(); return; }
  wx.navigateTo({ url: '/pages/soldOrders/soldOrders' });
}

function submitSearch(keyword) {
  const kw = encodeURIComponent(keyword || '');
  wx.navigateTo({ url: `/pages/search/search?keyword=${kw}` });
}

function onReachBottom() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  if (!nearBottom) return;
  if (hasMoreMarket.value && !isLoadingMarket.value) loadMarketBooks(false);
  if (hasMoreMy.value && !isLoadingMy.value) loadMyBooks(false);
  if (hasMoreSeeking.value && !isLoadingSeeking.value) loadSeekingBooks(false);
}
</script>

<style scoped>
.container { padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.page-nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-publish-link { position: absolute; right: 0; bottom: calc(21 * var(--rpx)); color: #71877b; font-size: calc(23 * var(--rpx)); cursor: pointer; }
.section { margin-bottom: calc(22 * var(--rpx)); padding: calc(26 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(24 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63, .035); }
.section-title-row { display: flex; align-items: center; justify-content: space-between; }
.section-title { position: relative; margin-bottom: calc(21 * var(--rpx)); padding-left: calc(16 * var(--rpx)); color: #166a3f; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.section-title::before { position: absolute; top: calc(7 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(29 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.section-title-cluster { display: flex; align-items: center; min-width: 0; }
.section-leaf-sprig { position: relative; width: calc(42 * var(--rpx)); height: calc(34 * var(--rpx)); margin: calc(-2 * var(--rpx)) 0 calc(21 * var(--rpx)) calc(9 * var(--rpx)); flex: none; }
.section-leaf-sprig::before { position: absolute; top: calc(6 * var(--rpx)); left: calc(19 * var(--rpx)); width: calc(2 * var(--rpx)); height: calc(25 * var(--rpx)); border-radius: calc(2 * var(--rpx)); background: #87ae7e; content: ''; transform: rotate(-36deg); transform-origin: bottom; }
.sprig-leaf { position: absolute; width: calc(15 * var(--rpx)); height: calc(9 * var(--rpx)); border-radius: calc(15 * var(--rpx)) 0 calc(15 * var(--rpx)) 0; background: #b8d3ab; transform: rotate(-34deg); }
.leaf-one { top: calc(4 * var(--rpx)); left: calc(5 * var(--rpx)); }
.leaf-two { top: calc(14 * var(--rpx)); left: calc(18 * var(--rpx)); background: #d5e5c8; transform: rotate(29deg); }
.leaf-three { top: calc(22 * var(--rpx)); left: calc(5 * var(--rpx)); width: calc(12 * var(--rpx)); height: calc(8 * var(--rpx)); background: #e8c270; transform: rotate(-22deg); }
.section-title-row .section-title { margin-bottom: calc(21 * var(--rpx)); }
.sold-orders-link { padding-bottom: calc(21 * var(--rpx)); color: #71877b; font-size: calc(23 * var(--rpx)); cursor: pointer; }
.book-list { display: flex; flex-direction: column; }
.book-item { display: flex; align-items: center; padding: calc(19 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.book-item:last-child { padding-bottom: 0; border-bottom: 0; }
.book-cover { width: calc(120 * var(--rpx)); height: calc(156 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #eff3ef; flex-shrink: 0; object-fit: cover; }
.book-cover-placeholder { display: flex; align-items: center; justify-content: center; color: #9faea4; font-size: calc(21 * var(--rpx)); }
.book-info { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: calc(156 * var(--rpx)); padding: calc(3 * var(--rpx)) 0; }
.book-name { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(28 * var(--rpx)); font-weight: 650; line-height: 1.42; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.book-detail-line { margin-top: calc(10 * var(--rpx)); color: #8f9f94; font-size: calc(21 * var(--rpx)); }
.book-code { display: inline-block; padding: calc(4 * var(--rpx)) calc(9 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #f4f6f2; }
.status-badge { display: inline-block; margin-left: calc(10 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(7 * var(--rpx)); font-size: calc(19 * var(--rpx)); font-weight: 650; line-height: 1.4; }
.status-available { background: #e8f3ec; color: #166a3f; }
.status-locked { background: #f0eeea; color: #8a8a86; }
.status-trading { background: #fdf6e3; color: #b07f16; }
.status-sold { background: #f4f4f2; color: #b3b3ae; }
.book-price { margin-top: auto; color: #c98f1b; font-size: calc(28 * var(--rpx)); font-weight: 750; }
.seeking-price { color: #3e8067; }
.buy-button { display: flex !important; align-items: center !important; justify-content: center !important; min-width: calc(100 * var(--rpx)); height: calc(54 * var(--rpx)); margin-left: calc(14 * var(--rpx)); padding: 0 calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #cfe3d6; border-radius: calc(28 * var(--rpx)); background: #166a3f !important; color: #fff !important; font-size: calc(23 * var(--rpx)); font-weight: 600; line-height: 1 !important; text-align: center; box-sizing: border-box; cursor: pointer; }
.manange-button, .manage-button { display: flex !important; align-items: center !important; justify-content: center !important; min-width: calc(100 * var(--rpx)); height: calc(54 * var(--rpx)); margin-left: calc(14 * var(--rpx)); padding: 0 calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e2ebe4; border-radius: calc(28 * var(--rpx)); background: #fff; color: #687d71; font-size: calc(23 * var(--rpx)); font-weight: 600; line-height: 1 !important; text-align: center; box-sizing: border-box; cursor: pointer; }
.respond-button { border-color: #dce8df; background: #edf7fb; color: #3e8067; }
.button-label { position: static; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; line-height: 1; text-align: center; }
.empty-list, .login-prompt { display: flex; flex-direction: column; align-items: center; padding: calc(50 * var(--rpx)) 0; color: #9daaa1; font-size: calc(26 * var(--rpx)); text-align: center; }
.empty-icon { display: flex; align-items: center; justify-content: center; width: calc(106 * var(--rpx)); height: calc(106 * var(--rpx)); margin-bottom: calc(16 * var(--rpx)); border-radius: 50%; background: #f3f5f1; color: #829488; font-size: calc(21 * var(--rpx)); }
.publish-guidance-button { display: flex; align-items: center; justify-content: center; height: calc(66 * var(--rpx)); margin-top: calc(22 * var(--rpx)); padding: 0 calc(30 * var(--rpx)); border-radius: calc(33 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(25 * var(--rpx)); }
.list-footer-tip { padding-top: calc(18 * var(--rpx)); color: #9faea4; font-size: calc(23 * var(--rpx)); text-align: center; }
.load-more-text { cursor: pointer; }
</style>
