<template>
  <view class="container">
    <view class="page-nav"><text class="page-nav-title">我的求购</text><view class="nav-publish-link" @click="navigateToPublishNewRequest">发布求购 ›</view></view>
    <!-- 我的求购列表区域 -->
    <view class="section request-list-section">
      <view class="section-title-cluster"><view class="section-title">正在寻找的书</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view>

      <!-- 未登录提示 -->
      <view class="login-prompt-container" v-if="!isLoggedIn && !isLoadingRequests">
        <text class="login-prompt-text">请先登录查看您发布的求购信息</text>
        <button class="login-prompt-button" @click="navigateToLogin">去登录</button>
      </view>

      <!-- 已登录，但列表为空 -->
      <view class="empty-list" v-else-if="isLoggedIn && myRequests.length === 0 && !isLoadingRequests">
        <view class="empty-icon placeholder-block"></view>
        <text>您还没有发布任何求购信息</text>
        <button class="publish-guidance-button" @click="navigateToPublishNewRequest">去发布求购</button>
      </view>

      <!-- 已登录，且有数据 -->
      <view class="book-list" v-else-if="isLoggedIn && myRequests.length > 0">
        <view class="book-item seeking-item" v-for="item in myRequests" :key="item.id">
          <img class="book-cover" :src="item.coverUrl || ''" v-if="item.coverUrl" />
          <view class="book-cover placeholder-block" v-else></view>

          <view class="book-info">
            <view class="book-name">{{ item.title }}</view>
            <view class="book-detail-line">
              <text class="book-code" v-if="item.author">作者: {{ item.author }}</text>
              <text class="book-code" v-if="item.courseCode">课程代码: {{ item.courseCode }}</text>
            </view>
            <view class="book-price seeking-price">
              期望:
              <text v-if="item.expectedPrice">¥{{ item.expectedPrice }}</text>
              <text v-else>面议</text>
            </view>
            <view class="seeking-description" v-if="item.description">{{ item.description }}</view>
          </view>
          <button class="manage-button" @click="manageRequest(item.id)"><text class="button-label">管理</text></button>
        </view>
      </view>

      <!-- 加载中提示 -->
      <view class="loading-placeholder" v-if="isLoadingRequests">
        <text>正在加载您的求购...</text>
      </view>

      <!-- 加载更多提示 -->
      <view class="list-footer-tip" v-if="isLoggedIn && myRequests.length > 0 && !isLoadingRequests">
        <view class="load-more-text" v-if="hasMoreRequests" @click="loadMoreRequests">点击加载更多</view>
        <view class="no-more-text" v-else>已经到底啦~</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted, onActivated, onUnmounted, onDeactivated } from 'vue';
import * as wx from '../services/wx';
import { globalData, registerLoginCallback, unregisterLoginCallback, requireApproved } from '../store';

defineOptions({ name: 'RequestPage' });
const PAGE_NAME = 'requestPage';

const myRequests = ref([]);
const hasMoreRequests = ref(true);
const requestPage = ref(1);
const requestPageSize = 10;
const isLoadingRequests = ref(false);
const isLoggedIn = ref(false);

onMounted(() => {
  registerLoginCallback(PAGE_NAME, handleLoginStateChange);
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  if (globalData.isUserLoggedIn) {
    loadMyRequests(true);
  } else {
    myRequests.value = [];
    hasMoreRequests.value = false;
    requestPage.value = 1;
  }
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onActivated(() => {
  window.addEventListener('scroll', onReachBottom, { passive: true });
  isLoggedIn.value = Boolean(globalData.isUserLoggedIn);
  if (isLoggedIn.value) {
    if (globalData.requestListNeedRefresh || (myRequests.value.length === 0 && !isLoadingRequests.value)) {
      loadMyRequests(true);
      if (globalData.requestListNeedRefresh) globalData.requestListNeedRefresh = false;
    }
  } else {
    myRequests.value = [];
    hasMoreRequests.value = false;
    requestPage.value = 1;
  }
});

onDeactivated(() => window.removeEventListener('scroll', onReachBottom));
onUnmounted(() => {
  unregisterLoginCallback(PAGE_NAME);
  window.removeEventListener('scroll', onReachBottom);
});

function handleLoginStateChange(loggedIn) {
  const previousIsLoggedIn = isLoggedIn.value;
  isLoggedIn.value = Boolean(loggedIn);
  if (loggedIn) {
    if ((!previousIsLoggedIn || myRequests.value.length === 0) && !isLoadingRequests.value) loadMyRequests(true);
  } else {
    myRequests.value = [];
    hasMoreRequests.value = false;
    requestPage.value = 1;
  }
}

async function loadMyRequests(refresh = false) {
  if (!isLoggedIn.value) {
    myRequests.value = [];
    hasMoreRequests.value = false;
    requestPage.value = 1;
    isLoadingRequests.value = false;
    return;
  }
  if (isLoadingRequests.value && !refresh) return;
  if (!refresh && !hasMoreRequests.value) return;

  isLoadingRequests.value = true;
  const pageToLoad = refresh ? 1 : requestPage.value + 1;
  if (refresh) { requestPage.value = 1; myRequests.value = []; }

  wx.showLoading({ title: '加载中...' });
  try {
    const res = await wx.cloud.callFunction({
      name: 'getSeekingPosts',
      data: {
        page: pageToLoad,
        pageSize: requestPageSize,
        userId: globalData.userInfo ? globalData.userInfo.user_id : null
      }
    });
    wx.hideLoading();
    isLoadingRequests.value = false;
    if (res.result && res.result.success) {
      const newRequests = res.result.data || [];
      myRequests.value = refresh ? newRequests : myRequests.value.concat(newRequests);
      hasMoreRequests.value = Boolean(res.result.hasMore);
      requestPage.value = pageToLoad;
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载求购失败', icon: 'none' });
      if (refresh) hasMoreRequests.value = false;
    }
  } catch (err) {
    wx.hideLoading();
    isLoadingRequests.value = false;
    console.error('Error calling getSeekingPosts:', err);
    wx.showToast({ title: '网络请求异常', icon: 'none' });
    if (refresh) hasMoreRequests.value = false;
  }
}

function manageRequest(requestId) {
  if (!requestId) return;
  if (!isLoggedIn.value) { navigateToLogin(); return; }
  wx.navigateTo({ url: `/pages/publishRequest/publishRequest?id=${requestId}` });
}

async function navigateToPublishNewRequest() {
  if (!isLoggedIn.value) {
    wx.showModal({
      title: '请先登录',
      content: '登录后才能发布求购信息哦～',
      confirmText: '去登录',
      showCancel: false,
      success: res => { if (res.confirm) navigateToLogin(); }
    });
    return;
  }
  if (!(await requireApproved('发布求购'))) return;
  wx.navigateTo({ url: '/pages/publishRequest/publishRequest' });
}

function navigateToLogin() { wx.navigateTo({ url: '/pages/auth/auth' }); }
function loadMoreRequests() { loadMyRequests(false); }

function onReachBottom() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  if (!nearBottom) return;
  if (isLoggedIn.value && hasMoreRequests.value && !isLoadingRequests.value) loadMyRequests();
}
</script>

<style scoped>
.container { padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-publish-link { position: absolute; right: 0; bottom: calc(21 * var(--rpx)); color: #71877b; font-size: calc(23 * var(--rpx)); cursor: pointer; }
.page-nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.section { padding: calc(26 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(24 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63, .035); }
.section-title { position: relative; margin-bottom: calc(21 * var(--rpx)); padding-left: calc(16 * var(--rpx)); color: #166a3f; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.section-title::before { position: absolute; top: calc(7 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(29 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #3e8067; content: ''; }
.section-title-cluster { display: flex; align-items: center; min-width: 0; }
.section-leaf-sprig { position: relative; width: calc(42 * var(--rpx)); height: calc(34 * var(--rpx)); margin: calc(-2 * var(--rpx)) 0 calc(21 * var(--rpx)) calc(9 * var(--rpx)); flex: none; }
.section-leaf-sprig::before { position: absolute; top: calc(6 * var(--rpx)); left: calc(19 * var(--rpx)); width: calc(2 * var(--rpx)); height: calc(25 * var(--rpx)); border-radius: calc(2 * var(--rpx)); background: #87ae7e; content: ''; transform: rotate(-36deg); transform-origin: bottom; }
.sprig-leaf { position: absolute; width: calc(15 * var(--rpx)); height: calc(9 * var(--rpx)); border-radius: calc(15 * var(--rpx)) 0 calc(15 * var(--rpx)) 0; background: #b8d3ab; transform: rotate(-34deg); }
.leaf-one { top: calc(4 * var(--rpx)); left: calc(5 * var(--rpx)); }
.leaf-two { top: calc(14 * var(--rpx)); left: calc(18 * var(--rpx)); background: #d5e5c8; transform: rotate(29deg); }
.leaf-three { top: calc(22 * var(--rpx)); left: calc(5 * var(--rpx)); width: calc(12 * var(--rpx)); height: calc(8 * var(--rpx)); background: #e8c270; transform: rotate(-22deg); }
.book-item { display: flex; align-items: center; padding: calc(19 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.book-item:last-child { border-bottom: 0; }
.book-cover { width: calc(120 * var(--rpx)); height: calc(156 * var(--rpx)); margin-right: calc(18 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #eff3ef; flex-shrink: 0; object-fit: cover; }
.placeholder-block { background: #eff3ef; }
.book-info { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: calc(156 * var(--rpx)); padding: calc(3 * var(--rpx)) 0; }
.book-name { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(28 * var(--rpx)); font-weight: 650; line-height: 1.42; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.book-detail-line { margin-top: calc(10 * var(--rpx)); color: #8f9f94; font-size: calc(21 * var(--rpx)); line-height: 1.5; }
.book-code { display: inline-block; margin-right: calc(7 * var(--rpx)); }
.book-price { margin-top: calc(10 * var(--rpx)); font-size: calc(28 * var(--rpx)); font-weight: 750; }
.seeking-price { color: #3e8067; }
.seeking-description { display: -webkit-box; overflow: hidden; margin-top: calc(8 * var(--rpx)); color: #69778b; font-size: calc(22 * var(--rpx)); line-height: 1.48; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.manage-button { display: flex; align-items: center; justify-content: center; min-width: calc(94 * var(--rpx)); height: calc(54 * var(--rpx)); margin-left: calc(13 * var(--rpx)); padding: 0 calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dce8df; border-radius: calc(28 * var(--rpx)); background: #edf7fb; color: #3e8067; font-size: calc(23 * var(--rpx)); font-weight: 600; line-height: calc(54 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.button-label { position: relative; display: block; line-height: 1; }
.empty-list, .login-prompt-container { display: flex; flex-direction: column; align-items: center; padding: calc(72 * var(--rpx)) 0; color: #9daaa1; font-size: calc(26 * var(--rpx)); text-align: center; }
.empty-icon { width: calc(112 * var(--rpx)); height: calc(112 * var(--rpx)); margin-bottom: calc(16 * var(--rpx)); border-radius: 50%; }
.publish-guidance-button, .login-prompt-button { display: flex; align-items: center; justify-content: center; height: calc(66 * var(--rpx)); margin-top: calc(22 * var(--rpx)); padding: 0 calc(30 * var(--rpx)); border-radius: calc(33 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(25 * var(--rpx)); }
.loading-placeholder, .list-footer-tip { padding-top: calc(22 * var(--rpx)); color: #9faea4; font-size: calc(23 * var(--rpx)); text-align: center; }
.load-more-text { cursor: pointer; }
</style>
