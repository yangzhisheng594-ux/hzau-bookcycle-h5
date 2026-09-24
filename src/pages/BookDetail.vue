<template>
  <view class="container">
    <view class="detail-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">图书详情</text></view>
    <!-- 顶部图片和基本信息区域 -->
    <view class="book-main-info-section">
      <!-- 图片区域 -->
      <view class="image-container">
        <!-- 优先使用 imageUrls 进行轮播 -->
        <view class="image-swiper" v-if="book.imageUrls && book.imageUrls.length > 0" ref="swiperRef" @scroll.passive="onSwiperScroll">
          <view class="swiper-slide" v-for="(imageUrl, i) in book.imageUrls" :key="i">
            <img :src="imageUrl" class="slide-image" v-if="imageUrl" />
            <view class="image-placeholder-block" v-else></view>
          </view>
        </view>
        <!-- 如果 imageUrls 为空或不存在，但 book.coverUrl 存在，则显示单张封面图 -->
        <img :src="book.coverUrl" class="slide-image" v-else-if="book.coverUrl" />
        <!-- 如果两者都没有，则显示一个 CSS 占位块 -->
        <view class="image-placeholder-block" v-else></view>

        <view class="image-count" v-if="book.imageUrls && book.imageUrls.length > 1">
          <text>{{ currentSwiper + 1 }}</text>/{{ book.imageUrls.length }}
        </view>
      </view>

      <!-- 价格、书名、作者、代码、分享区域 -->
      <view class="meta-info">
        <view class="price-line">
          <text class="current-price">¥{{ book.price || 'N/A' }}</text>
          <text class="original-price" v-if="book.originalPrice && book.originalPrice !== book.price && book.originalPrice > 0">¥{{ book.originalPrice }}</text>
        </view>
        <view class="title-author">
          {{ book.title || '书籍标题加载中...' }}
          <text v-if="book.author" class="author-name"> / {{ book.author }}</text>
        </view>
        <view class="book-tags">
          <text class="course-tag">{{ [book.major, book.grade].filter(Boolean).join(' · ') || book.courseCode || '课程教材' }}</text>
          <text class="condition-tag" v-if="book.condition">{{ book.condition }}</text>
        </view>
        <view class="code-share-line">
          <text class="course-code">支持校内面交 · 当面验书</text>
          <button class="share-button" @click="shareBook">
            <text>分享</text>
          </button>
        </view>
      </view>
    </view>

    <!-- 其他信息区域 (品相、出版社等) -->
    <view class="book-extra-info-section" v-if="book.condition || book.publisher || book.publishDate || book.isbn || book.views > 0">
      <view class="section-title-detail">其他信息</view>
      <view class="extra-info-grid">
        <view class="extra-info-item" v-if="book.condition">
          <text class="extra-info-label">品相:</text>
          <text class="extra-info-value">{{ book.condition }}</text>
        </view>
        <view class="extra-info-item" v-if="book.publisher">
          <text class="extra-info-label">出版社:</text>
          <text class="extra-info-value">{{ book.publisher }}</text>
        </view>
        <view class="extra-info-item" v-if="book.publishDate">
          <text class="extra-info-label">出版日期:</text>
          <text class="extra-info-value">{{ book.publishDate }}</text>
        </view>
        <view class="extra-info-item" v-if="book.isbn">
          <text class="extra-info-label">ISBN:</text>
          <text class="extra-info-value">{{ book.isbn }}</text>
        </view>
        <view class="extra-info-item" v-if="book.views > 0">
          <text class="extra-info-label">浏览量:</text>
          <text class="extra-info-value">{{ book.views }}</text>
        </view>
      </view>
    </view>

    <!-- 卖家信息区域 -->
    <view class="seller-info-section" v-if="book.sellerInfo">
      <view class="section-title-detail">卖家信息</view>
      <view class="seller-card">
        <img class="seller-avatar" :src="book.sellerInfo.avatarUrl" v-if="book.sellerInfo.avatarUrl" />
        <view class="avatar-placeholder-block" v-else></view>
        <view class="seller-details">
          <view class="seller-name">{{ book.sellerInfo.nickName || '匿名卖家' }}</view>
          <view class="seller-bio" v-if="book.sellerProfile && book.sellerProfile.bio">{{ book.sellerProfile.bio }}</view>
        </view>
      </view>

      <!-- 联系方式：按卖家自己设定的可见范围下发；无权查看时不显示空卡片 -->
      <view class="contact-card" v-if="sellerContact && sellerContact.visible">
        <view class="contact-row" v-for="c in visibleContacts" :key="c.label" @click="copyContact(c)">
          <text class="contact-label">{{ c.label }}</text>
          <text class="contact-value">{{ c.value }}</text>
          <text class="contact-copy">复制</text>
        </view>
        <view class="contact-meet" v-if="sellerContact.meetPoint">
          <text class="contact-meet-label">常用交易地点</text>
          <text class="contact-meet-value">{{ sellerContact.meetPoint }}</text>
        </view>
      </view>
      <view class="contact-locked" v-else-if="sellerContact">
        <text class="contact-locked-text">🔒 {{ sellerContact.reason }}</text>
      </view>
    </view>

    <!-- 书籍详情内容区域 -->
    <view class="book-content-section content-below-main">
      <view class="section-title-detail">书籍详情</view>
      <view class="content-text">
        {{ book.description || '暂无详细介绍。' }}
      </view>
    </view>

    <!-- 底部操作栏：状态驱动，确认购买=锁单非支付 -->
    <view class="bottom-actions" v-if="isOwnBook">
      <view class="own-book-tip">这是你发布的书 · 可在「卖书」页管理</view>
    </view>
    <view class="bottom-actions" v-else-if="bookStatus === 'available'">
      <view class="action-button add-to-cart-button" @click="addToCart">加入购物车</view>
      <view class="action-button buy-now-button" @click="buyNow">确认购买</view>
    </view>
    <view class="bottom-actions" v-else>
      <view class="action-button status-action-button" :class="'status-' + bookStatus" disabled>
        {{ bookStatus === 'locked' ? '已被锁定 · 其他同学交易中' : bookStatus === 'trading' ? '交易中 · 即将完成交付' : '已售出' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { globalData, requireApproved } from '../store';

const route = useRoute();
const bookId = ref(null);
const book = ref({});
const currentSwiper = ref(0);
const swiperRef = ref(null);

const bookStatus = computed(() => book.value.status || 'available');
const isOwnBook = computed(() => Boolean(globalData.userInfo && book.value.userId === globalData.userInfo.user_id));
const sellerContact = computed(() => book.value.sellerContact || null);
// 只列出卖家真的填了的联系方式，避免出现「微信：（空）」这种无效行
const visibleContacts = computed(() => {
  const c = sellerContact.value;
  if (!c || !c.visible) return [];
  return [
    { label: '微信号', value: c.wechat },
    { label: 'QQ 号', value: c.qq },
    { label: '手机号', value: c.phone }
  ].filter(item => item.value);
});

async function copyContact(item) {
  const done = await wx.setClipboardData({ data: String(item.value) });
  if (done) wx.showToast({ title: `${item.label}已复制`, icon: 'none' });
}

onMounted(() => {
  const id = route.query.id;
  if (id) {
    bookId.value = id;
    book.value = {};
    currentSwiper.value = 0;
    loadBookDetail(id);
  } else {
    wx.showToast({ title: '参数错误', icon: 'none', duration: 2000 });
    setTimeout(() => wx.navigateBack(), 500);
  }
});

async function loadBookDetail(id) {
  wx.showLoading({ title: '加载中...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'getBookDetail', data: { bookId: id } });
    wx.hideLoading();
    if (res.result && res.result.success && res.result.data) {
      const bookData = res.result.data;
      if (!bookData.imageUrls || !Array.isArray(bookData.imageUrls)) bookData.imageUrls = [];
      book.value = bookData;
      if (bookData.title) wx.setNavigationBarTitle({ title: bookData.title });
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载失败', icon: 'none' });
    }
  } catch (err) {
    wx.hideLoading();
    console.error('Error calling getBookDetail:', err);
    wx.showToast({ title: '网络请求失败', icon: 'none' });
  }
}

// 轮播：scroll-snap 实现，滚动时同步当前页码（等价 swiper bindchange）
function onSwiperScroll() {
  const el = swiperRef.value;
  if (!el) return;
  const index = Math.round(el.scrollLeft / el.clientWidth);
  if (index !== currentSwiper.value) currentSwiper.value = index;
}

function goBack() { wx.navigateBack(); }

async function addToCart() {
  if (!globalData.isUserLoggedIn) {
    wx.showModal({
      title: '提示',
      content: '请先登录才能加入购物车',
      confirmText: '去登录',
      showCancel: false,
      success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/auth/auth' }); }
    });
    return;
  }
  if (!bookId.value || !book.value || !book.value.id) {
    wx.showToast({ title: '商品信息加载不完整', icon: 'none' });
    return;
  }

  wx.showLoading({ title: '添加中...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'addToCart', data: { bookId: book.value.id, quantity: 1 } });
    wx.hideLoading();
    if (res.result && res.result.success) {
      wx.showToast({ title: res.result.message || '成功加入购物车', icon: 'success' });
      globalData.cartNeedRefresh = true;
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '添加失败', icon: 'none' });
    }
  } catch (err) {
    wx.hideLoading();
    console.error('Error calling addToCart cloud function:', err);
    wx.showToast({ title: '请求失败，请重试', icon: 'none' });
  }
}

async function buyNow() {
  if (!globalData.isUserLoggedIn) {
    wx.showModal({
      title: '请先登录',
      content: '登录后才能购买书籍',
      confirmText: '去登录',
      success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/auth/auth' }); }
    });
    return;
  }
  if (!(await requireApproved('确认购买'))) return;
  if (!bookId.value || !book.value || !book.value.id) {
    wx.showToast({ title: '商品信息加载不完整', icon: 'none' });
    return;
  }
  const sellerName = (book.value.sellerInfo && book.value.sellerInfo.nickName) || '校园书友';
  wx.showModal({
    title: '确认购买这本书吗？',
    content: `《${book.value.title}》 · ¥${book.value.price}\n卖家：${sellerName}\n交易方式：校内面交\n\n确认购买不会立即扣款，系统会为你锁定这本书，请尽快与卖家联系完成线下交付。`,
    confirmText: '确认购买',
    cancelText: '再想想',
    success: async res => {
      if (!res.confirm) return;
      wx.showLoading({ title: '正在锁定…', mask: true });
      try {
        const result = await wx.cloud.callFunction({ name: 'confirmPurchase', data: { items: [{ bookId: book.value.id }] } });
        wx.hideLoading();
        if (result.result && result.result.success) {
          wx.showModal({
            title: '已为你锁定',
            content: '这本书已锁定，其他同学暂时无法购买。请通过订单页与卖家约定面交，完成交付后记得确认完成。',
            confirmText: '查看订单',
            cancelText: '继续逛逛',
            success: r => {
              if (r.confirm) wx.navigateTo({ url: '/pages/orderList/orderList' });
              else loadBookDetail(bookId.value);
            }
          });
        } else {
          const message = (result.result && result.result.message) || '锁定失败，请重试';
          wx.showModal({ title: '未能锁定', content: message, showCancel: false, confirmText: '我知道了' });
          loadBookDetail(bookId.value); // 刷新状态（可能已被他人锁定）
        }
      } catch (e) {
        wx.hideLoading();
        wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' });
      }
    }
  });
}

// H5 分享：优先系统分享，退化为复制链接（等价小程序 onShareAppMessage 的触达方式）
function shareBook() {
  const title = book.value && book.value.title ? `推荐给你《${book.value.title}》` : '淘好书，上华农书循环！';
  const url = location.href;
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${title} ${url}`).then(
      () => wx.showToast({ title: '链接已复制，去分享给同学吧', icon: 'none' }),
      () => wx.showToast({ title: '分享失败', icon: 'none' })
    );
  } else {
    wx.showToast({ title: '请复制地址栏链接分享', icon: 'none' });
  }
}
</script>

<style scoped>
.container { padding-bottom: calc(calc(148 * var(--rpx)) + env(safe-area-inset-bottom)); }
.detail-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); background: #f6f5f2; box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; line-height: calc(104 * var(--rpx)); }
.nav-back { position: absolute; left: calc(24 * var(--rpx)); top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.book-main-info-section { overflow: hidden; margin: 0 calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(24 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63,.035); }
.image-container { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: calc(550 * var(--rpx)); background: #faf8f4; }
.image-swiper { display: flex; width: 100%; height: 100%; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
.image-swiper::-webkit-scrollbar { display: none; }
.swiper-slide { width: 100%; height: 100%; flex: none; scroll-snap-align: center; }
.slide-image { width: 100%; height: 100%; object-fit: contain; }
.image-placeholder-block { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: #a4b0a7; font-size: calc(28 * var(--rpx)); }
.image-count { position: absolute; right: calc(22 * var(--rpx)); bottom: calc(18 * var(--rpx)); padding: calc(7 * var(--rpx)) calc(14 * var(--rpx)); border-radius: calc(18 * var(--rpx)); background: rgba(22, 106, 63,.65); color: #fff; font-size: calc(21 * var(--rpx)); }
.meta-info { padding: calc(26 * var(--rpx)) calc(26 * var(--rpx)) calc(28 * var(--rpx)); }
.price-line { display: flex; align-items: baseline; margin-bottom: calc(14 * var(--rpx)); }
.current-price { color: #c98f1b; font-size: calc(50 * var(--rpx)); font-weight: 750; }
.original-price { margin-left: calc(15 * var(--rpx)); color: #9daaa1; font-size: calc(25 * var(--rpx)); text-decoration: line-through; }
.title-author { display: -webkit-box; overflow: hidden; color: #166a3f; font-size: calc(35 * var(--rpx)); font-weight: 750; line-height: 1.36; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.author-name { color: #7a8e82; font-size: calc(26 * var(--rpx)); font-weight: 400; }
.book-tags { display: flex; gap: calc(10 * var(--rpx)); margin-top: calc(15 * var(--rpx)); }
.course-tag, .condition-tag { padding: calc(7 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(7 * var(--rpx)); font-size: calc(21 * var(--rpx)); line-height: 1; }
.course-tag { background: #edf6ef; color: #4d806b; }
.condition-tag { background: #eef7f3; color: #43836d; }
.code-share-line { display: flex; align-items: center; justify-content: space-between; margin-top: calc(19 * var(--rpx)); color: #83998d; font-size: calc(22 * var(--rpx)); }
.share-button { display: flex; align-items: center; justify-content: center; width: calc(116 * var(--rpx)); height: calc(50 * var(--rpx)); margin: 0; padding: 0; border: calc(1 * var(--rpx)) solid #dce8df; border-radius: calc(12 * var(--rpx)); background: #fff; box-sizing: border-box; color: #566f62; font-size: calc(22 * var(--rpx)); line-height: calc(50 * var(--rpx)); }
.book-extra-info-section, .seller-info-section, .book-content-section { width: auto; margin: calc(20 * var(--rpx)) calc(24 * var(--rpx)) 0; padding: calc(25 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-sizing: border-box; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.section-title-detail { position: relative; margin-bottom: calc(19 * var(--rpx)); padding-left: calc(15 * var(--rpx)); color: #166a3f; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.section-title-detail::before { position: absolute; top: calc(6 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(27 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.extra-info-grid { display: flex; flex-wrap: wrap; }
.extra-info-item { width: 50%; padding: calc(9 * var(--rpx)) 0; color: #566f62; font-size: calc(24 * var(--rpx)); box-sizing: border-box; }
.extra-info-label { color: #a5b1a8; }
.extra-info-value { color: #566f62; }
.seller-card { display: flex; align-items: center; }
.seller-avatar, .avatar-placeholder-block { width: calc(72 * var(--rpx)); height: calc(72 * var(--rpx)); margin-right: calc(16 * var(--rpx)); border-radius: 50%; background: #f1f4f0; object-fit: cover; }
.seller-name { color: #2c463b; font-size: calc(26 * var(--rpx)); font-weight: 650; }
.seller-bio { margin-top: calc(6 * var(--rpx)); color: #8b9f91; font-size: calc(21 * var(--rpx)); line-height: 1.4; }
.contact-card { margin-top: calc(18 * var(--rpx)); padding-top: calc(6 * var(--rpx)); border-top: calc(1 * var(--rpx)) dashed #e6ece4; }
.contact-row { display: flex; align-items: center; min-height: calc(76 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f3f6f1; cursor: pointer; }
.contact-row:last-of-type { border-bottom: none; }
.contact-label { width: calc(140 * var(--rpx)); color: #8d98a8; font-size: calc(23 * var(--rpx)); }
.contact-value { flex: 1; min-width: 0; overflow: hidden; color: #2c463b; font-size: calc(26 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.contact-copy { margin-left: calc(10 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #cfe0d3; border-radius: calc(10 * var(--rpx)); color: #4c7a60; font-size: calc(20 * var(--rpx)); }
.contact-meet { display: flex; align-items: flex-start; margin-top: calc(12 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(16 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #f5faf5; }
.contact-meet-label { flex-shrink: 0; margin-right: calc(12 * var(--rpx)); color: #789786; font-size: calc(22 * var(--rpx)); }
.contact-meet-value { flex: 1; min-width: 0; color: #3d594c; font-size: calc(22 * var(--rpx)); line-height: 1.4; }
.contact-locked { margin-top: calc(16 * var(--rpx)); padding: calc(16 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #f7f8f6; }
.contact-locked-text { color: #96a09b; font-size: calc(22 * var(--rpx)); }
.content-text { color: #62786c; font-size: calc(27 * var(--rpx)); line-height: 1.72; white-space: pre-wrap; }
.bottom-actions { position: fixed; bottom: 0; left: 0; z-index: 100; display: flex; width: 100%; max-width: var(--app-max-width); left: 50%; transform: translateX(-50%); padding: calc(17 * var(--rpx)) calc(24 * var(--rpx)); padding-bottom: calc(calc(17 * var(--rpx)) + env(safe-area-inset-bottom)); border-top: calc(1 * var(--rpx)) solid #e8e5df; background: rgba(255,255,255,.98); box-shadow: 0 calc(-7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.04); box-sizing: border-box; }
.action-button { display: flex; flex: 1; align-items: center; justify-content: center; height: calc(76 * var(--rpx)); border-radius: calc(16 * var(--rpx)); font-size: calc(28 * var(--rpx)); font-weight: 700; cursor: pointer; }
.add-to-cart-button { margin-right: calc(15 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dce8df; background: #fff; color: #2c463b; }
.buy-now-button { background: #166a3f; color: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(14 * var(--rpx)) rgba(22, 106, 63,.16); }
.status-action-button { cursor: default; }
.status-locked { background: #f0eeea; color: #8a8a86; }
.status-trading { background: #fdf6e3; color: #b07f16; }
.status-sold { background: #f4f4f2; color: #b3b3ae; }
.own-book-tip { display: flex; flex: 1; align-items: center; justify-content: center; height: calc(76 * var(--rpx)); border-radius: calc(16 * var(--rpx)); background: #f4f6f2; color: #687d71; font-size: calc(25 * var(--rpx)); }
</style>
