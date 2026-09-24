<template>
  <view class="container">
    <view class="page-nav"><text class="page-nav-title">华农书循环</text></view>

    <!-- 运营位轮播：后台可配置标题/副标题/图片/链接/启停/排序；
         「购买说明」作为最后一页跟运营位一起轮播（不再是贴在下面的说明条） -->
    <view class="home-hero banner-carousel" @click="onHeroClick">
      <view class="banner-track" :style="{ transform: `translateX(-${bannerIndex * 100}%)` }">
        <view class="banner-slide" v-for="s in slides" :key="s.id">
          <template v-if="s.kind === 'guide'">
            <img class="hero-illustration" src="/images/hero-book-leaf-optimized.png" />
            <view class="hero-eyebrow">HOW TO BUY</view>
            <view class="hero-content">
              <view>
                <view class="hero-title"><text>购买说明</text></view>
                <view class="hero-subtitle">确认购买不扣款 · 锁单防抢 · 线下交付 ›</view>
              </view>
            </view>
          </template>
          <template v-else>
            <img class="banner-image" v-if="s.imageUrl" :src="s.imageUrl" />
            <img class="hero-illustration" v-else src="/images/hero-book-leaf-optimized.png" />
            <view class="hero-eyebrow">HZAU BOOK CIRCULATION</view>
            <view class="hero-content">
              <view>
                <view class="hero-title"><text>{{ s.title }}</text></view>
                <view class="hero-subtitle">{{ s.subtitle || '狮子山下 · 校内流转 · 书友相遇' }}</view>
              </view>
            </view>
          </template>
        </view>
      </view>
      <view class="banner-dots" v-if="slides.length > 1" @click.stop>
        <text v-for="(s, i) in slides" :key="s.id" class="banner-dot" :class="{ active: i === bannerIndex }" @click="bannerIndex = i"></text>
      </view>
    </view>

    <!-- 核心三入口：卖书 / 买书 / 求购 -->
    <view class="entry-grid">
      <view class="entry-item entry-sell" @click="goEntry('/pages/publish/publish')">
        <text class="entry-icon">📚</text>
        <text class="entry-label">我要卖书</text>
        <text class="entry-desc">拍照识别 极速上架</text>
      </view>
      <view class="entry-item entry-buy" @click="scrollToBrowse">
        <text class="entry-icon">🔍</text>
        <text class="entry-label">我要买书</text>
        <text class="entry-desc">校内教材 即买即得</text>
      </view>
      <view class="entry-item entry-want" @click="goEntry('/pages/publishRequest/publishRequest')">
        <text class="entry-icon">📝</text>
        <text class="entry-label">我要求购</text>
        <text class="entry-desc">发布需求 等书上门</text>
      </view>
    </view>
    <view class="guide-modal-mask" v-if="showBuyGuide" @click="showBuyGuide = false">
      <view class="guide-modal" @click.stop>
        <view class="guide-modal-title">华农书循环购买说明</view>
        <view class="guide-steps">
          <view class="guide-step" v-for="(step, i) in buyGuideSteps" :key="i">
            <text class="guide-step-num">{{ i + 1 }}</text>
            <text class="guide-step-text">{{ step }}</text>
          </view>
        </view>
        <view class="guide-notes">
          <view class="guide-note">· 确认购买不会立即扣款，只是锁定该教材</view>
          <view class="guide-note">· 锁定后其他同学暂时无法购买，避免争抢</view>
          <view class="guide-note">· 订单取消或超时，商品自动恢复可购买</view>
        </view>
        <button class="guide-close" @click="showBuyGuide = false">我知道了</button>
      </view>
    </view>

    <view class="search-section-wrapper">
      <view class="search-section">
        <input class="search-input" v-model="keyword" @keyup.enter="submitSearch" placeholder="书名、作者、课程编号" />
        <view class="search-button" @click="submitSearch"><img class="search-icon" src="/images/search-magnifier-illustrated.png" /></view>
      </view>
    </view>

    <view class="quick-grid">
      <view class="quick-item"><img class="quick-illustration" src="/images/search-book-illustrated.png" /><text class="quick-label">专业找书</text></view>
      <view class="quick-item"><img class="quick-illustration" src="/images/tabbar/sell_illustrated_selected.png" /><text class="quick-label">闲置转让</text></view>
      <view class="quick-item"><img class="quick-illustration" src="/images/order-status/handoff.png" /><text class="quick-label">校内面交</text></view>
    </view>

    <view class="course-match-card">
      <view class="match-heading-row">
        <view class="match-title-group"><view class="match-title">专业年级荐书</view><view class="match-leaf"><view class="match-leaf-one"></view><view class="match-leaf-two"></view></view></view>
        <view class="match-badge">专业 + 年级 · 精准荐书</view>
      </view>
      <view class="match-description">选好你的专业和年级，优先推荐同专业、同年级正在流转的教材。</view>
      <view class="match-controls">
        <view class="course-picker">
          <view class="course-picker-inner">
            <text class="picker-prefix">专业</text>
            <select class="picker-value picker-select" :value="selectedMajorIndex" @change="handleMajorChange">
              <option v-for="(opt, i) in majorOptions" :key="'m' + i" :value="i">{{ opt.label }}</option>
            </select>
            <text class="picker-arrow">⌄</text>
          </view>
        </view>
        <view class="match-control-gap"></view>
        <view class="course-picker">
          <view class="course-picker-inner">
            <text class="picker-prefix">年级</text>
            <select class="picker-value picker-select" :value="selectedGradeIndex" @change="handleGradeChange">
              <option v-for="(opt, i) in gradeOptions" :key="'g' + i" :value="i">{{ opt.label }}</option>
            </select>
            <text class="picker-arrow">⌄</text>
          </view>
        </view>
      </view>
      <view class="match-actions">
        <button class="match-button" :disabled="isMatching" @click="runRecommend">{{ isMatching ? '推荐中…' : '智能荐书' }}</button>
      </view>
      <view class="match-result" v-if="hasRecommended">
        <view class="match-result-caption"><text class="result-dot"></text><text>{{ matchMessage }}</text></view>
        <view class="match-book-list" v-if="matchBooks.length > 0">
          <view class="match-book" v-for="item in matchBooks" :key="item.id" @click="navigateToBookDetail(item.id)">
            <img class="match-cover" :src="item.coverUrl" />
            <view class="match-book-copy"><text class="match-book-title">{{ item.title }}</text><text class="match-book-meta">{{ [item.major, item.grade, item.condition || '在售'].filter(Boolean).join(' · ') }}</text></view>
            <text class="match-book-price">¥{{ item.price }}</text>
          </view>
        </view>
        <view class="course-request-panel" v-if="matchRequests.length > 0">
          <view class="course-request-heading"><view class="request-heading-left"><text class="request-pulse"></text><text>同专业同学正在求购</text></view><text class="request-heading-note">同门互助</text></view>
          <view class="course-request-item" v-for="item in matchRequests" :key="item.id">
            <view class="request-symbol">求</view>
            <view class="request-copy"><text class="request-title">{{ item.title }}</text><text class="request-meta">期望 ¥{{ item.seekingPrice }} · {{ [item.major, item.grade].filter(Boolean).join(' · ') || '校内面交' }}</text></view>
            <view class="request-respond" @click="respondToRequest(item)">我有此书</view>
          </view>
        </view>
        <view class="match-empty" v-if="matchBooks.length === 0 && !isMatching">暂时没有匹配的在售教材，换个专业或年级看看？</view>
      </view>
    </view>

    <view id="homeBrowseSection" class="section best-sellers-section">
      <view class="section-heading"><view class="section-title-cluster"><view class="section-title">本周热选</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view><view class="section-more section-more-link" @click="goToCollection('hot')">热门教材  ›</view></view>
      <view class="scroll-view-horizontal">
        <view class="scroll-item-wrapper" v-for="item in bestsellers" :key="item.id" @click="navigateToBookDetail(item.id)">
          <view class="book-card-horizontal">
            <img class="book-cover-horizontal" :src="item.coverUrl" />
            <view class="book-title-horizontal">{{ item.title }}</view>
            <view class="book-code-horizontal">{{ item.courseCode }}</view>
            <view class="book-price-horizontal">¥{{ item.price }}</view>
          </view>
        </view>
        <view class="empty-inline" v-if="!isLoading && bestsellers.length === 0">暂无热门书籍</view>
      </view>
    </view>

    <view class="section recent-releases-section">
      <view class="section-heading"><view class="section-title-cluster"><view class="section-title">新书上架</view><view class="section-leaf-sprig"><view class="sprig-leaf leaf-one"></view><view class="sprig-leaf leaf-two"></view><view class="sprig-leaf leaf-three"></view></view></view><view class="section-more section-more-link" @click="goToCollection('recent')">发现好书  ›</view></view>
      <view class="release-list">
        <view class="release-item" v-for="item in recentReleases" :key="item.id" @click="navigateToBookDetail(item.id)">
          <img class="release-cover" :src="item.coverUrl" />
          <view class="release-info">
            <view class="release-title">{{ item.title }}</view>
            <view class="release-code">{{ item.courseCode }}</view>
            <view class="release-price-line"><text class="current-price">¥{{ item.price }}</text></view>
          </view>
        </view>
        <view class="empty-state" v-if="!isLoading && recentReleases.length === 0 && !loadFailed">暂时没有在售书籍</view>
        <view class="empty-state retry-state" v-if="loadFailed" @click="retryLoad">加载失败，点击重试</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import * as wx from '../services/wx';
import { MAJORS, GRADES } from '../services/catalog';

defineOptions({ name: 'IndexPage' });

onMounted(() => { fetchHomepageBooks(); fetchBanners(); });
onUnmounted(() => { if (bannerTimer) clearInterval(bannerTimer); });

// 轮播页 = 后台运营位 + 固定追加一页「购买说明」，所以永远至少有一页
const slides = computed(() => [
  ...banners.value.map(b => ({ ...b, kind: 'banner' })),
  { id: '__buy_guide__', kind: 'guide' }
]);

async function fetchBanners() {
  try {
    const res = await wx.cloud.callFunction({ name: 'getBanners' });
    if (res.result && res.result.success && Array.isArray(res.result.data)) {
      banners.value = res.result.data;
    }
  } catch (e) { /* 运营位加载失败不阻塞首页 */ }
  startBannerTimer();
}

// 定时翻页：按 slides 总数取模，避免运营位刷新后下标越界
function startBannerTimer() {
  if (bannerTimer) { clearInterval(bannerTimer); bannerTimer = null; }
  if (slides.value.length <= 1) return;
  bannerTimer = setInterval(() => {
    bannerIndex.value = (bannerIndex.value + 1) % slides.value.length;
  }, 4000);
}

// 点击当前页：购买说明页打开说明弹窗，运营位页走各自配置的链接
function onHeroClick() {
  const s = slides.value[bannerIndex.value];
  if (!s) return;
  if (s.kind === 'guide') { showBuyGuide.value = true; return; }
  if (s.linkUrl) {
    if (/^https?:\/\//.test(s.linkUrl)) window.open(s.linkUrl, '_blank');
    else wx.navigateTo({ url: s.linkUrl });
  }
}

function goEntry(url) { wx.navigateTo({ url }); }

// 「我要买书」不跳第二个页，而是停在当前首页往下划到书市板块（本周热选/新书上架）
function scrollToBrowse() {
  const el = document.getElementById('homeBrowseSection');
  if (el && el.scrollIntoView) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 720, behavior: 'smooth' });
  }
}

const bestsellers = ref([]);
const recentReleases = ref([]);
const keyword = ref('');
const isLoading = ref(false);
const loadFailed = ref(false);
const banners = ref([]);
const bannerIndex = ref(0);
const showBuyGuide = ref(false);
const buyGuideSteps = [
  '浏览教材，找到想要的书',
  '点击「确认购买」',
  '系统锁定该教材（不会扣款）',
  '卖家收到购买通知',
  '双方联系确认交易方式',
  '完成线下交付',
  '交易完成'
];
let bannerTimer = null;
// 专业年级荐书（核心检索维度：专业 + 年级）
const majorOptions = ref([{ label: '专业不限', value: '' }]);
const gradeOptions = ref([{ label: '年级不限', value: '' }]);
const selectedMajorIndex = ref(0);
const selectedGradeIndex = ref(0);
const selectedMajor = ref('');
const selectedGrade = ref('');
const matchBooks = ref([]);
const allRequests = ref([]);
const matchRequests = ref([]);
const matchMessage = ref('选好专业和年级，看看同门师兄弟都在流转什么书');
const isMatching = ref(false);
const hasRecommended = ref(false);

let homepageBooks = [];

async function fetchHomepageBooks(showLoading = true) {
  if (isLoading.value) return;
  isLoading.value = true;
  loadFailed.value = false;
  if (showLoading) wx.showLoading({ title: '加载中...', mask: true });
  try {
    const res = await wx.cloud.callFunction({ name: 'getBooksForHomepage' });
    if (showLoading) wx.hideLoading();
    if (res.result && res.result.success && res.result.data) {
      const bs = res.result.data.bestsellers || [];
      const rr = res.result.data.recentReleases || [];
      let requests = [];
      try {
        const seekingRes = await wx.cloud.callFunction({ name: 'getSeekingPosts', data: { page: 1, pageSize: 30 } });
        if (seekingRes.result && seekingRes.result.success) requests = seekingRes.result.data || [];
      } catch (requestError) {
        console.warn('[Homepage] unable to load course requests:', requestError);
      }
      bestsellers.value = bs;
      recentReleases.value = rr;
      allRequests.value = requests;
      loadFailed.value = false;
      prepareRecommendMatcher(bs, rr, requests);
    } else {
      wx.showToast({ title: (res.result && res.result.message) || '加载首页数据失败', icon: 'none', duration: 2000 });
      loadFailed.value = true;
    }
  } catch (err) {
    if (showLoading) wx.hideLoading();
    console.error('Error calling getBooksForHomepage cloud function (catch block):', err);
    wx.showToast({ title: '网络请求失败，请稍后重试', icon: 'none', duration: 2000 });
    loadFailed.value = true;
  } finally {
    isLoading.value = false;
  }
}

function navigateToBookDetail(bookId) {
  if (!bookId) {
    wx.showToast({ title: '无法打开书籍详情', icon: 'none' });
    return;
  }
  wx.navigateTo({ url: '/pages/bookDetail/bookDetail?id=' + bookId });
}

// 汇总首页在售书，并把专业/年级目录与现有数据合并（用户实际填写的值一并可选）
function prepareRecommendMatcher(bs, rr, requests = []) {
  const allBooks = [];
  const seenBookIds = new Set();
  [...bs, ...rr].forEach(book => {
    if (book && book.id && !seenBookIds.has(book.id)) {
      seenBookIds.add(book.id);
      allBooks.push(book);
    }
  });
  homepageBooks = allBooks;

  const majorSet = new Set(MAJORS);
  const gradeSet = new Set(GRADES);
  const absorb = item => {
    const m = String(item.major || '').trim();
    if (m) majorSet.add(m);
    const g = String(item.grade || '').trim();
    if (g) gradeSet.add(g);
  };
  allBooks.forEach(absorb);
  (requests || []).forEach(absorb);

  majorOptions.value = [{ label: '专业不限', value: '' }, ...Array.from(majorSet).map(m => ({ label: m, value: m }))];
  gradeOptions.value = [{ label: '年级不限', value: '' }, ...Array.from(gradeSet).map(g => ({ label: g, value: g }))];
  selectedMajorIndex.value = Math.max(majorOptions.value.findIndex(o => o.value === selectedMajor.value), 0);
  selectedGradeIndex.value = Math.max(gradeOptions.value.findIndex(o => o.value === selectedGrade.value), 0);
  matchBooks.value = [];
  matchRequests.value = [];
  hasRecommended.value = false;
}

function handleMajorChange(event) {
  const index = Number(event.target.value) || 0;
  selectedMajorIndex.value = index;
  selectedMajor.value = (majorOptions.value[index] && majorOptions.value[index].value) || '';
}

function handleGradeChange(event) {
  const index = Number(event.target.value) || 0;
  selectedGradeIndex.value = index;
  selectedGrade.value = (gradeOptions.value[index] && gradeOptions.value[index].value) || '';
}

function localMatchBooks(major, grade) {
  const pick = (m, g) => (homepageBooks || []).filter(book =>
    (!m || String(book.major || '') === m) && (!g || String(book.grade || '') === g));
  if (major && grade) { const r = pick(major, grade); if (r.length) return r; }
  if (major) { const r = pick(major, ''); if (r.length) return r; }
  if (grade) { const r = pick('', grade); if (r.length) return r; }
  return [];
}

function localMatchRequests(major, grade) {
  const pick = (m, g) => (allRequests.value || []).filter(item =>
    (!m || String(item.major || '') === m) && (!g || String(item.grade || '') === g));
  if (major && grade) { const r = pick(major, grade); if (r.length) return r; }
  if (major) { const r = pick(major, ''); if (r.length) return r; }
  if (grade) { const r = pick('', grade); if (r.length) return r; }
  return [];
}

async function runRecommend() {
  if (isMatching.value) return;
  const major = selectedMajor.value;
  const grade = selectedGrade.value;
  if (!major && !grade) {
    wx.showToast({ title: '请先选择专业或年级', icon: 'none' });
    return;
  }
  isMatching.value = true;
  hasRecommended.value = true;
  matchBooks.value = [];
  matchRequests.value = [];
  matchMessage.value = '正在为你精选教材…';

  // 优先「专业 + 年级」精确匹配，其次专业、再次年级，逐级放宽
  const attempts = [];
  if (major && grade) attempts.push({ major, grade });
  if (major) attempts.push({ major, grade: '' });
  if (grade) attempts.push({ major: '', grade });

  let matches = [];
  let used = null;
  let total = 0;
  try {
    for (const q of attempts) {
      const res = await wx.cloud.callFunction({
        name: 'getBooks',
        data: { type: 'recent', major: q.major, grade: q.grade, page: 1, pageSize: 3 }
      });
      const result = res.result;
      if (!result || !result.success) throw new Error('荐书服务未返回结果');
      const data = result.data || [];
      if (data.length) {
        matches = data;
        used = q;
        total = Number(result.pagination && result.pagination.totalItems) || data.length;
        break;
      }
    }
  } catch (error) {
    console.warn('[Homepage] recommend fallback:', error);
    matches = localMatchBooks(major, grade);
    used = matches.length ? { major, grade } : null;
    total = matches.length;
  }

  isMatching.value = false;
  matchBooks.value = matches.slice(0, 3);
  matchRequests.value = localMatchRequests(major, grade).slice(0, 2);

  if (!matches.length) {
    matchMessage.value = '暂时没有匹配的在售教材，换个专业或年级试试';
  } else if (used && used.major && used.grade) {
    matchMessage.value = `已为「${used.major} · ${used.grade}」推荐 ${total} 本在售教材`;
  } else if (used && used.major) {
    matchMessage.value = `同年级暂无在售，先推荐「${used.major}」的 ${total} 本教材`;
  } else {
    matchMessage.value = `已为「${used.grade}」推荐 ${total} 本在售教材`;
  }
}

function respondToRequest(item) {
  const title = (item && item.title) || '';
  const major = (item && item.major) || selectedMajor.value;
  const grade = (item && item.grade) || selectedGrade.value;
  wx.showModal({
    title: '回应同学求购',
    content: `发布一本教材，系统会自动带入${major || '专业'}${grade ? ' · ' + grade : ''}的信息。`,
    confirmText: '去发布',
    success: result => {
      if (!result.confirm) return;
      const params = [];
      if (title) params.push('title=' + encodeURIComponent(title));
      if (major) params.push('major=' + encodeURIComponent(major));
      if (grade) params.push('grade=' + encodeURIComponent(grade));
      params.push('fromRequest=1');
      wx.navigateTo({ url: `/pages/publish/publish?${params.join('&')}` });
    }
  });
}

function submitSearch() {
  const kw = keyword.value.trim();
  if (!kw) {
    wx.showToast({ title: '请输入书名、课程号或作者', icon: 'none' });
    return;
  }
  wx.navigateTo({ url: `/pages/search/search?keyword=${encodeURIComponent(kw)}` });
}

function goToCollection(collection) {
  if (!['hot', 'recent'].includes(collection)) return;
  wx.navigateTo({ url: `/pages/search/search?collection=${collection}` });
}

function retryLoad() { fetchHomepageBooks(); }
</script>

<style scoped>
.banner-carousel { padding: 0; }
.banner-track { display: flex; height: 100%; transition: transform .45s ease; }
.banner-slide { position: relative; flex: 0 0 100%; min-height: calc(182 * var(--rpx)); padding: calc(30 * var(--rpx)) calc(32 * var(--rpx)) calc(28 * var(--rpx)); box-sizing: border-box; }
.banner-image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .35; }
.banner-dots { position: absolute; right: calc(28 * var(--rpx)); bottom: calc(18 * var(--rpx)); z-index: 3; display: flex; gap: calc(10 * var(--rpx)); }
.banner-dot { width: calc(12 * var(--rpx)); height: calc(12 * var(--rpx)); border-radius: 50%; background: rgba(255,255,255,.45); cursor: pointer; }
.banner-dot.active { width: calc(28 * var(--rpx)); border-radius: calc(7 * var(--rpx)); background: #e8c270; }
.entry-grid { display: flex; gap: calc(16 * var(--rpx)); margin-top: calc(22 * var(--rpx)); }
.entry-item { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; min-width: 0; padding: calc(24 * var(--rpx)) calc(8 * var(--rpx)) calc(20 * var(--rpx)); border-radius: calc(20 * var(--rpx)); background: #fff; border: calc(1 * var(--rpx)) solid #ebe8e2; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22,106,63,.035); cursor: pointer; text-align: center; }
.entry-icon { display: flex; align-items: center; justify-content: center; width: calc(76 * var(--rpx)); height: calc(76 * var(--rpx)); margin-bottom: calc(12 * var(--rpx)); border-radius: calc(22 * var(--rpx)); font-size: calc(40 * var(--rpx)); line-height: 1; }
.entry-sell .entry-icon { background: #e8f3ec; }
.entry-buy .entry-icon { background: #fdf6e3; }
.entry-want .entry-icon { background: #eef4f8; }
.entry-label { color: #29443a; font-size: calc(26 * var(--rpx)); font-weight: 750; }
.entry-desc { margin-top: calc(6 * var(--rpx)); color: #9aa89e; font-size: calc(19 * var(--rpx)); white-space: nowrap; }
.guide-modal-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: calc(40 * var(--rpx)); background: rgba(30,42,36,.5); box-sizing: border-box; }
.guide-modal { width: 100%; max-width: calc(620 * var(--rpx)); max-height: 80vh; overflow-y: auto; padding: calc(34 * var(--rpx)) calc(30 * var(--rpx)); border-radius: calc(24 * var(--rpx)); background: #fff; }
.guide-modal-title { color: #166a3f; font-size: calc(32 * var(--rpx)); font-weight: 750; text-align: center; }
.guide-steps { margin-top: calc(24 * var(--rpx)); }
.guide-step { display: flex; align-items: center; padding: calc(10 * var(--rpx)) 0; }
.guide-step-num { display: flex; align-items: center; justify-content: center; width: calc(40 * var(--rpx)); height: calc(40 * var(--rpx)); margin-right: calc(16 * var(--rpx)); border-radius: 50%; background: #e8f3ec; color: #166a3f; font-size: calc(22 * var(--rpx)); font-weight: 750; flex: none; }
.guide-step-text { color: #3d594c; font-size: calc(25 * var(--rpx)); }
.guide-notes { margin-top: calc(20 * var(--rpx)); padding: calc(18 * var(--rpx)); border-radius: calc(14 * var(--rpx)); background: #fdf8ea; }
.guide-note { color: #9a7a38; font-size: calc(21 * var(--rpx)); line-height: 1.7; }
.guide-close { width: 100%; height: calc(80 * var(--rpx)); margin: calc(24 * var(--rpx)) 0 0; border: 0; border-radius: calc(40 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(27 * var(--rpx)); font-weight: 700; cursor: pointer; }
.container { padding: 0 calc(24 * var(--rpx)) calc(32 * var(--rpx)); }
.page-nav { display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.page-nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; letter-spacing: calc(1 * var(--rpx)); }
.home-hero { position: relative; min-height: calc(182 * var(--rpx)); margin-top: calc(8 * var(--rpx)); padding: calc(30 * var(--rpx)) calc(32 * var(--rpx)) calc(28 * var(--rpx)); border-radius: calc(26 * var(--rpx)); background: linear-gradient(135deg, #166a3f 0%, #2c7d4e 100%); box-shadow: 0 calc(16 * var(--rpx)) calc(28 * var(--rpx)) rgba(22, 106, 63, .16); overflow: hidden; box-sizing: border-box; }
.home-hero::before { position: absolute; right: calc(-90 * var(--rpx)); bottom: calc(-118 * var(--rpx)); width: calc(338 * var(--rpx)); height: calc(338 * var(--rpx)); border: calc(1 * var(--rpx)) solid rgba(255,255,255,.16); border-radius: 50%; background: rgba(255,255,255,.055); content: ''; }
.home-hero::after { position: absolute; top: calc(24 * var(--rpx)); right: calc(64 * var(--rpx)); width: calc(62 * var(--rpx)); height: calc(62 * var(--rpx)); border: calc(1 * var(--rpx)) solid rgba(232,194,112,.48); border-radius: 50%; content: ''; }
.hero-illustration { position: absolute; right: calc(-6 * var(--rpx)); bottom: calc(-8 * var(--rpx)); z-index: 1; width: calc(222 * var(--rpx)); height: calc(184 * var(--rpx)); opacity: .98; }
.hero-eyebrow { position: relative; z-index: 2; color: #e8c270; font-size: calc(18 * var(--rpx)); font-weight: 750; letter-spacing: calc(1.6 * var(--rpx)); }
.hero-content { position: relative; z-index: 2; width: calc(390 * var(--rpx)); margin-top: calc(13 * var(--rpx)); }
.hero-title { color: #fff; font-size: calc(36 * var(--rpx)); font-weight: 750; letter-spacing: calc(.5 * var(--rpx)); line-height: 1.35; }
.hero-title text { display: block; }
.hero-subtitle { margin-top: calc(11 * var(--rpx)); color: #d8e4da; font-size: calc(22 * var(--rpx)); letter-spacing: calc(.4 * var(--rpx)); }
.search-section-wrapper { margin-top: calc(22 * var(--rpx)); }
.search-section { display: flex; align-items: center; height: calc(88 * var(--rpx)); padding-left: calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e9e7e2; border-radius: calc(18 * var(--rpx)); background: #fff; box-shadow: 0 calc(6 * var(--rpx)) calc(16 * var(--rpx)) rgba(22, 106, 63, .04); }
.search-input { flex: 1; height: calc(88 * var(--rpx)); color: #3d594c; font-size: calc(27 * var(--rpx)); }
.search-button { display: flex; align-items: center; justify-content: center; width: calc(94 * var(--rpx)); height: calc(88 * var(--rpx)); cursor: pointer; }
.search-icon { width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); opacity: 1; }
.quick-grid { display: flex; align-items: flex-start; margin: calc(19 * var(--rpx)) calc(4 * var(--rpx)) calc(28 * var(--rpx)); padding: calc(2 * var(--rpx)) 0; background: transparent; }
.quick-item { position: relative; display: flex; flex: 1; flex-direction: column; align-items: center; min-width: 0; padding: calc(2 * var(--rpx)) 0 calc(1 * var(--rpx)); text-align: center; }
.quick-item:not(:last-child)::after { position: absolute; top: calc(16 * var(--rpx)); right: calc(-8 * var(--rpx)); z-index: 1; color: #d9a62e; content: '›'; font-size: calc(29 * var(--rpx)); font-weight: 600; line-height: 1; }
.quick-illustration { width: calc(58 * var(--rpx)); height: calc(58 * var(--rpx)); }
.quick-label { width: 100%; margin-top: calc(2 * var(--rpx)); color: #3e6e59; font-size: calc(22 * var(--rpx)); font-weight: 700; line-height: 1.25; text-align: center; }
.section-more-link { padding: calc(8 * var(--rpx)) 0 calc(8 * var(--rpx)) calc(12 * var(--rpx)); margin: calc(-8 * var(--rpx)) 0; cursor: pointer; }
.course-match-card { position: relative; margin: calc(-6 * var(--rpx)) 0 calc(26 * var(--rpx)); padding: calc(24 * var(--rpx)) calc(22 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dce9de; border-radius: calc(24 * var(--rpx)); background: linear-gradient(135deg, #f8fcf7 0%, #eef7ef 100%); box-shadow: 0 calc(9 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63, .06); overflow: hidden; }
.course-match-card::after { position: absolute; right: calc(-32 * var(--rpx)); bottom: calc(-52 * var(--rpx)); width: calc(160 * var(--rpx)); height: calc(160 * var(--rpx)); border: calc(1 * var(--rpx)) solid rgba(74,135,108,.13); border-radius: 50%; content: ''; }
.match-heading-row, .match-title-group, .match-controls, .course-picker-inner, .match-result-caption, .match-book { display: flex; align-items: center; }
.match-heading-row { position: relative; z-index: 1; justify-content: space-between; }
.match-title-group { min-width: 0; }
.match-title { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.match-leaf { position: relative; width: calc(34 * var(--rpx)); height: calc(28 * var(--rpx)); margin-left: calc(9 * var(--rpx)); }
.match-leaf::before { position: absolute; top: calc(5 * var(--rpx)); left: calc(15 * var(--rpx)); width: calc(2 * var(--rpx)); height: calc(20 * var(--rpx)); border-radius: calc(2 * var(--rpx)); background: #79a470; content: ''; transform: rotate(-35deg); }
.match-leaf-one, .match-leaf-two { position: absolute; width: calc(13 * var(--rpx)); height: calc(8 * var(--rpx)); border-radius: calc(13 * var(--rpx)) 0 calc(13 * var(--rpx)) 0; background: #9fc493; transform: rotate(-30deg); }
.match-leaf-one { top: calc(4 * var(--rpx)); left: calc(3 * var(--rpx)); }
.match-leaf-two { top: calc(13 * var(--rpx)); left: calc(16 * var(--rpx)); background: #e8c270; transform: rotate(30deg); }
.match-badge { padding: calc(7 * var(--rpx)) calc(11 * var(--rpx)); border-radius: calc(13 * var(--rpx)); background: #fff; color: #5b876e; font-size: calc(19 * var(--rpx)); line-height: 1; box-shadow: 0 calc(3 * var(--rpx)) calc(9 * var(--rpx)) rgba(22,106,63,.05); }
.match-description { position: relative; z-index: 1; margin-top: calc(10 * var(--rpx)); color: #718b7c; font-size: calc(21 * var(--rpx)); line-height: 1.55; }
.match-controls { position: relative; z-index: 1; margin-top: calc(17 * var(--rpx)); }
.course-picker { flex: 1; min-width: 0; }
.course-picker-inner { height: calc(68 * var(--rpx)); padding: 0 calc(15 * var(--rpx)); border: calc(1 * var(--rpx)) solid #d5e5d7; border-radius: calc(14 * var(--rpx)); background: rgba(255,255,255,.86); box-sizing: border-box; }
.picker-prefix { padding-right: calc(9 * var(--rpx)); color: #91a79a; font-size: calc(20 * var(--rpx)); flex: none; }
.picker-value { overflow: hidden; flex: 1; color: #386d58; font-size: calc(23 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.picker-select { min-width: 0; cursor: pointer; appearance: none; }
.picker-select option { color: #386d58; font-weight: 400; }
.picker-arrow { margin-left: calc(7 * var(--rpx)); color: #789a84; font-size: calc(26 * var(--rpx)); line-height: 1; }
.match-control-gap { width: calc(32 * var(--rpx)); height: calc(1 * var(--rpx)); flex: none; }
.match-actions { position: relative; z-index: 1; margin-top: calc(14 * var(--rpx)); }
.match-button { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(72 * var(--rpx)); margin: 0; border-radius: calc(14 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(24 * var(--rpx)); font-weight: 700; line-height: 1.2 !important; box-shadow: 0 calc(7 * var(--rpx)) calc(14 * var(--rpx)) rgba(22,106,63,.16); cursor: pointer; }
.match-button[disabled] { opacity: .7; }
.match-result { position: relative; z-index: 1; margin-top: calc(18 * var(--rpx)); padding-top: calc(16 * var(--rpx)); border-top: calc(1 * var(--rpx)) dashed #cee0d1; }
.match-result-caption { color: #56806a; font-size: calc(21 * var(--rpx)); line-height: 1.35; }
.result-dot { width: calc(9 * var(--rpx)); height: calc(9 * var(--rpx)); margin-right: calc(8 * var(--rpx)); border-radius: 50%; background: #d9a62e; flex: none; }
.match-book-list { margin-top: calc(12 * var(--rpx)); }
.match-book { min-height: calc(82 * var(--rpx)); padding: calc(9 * var(--rpx)) 0; cursor: pointer; }
.match-cover { width: calc(58 * var(--rpx)); height: calc(76 * var(--rpx)); margin-right: calc(13 * var(--rpx)); border-radius: calc(9 * var(--rpx)); background: #e4eee5; flex: none; object-fit: cover; }
.match-book-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.match-book-title { overflow: hidden; color: #2f5848; font-size: calc(24 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.match-book-meta { margin-top: calc(7 * var(--rpx)); color: #91a69a; font-size: calc(19 * var(--rpx)); }
.match-book-price { margin-left: calc(12 * var(--rpx)); color: #c98f1b; font-size: calc(26 * var(--rpx)); font-weight: 750; }
.course-request-panel { margin-top: calc(13 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(15 * var(--rpx)) calc(10 * var(--rpx)); border: calc(1 * var(--rpx)) solid #f0dfb7; border-radius: calc(16 * var(--rpx)); background: rgba(255,251,239,.92); }
.course-request-heading, .request-heading-left, .course-request-item { display: flex; align-items: center; }
.course-request-heading { justify-content: space-between; color: #9a7a38; font-size: calc(20 * var(--rpx)); }
.request-heading-left { font-weight: 650; }
.request-pulse { width: calc(8 * var(--rpx)); height: calc(8 * var(--rpx)); margin-right: calc(8 * var(--rpx)); border-radius: 50%; background: #d9a62e; box-shadow: 0 0 0 calc(5 * var(--rpx)) rgba(217,166,46,.12); flex: none; }
.request-heading-note { color: #b39762; font-size: calc(18 * var(--rpx)); }
.course-request-item { min-height: calc(70 * var(--rpx)); margin-top: calc(10 * var(--rpx)); padding-top: calc(10 * var(--rpx)); border-top: calc(1 * var(--rpx)) solid rgba(224,199,135,.48); }
.request-symbol { display: flex; align-items: center; justify-content: center; width: calc(39 * var(--rpx)); height: calc(39 * var(--rpx)); margin-right: calc(10 * var(--rpx)); border-radius: calc(11 * var(--rpx)); background: #f7ddb0; color: #aa7842; font-size: calc(20 * var(--rpx)); font-weight: 750; flex: none; }
.request-copy { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.request-title { overflow: hidden; color: #735c37; font-size: calc(22 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.request-meta { margin-top: calc(5 * var(--rpx)); color: #aa9671; font-size: calc(18 * var(--rpx)); }
.request-respond { display: flex; align-items: center; justify-content: center; min-width: calc(106 * var(--rpx)); height: calc(48 * var(--rpx)); margin-left: calc(10 * var(--rpx)); padding: 0 calc(10 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #fff; color: #a26f36; font-size: calc(20 * var(--rpx)); font-weight: 700; box-shadow: 0 calc(4 * var(--rpx)) calc(10 * var(--rpx)) rgba(154,122,56,.10); cursor: pointer; flex: none; }
.match-empty { margin-top: calc(12 * var(--rpx)); color: #9aaea0; font-size: calc(21 * var(--rpx)); line-height: 1.5; }
.section { margin-bottom: calc(24 * var(--rpx)); padding: calc(26 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(24 * var(--rpx)); background: #fff; box-shadow: 0 calc(8 * var(--rpx)) calc(22 * var(--rpx)) rgba(22, 106, 63, .035); }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: calc(20 * var(--rpx)); }
.section-title { position: relative; padding-left: calc(16 * var(--rpx)); color: #166a3f; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.section-title::before { position: absolute; top: calc(7 * var(--rpx)); left: 0; width: calc(6 * var(--rpx)); height: calc(29 * var(--rpx)); border-radius: calc(4 * var(--rpx)); background: #d9a62e; content: ''; }
.section-title-cluster { display: flex; align-items: center; min-width: 0; }
.section-leaf-sprig { position: relative; width: calc(40 * var(--rpx)); height: calc(30 * var(--rpx)); margin-left: calc(9 * var(--rpx)); flex: none; }
.section-leaf-sprig::before { position: absolute; top: calc(5 * var(--rpx)); left: calc(18 * var(--rpx)); width: calc(2 * var(--rpx)); height: calc(23 * var(--rpx)); border-radius: calc(2 * var(--rpx)); background: #87ae7e; content: ''; transform: rotate(-36deg); transform-origin: bottom; }
.sprig-leaf { position: absolute; width: calc(14 * var(--rpx)); height: calc(8 * var(--rpx)); border-radius: calc(14 * var(--rpx)) 0 calc(14 * var(--rpx)) 0; background: #b8d3ab; transform: rotate(-34deg); }
.leaf-one { top: calc(3 * var(--rpx)); left: calc(5 * var(--rpx)); }
.leaf-two { top: calc(12 * var(--rpx)); left: calc(18 * var(--rpx)); background: #d5e5c8; transform: rotate(29deg); }
.leaf-three { top: calc(20 * var(--rpx)); left: calc(5 * var(--rpx)); width: calc(11 * var(--rpx)); height: calc(7 * var(--rpx)); background: #e8c270; transform: rotate(-22deg); }
.section-more { display: flex; align-items: center; height: calc(38 * var(--rpx)); color: #a4b0a7; font-size: calc(22 * var(--rpx)); line-height: 1; }
.scroll-view-horizontal { width: 100%; white-space: nowrap; font-size: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
.scroll-view-horizontal::-webkit-scrollbar { display: none; }
.scroll-item-wrapper { display: inline-block; margin-right: calc(16 * var(--rpx)); vertical-align: top; font-size: calc(28 * var(--rpx)); cursor: pointer; }
.scroll-item-wrapper:last-child { margin-right: 0; }
.book-card-horizontal { display: flex; flex-direction: column; width: calc(198 * var(--rpx)); min-height: calc(336 * var(--rpx)); padding: calc(12 * var(--rpx)); border-radius: calc(15 * var(--rpx)); background: #faf9f6; box-sizing: border-box; }
.book-cover-horizontal { width: calc(174 * var(--rpx)); height: calc(214 * var(--rpx)); border-radius: calc(10 * var(--rpx)); background: #eff3ef; object-fit: cover; }
.book-title-horizontal { overflow: hidden; margin-top: calc(12 * var(--rpx)); color: #2c463b; font-size: calc(25 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.book-code-horizontal { margin-top: calc(7 * var(--rpx)); color: #9aa89e; font-size: calc(21 * var(--rpx)); }
.book-price-horizontal { margin-top: auto; padding-top: calc(8 * var(--rpx)); color: #c98f1b; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.release-list { margin-top: calc(-4 * var(--rpx)); }
.release-item { display: flex; align-items: stretch; padding: calc(20 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f0eeea; cursor: pointer; }
.release-item:last-child { padding-bottom: 0; border-bottom: 0; }
.release-cover { width: calc(130 * var(--rpx)); height: calc(170 * var(--rpx)); margin-right: calc(20 * var(--rpx)); border-radius: calc(12 * var(--rpx)); background: #eff3ef; flex-shrink: 0; object-fit: cover; }
.release-info { display: flex; flex: 1; flex-direction: column; padding: calc(3 * var(--rpx)) 0; min-width: 0; }
.release-title { display: -webkit-box; overflow: hidden; color: #294438; font-size: calc(29 * var(--rpx)); font-weight: 650; line-height: 1.4; text-overflow: ellipsis; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.release-code { align-self: flex-start; margin-top: calc(11 * var(--rpx)); padding: calc(4 * var(--rpx)) calc(10 * var(--rpx)); border-radius: calc(6 * var(--rpx)); background: #f4f6f2; color: #90a095; font-size: calc(21 * var(--rpx)); }
.release-price-line { margin-top: auto; }
.current-price { color: #c98f1b; font-size: calc(32 * var(--rpx)); font-weight: 750; }
.empty-inline, .empty-state { padding: calc(40 * var(--rpx)) 0; color: #9daaa1; font-size: calc(25 * var(--rpx)); text-align: center; }
.retry-state { color: #c98f1b; cursor: pointer; }
</style>
