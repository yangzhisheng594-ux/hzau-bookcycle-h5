<template>
  <view class="page-wrap">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">{{ pageTitle }}</text></view>
    <view class="search-bar"><input v-model="keyword" placeholder="输入书名、作者或课程编号" @keyup.enter="search" /><view class="search-action" @click="search">搜索</view></view>
    <view class="result-count" v-if="hasSearched && !isLoading">为你找到 {{ total }} 本相关书籍</view>
    <view class="book-list" v-if="books.length">
      <view class="book-card" v-for="item in books" :key="item.id" @click="openDetail(item.id)">
        <img class="cover" v-if="item.coverUrl" :src="item.coverUrl" />
        <view class="cover placeholder" v-else>暂无封面</view>
        <view class="book-info"><view class="title">{{ item.title }}</view><view class="meta" v-if="item.author">{{ item.author }}</view><view class="course" v-if="item.courseCode">{{ item.courseCode }}</view><view class="price">¥{{ item.price }}</view></view>
      </view>
    </view>
    <view class="status" v-if="isLoading">正在寻找好书…</view>
    <view class="status" v-else-if="hasSearched && books.length === 0">没有找到相关书籍</view>
    <view class="status retry" v-if="loadFailed" @click="search">加载失败，点击重试</view>
    <view class="footer" v-if="hasMore && !isLoading" @click="loadMore">加载更多</view>
  </view>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';

const route = useRoute();
const keyword = ref('');
const books = ref([]);
const page = ref(1);
const pageSize = 12;
const total = ref(0);
const hasMore = ref(false);
const hasSearched = ref(false);
const isLoading = ref(false);
const loadFailed = ref(false);
const collection = ref('');
const pageTitle = ref('搜索书籍');

onMounted(() => {
  const kw = String(route.query.keyword || '').trim();
  const col = ['hot', 'recent'].includes(route.query.collection) ? route.query.collection : '';
  pageTitle.value = col === 'hot' ? '热门教材' : col === 'recent' ? '新书上架' : '搜索书籍';
  keyword.value = kw;
  collection.value = col;
  if (kw || col) loadBooks(true);
  window.addEventListener('scroll', onReachBottom, { passive: true });
});

onUnmounted(() => window.removeEventListener('scroll', onReachBottom));

function search() {
  const kw = keyword.value.trim();
  if (kw) { collection.value = ''; pageTitle.value = '搜索书籍'; }
  if (!kw && !collection.value) {
    wx.showToast({ title: '请输入搜索关键词', icon: 'none' });
    return;
  }
  loadBooks(true);
}

async function loadBooks(reset = false) {
  if (isLoading.value || (!reset && !hasMore.value)) return;
  const pageToLoad = reset ? 1 : page.value + 1;
  isLoading.value = true;
  loadFailed.value = false;
  try {
    const kw = keyword.value.trim();
    const type = kw ? 'search' : collection.value === 'hot' ? 'bestseller' : 'recent';
    const res = await wx.cloud.callFunction({
      name: 'getBooks',
      data: { type, searchKeyword: kw, page: pageToLoad, pageSize }
    });
    if (!res.result || !res.result.success) throw new Error((res.result && res.result.message) || '搜索失败');
    const result = res.result;
    books.value = reset ? result.data : books.value.concat(result.data || []);
    page.value = pageToLoad;
    total.value = result.pagination.totalItems || 0;
    hasMore.value = Boolean(result.pagination.hasMore);
    hasSearched.value = true;
  } catch (error) {
    console.error('[SearchPage] loadBooks failed:', error);
    hasSearched.value = true;
    loadFailed.value = true;
    wx.showToast({ title: (error && error.message) || '搜索失败，请重试', icon: 'none' });
  } finally {
    isLoading.value = false;
  }
}

function loadMore() { loadBooks(false); }
function onReachBottom() {
  const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
  if (nearBottom) loadBooks(false);
}
function goBack() { wx.navigateBack(); }
function openDetail(id) { wx.navigateTo({ url: `/pages/bookDetail/bookDetail?id=${id}` }); }
</script>

<style scoped>
.page-wrap { padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.search-bar { display: flex; align-items: center; height: calc(82 * var(--rpx)); padding-left: calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e7e4de; border-radius: calc(17 * var(--rpx)); background: #fff; box-shadow: 0 calc(6 * var(--rpx)) calc(15 * var(--rpx)) rgba(22, 106, 63,.035); }
.search-bar input { flex: 1; min-height: calc(82 * var(--rpx)); color: #2c463b; font-size: calc(26 * var(--rpx)); min-width: 0; }
.search-action { display: flex; align-items: center; justify-content: center; width: calc(92 * var(--rpx)); height: calc(60 * var(--rpx)); margin-right: calc(10 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(24 * var(--rpx)); font-weight: 650; cursor: pointer; flex: none; }
.result-count { padding: calc(22 * var(--rpx)) calc(4 * var(--rpx)) calc(12 * var(--rpx)); color: #7f9186; font-size: calc(23 * var(--rpx)); }
.book-list { padding: 0 calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(20 * var(--rpx)) rgba(22, 106, 63,.03); }
.book-card { display: flex; padding: calc(20 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; cursor: pointer; }
.book-card:last-child { border-bottom: 0; }
.cover { width: calc(124 * var(--rpx)); height: calc(164 * var(--rpx)); border-radius: calc(11 * var(--rpx)); background: #eff3ef; flex: none; object-fit: cover; }
.placeholder { display: flex; align-items: center; justify-content: center; color: #94a3b8; font-size: calc(21 * var(--rpx)); }
.book-info { display: flex; flex: 1; flex-direction: column; min-width: 0; padding: calc(3 * var(--rpx)) 0 calc(2 * var(--rpx)) calc(18 * var(--rpx)); }
.title { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(28 * var(--rpx)); font-weight: 650; line-height: 1.42; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.meta { margin-top: calc(9 * var(--rpx)); color: #7a8e82; font-size: calc(22 * var(--rpx)); }
.course { align-self: flex-start; margin-top: calc(9 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(9 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #f3f5f1; color: #8f9f94; font-size: calc(20 * var(--rpx)); }
.price { margin-top: auto; color: #c98f1b; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.status, .footer { padding: calc(72 * var(--rpx)) 0; color: #9daaa1; font-size: calc(26 * var(--rpx)); text-align: center; }
.retry, .footer { color: #b07f16; cursor: pointer; }
.footer { padding: calc(26 * var(--rpx)) 0; }
</style>
