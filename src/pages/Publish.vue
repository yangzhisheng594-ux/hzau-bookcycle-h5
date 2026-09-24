<template>
  <view class="container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">{{ bookId ? '编辑书籍' : '发布一本书' }}</text></view>
    <form @submit.prevent="submitForm">
      <view class="form-intro">
        <view class="intro-title">系统负责识别，你负责确认</view>
        <view class="intro-desc">拍照 / 扫码自动带出教材信息，填个价格就能上架，30 秒发一本书。</view>
      </view>

      <!-- 第一步：上传教材（拍照 / 相册 / 扫码 三入口） -->
      <view class="section photo-section">
        <view class="section-title">上传教材</view>
        <view class="section-note">首张作为封面</view>
        <view class="recognize-entries">
          <view class="recog-entry" @click="capturePhoto">
            <text class="recog-icon">📷</text>
            <text class="recog-label">拍照识别</text>
          </view>
          <view class="recog-entry" @click="chooseFromAlbum">
            <text class="recog-icon">🖼️</text>
            <text class="recog-label">相册选择</text>
          </view>
          <view class="recog-entry" @click="openScanner">
            <text class="recog-icon">⌗</text>
            <text class="recog-label">扫ISBN条码</text>
          </view>
        </view>

        <!-- 识别状态条 -->
        <view class="ocr-status recognizing" v-if="ocrState === 'recognizing'">
          <text class="ocr-spinner"></text>
          <text>正在识别教材信息… {{ ocrProgressText }}</text>
        </view>
        <view class="ocr-status success" v-else-if="ocrState === 'success'">已识别并自动填充教材信息，请确认后补充售价</view>
        <view class="ocr-status failed" v-else-if="ocrState === 'failed'">暂未识别出完整教材信息，图片已保留，请手动补充</view>

        <view class="image-uploader">
          <view class="image-preview-list">
            <view class="image-item" v-for="(item, index) in imageUrls" :key="item" @click="previewImage(item)">
              <img :src="item" />
              <view class="delete-icon" @click.stop="deleteImage(index)">×</view>
            </view>
          </view>
          <view class="upload-button" @click="chooseFromAlbum" v-if="imageUrls.length < 9"><text class="upload-icon">＋</text><text>添加照片</text></view>
        </view>
      </view>

      <!-- 第二步：教材信息（系统识别，可编辑确认） -->
      <view class="section info-input-section">
        <view class="section-title-row">
          <view class="section-title">教材信息</view>
          <view class="section-tag">系统自动识别 · 可修改</view>
        </view>
        <view class="input-row"><view class="label">书名<text class="required">*</text></view><input class="input-field" type="text" v-model="formData.title" placeholder="识别失败请手动填写" /></view>
        <view class="input-row"><view class="label">作者</view><input class="input-field" type="text" v-model="formData.author" placeholder="选填" /></view>
        <view class="input-row"><view class="label">ISBN</view><input class="input-field" type="text" v-model="formData.isbn" placeholder="选填" /></view>
        <view class="input-row"><view class="label">出版社</view><input class="input-field" type="text" v-model="formData.publisher" placeholder="选填" /></view>
        <view class="input-row"><view class="label">版次</view><input class="input-field" type="text" v-model="formData.edition" placeholder="选填，如：第三版" /></view>
        <view class="input-row"><view class="label">课程编号</view><input class="input-field" type="text" v-model="formData.courseCode" placeholder="选填" /></view>
        <view class="input-row">
          <view class="label">专业</view>
          <view class="category-picker">
            <select class="category-select" :value="selectedMajorIndex === null ? '' : selectedMajorIndex" @change="onMajorChange">
              <option value="" disabled>{{ selectedMajorName || '请选择专业（选填）' }}</option>
              <option v-for="(major, i) in majorOptions" :key="major" :value="i">{{ major }}</option>
            </select>
          </view>
        </view>
        <view class="input-row">
          <view class="label">年级</view>
          <view class="category-picker">
            <select class="category-select" :value="selectedGradeIndex === null ? '' : selectedGradeIndex" @change="onGradeChange">
              <option value="" disabled>{{ selectedGradeName || '请选择年级（选填）' }}</option>
              <option v-for="(grade, i) in gradeOptions" :key="grade" :value="i">{{ grade }}</option>
            </select>
          </view>
        </view>
        <view class="input-row">
          <view class="label">图书分类</view>
          <view class="category-picker">
            <select class="category-select" :disabled="!categories.length" :value="selectedCategoryIndex === null ? '' : selectedCategoryIndex" @change="onCategoryChange">
              <option value="" disabled>{{ selectedCategoryName || '请选择分类（选填）' }}</option>
              <option v-for="(cat, i) in categories" :key="cat.id" :value="i">{{ cat.name }}</option>
            </select>
          </view>
        </view>
      </view>

      <!-- 第三步：出售设置（用户填写） -->
      <view class="section trade-section">
        <view class="section-title-row">
          <view class="section-title">出售设置</view>
          <view class="section-tag trade-tag">需要你填写</view>
        </view>
        <view class="condition-row">
          <view class="label">成色</view>
          <view class="condition-chips">
            <text v-for="opt in conditionOptions" :key="opt" class="condition-chip" :class="{ active: formData.condition === opt }" @click="formData.condition = opt">{{ opt }}</text>
          </view>
        </view>
        <view class="input-row"><view class="label">售价<text class="required">*</text></view><input class="input-field price-input" type="text" inputmode="decimal" v-model="formData.price" placeholder="请输入价格（元）" /></view>
        <view class="input-row"><view class="label">原价</view><input class="input-field" type="text" inputmode="decimal" v-model="formData.originalPrice" placeholder="选填" /></view>
        <view class="description-block">
          <view class="label desc-label">备注</view>
          <textarea class="description-input" v-model="formData.description" placeholder="选填：有无笔记、出售原因、面交地点等" maxlength="500"></textarea>
          <view class="char-count">{{ (formData.description || '').length }} / 500</view>
        </view>
      </view>

      <!-- 第四步：交易信息（默认从个人资料带出，改过的值会回写资料） -->
      <view class="section trade-contact-section">
        <view class="section-title-row">
          <view class="section-title">交易信息</view>
          <view class="section-tag auto-tag">已按个人资料带出</view>
        </view>
        <view class="section-tip">填一次，以后发布自动带出，不用重复输入；留空也不影响发布，下次可以再补。</view>
        <view class="input-row"><view class="label">微信号</view><input class="input-field" type="text" maxlength="20" v-model="tradeContact.contactWechat" placeholder="选填" /></view>
        <view class="input-row"><view class="label">QQ 号</view><input class="input-field" type="text" inputmode="numeric" maxlength="12" v-model="tradeContact.contactQq" placeholder="选填" /></view>
        <view class="input-row"><view class="label">手机号</view><input class="input-field" type="tel" inputmode="numeric" maxlength="11" v-model="tradeContact.contactPhone" placeholder="选填" /></view>
        <view class="input-row"><view class="label">面交地点</view><input class="input-field" type="text" maxlength="60" v-model="tradeContact.defaultMeetPoint" placeholder="选填，如：狮子山校区·图书馆门口" /></view>
        <view class="visibility-hint" :class="'vis-' + contactVisible">{{ visibilityHint }}</view>
      </view>

      <view class="submit-button-container">
        <button class="submit-button" type="submit" :disabled="submitting">{{ submitting ? '提交中…' : (bookId ? '保存修改' : '确认发布') }}</button>
        <button class="delete-button" v-if="bookId" type="button" @click="deleteBook" :disabled="submitting">下架此书</button>
      </view>
    </form>

    <!-- ISBN 条码扫描弹层 -->
    <view class="scan-mask" v-if="scanVisible">
      <view class="scan-panel">
        <view class="scan-title">对准书封底的 ISBN 条码</view>
        <view id="isbn-scan-region" class="scan-region"></view>
        <view class="scan-tip">识别成功后自动查询并填充教材信息</view>
        <view class="scan-error" v-if="scanError">{{ scanError }}</view>
        <button class="scan-cancel" @click="closeScanner">取消</button>
      </view>
    </view>

    <!-- 隐藏拍照 input -->
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" style="display:none" @change="onCameraFile" />
  </view>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import * as wx from '../services/wx';
import { globalData, requireApproved } from '../store';
import { recognizeBookInfo, lookupBookByIsbn } from '../services/ocr';
import { MAJORS, GRADES } from '../services/catalog';
import { compressImageFile } from '../utils/image';
import { emptyTradeContact, loadTradeContact, syncTradeContact, validateTradeContact, tradeVisibilityHint } from '../services/tradeContact';

const route = useRoute();
const bookId = ref(null);
const imageUrls = ref([]);
const tempFilePathsForUpload = ref([]);
const formData = reactive({
  title: '', author: '', isbn: '', publisher: '', edition: '', condition: '',
  price: '', originalPrice: '', courseCode: '', major: '', grade: '', description: '', categoryId: null
});
const conditionOptions = ['全新', '九成新', '八五成新', '八成新', '七成新', '六成新及以下'];
const majorOptions = MAJORS;
const gradeOptions = GRADES;
const selectedMajorIndex = ref(null);
const selectedMajorName = ref('');
const selectedGradeIndex = ref(null);
const selectedGradeName = ref('');
const categories = ref([]);
const selectedCategoryIndex = ref(null);
const selectedCategoryName = ref('');
const submitting = ref(false);

// 交易信息：默认从个人资料带出，用户改过的值在提交时回写资料
const tradeContact = reactive(emptyTradeContact());
const tradeBaseline = ref(emptyTradeContact());
const contactVisible = ref('order_only');
const visibilityHint = ref('');

// OCR / 扫码状态
const ocrState = ref(''); // '' | recognizing | success | failed
const ocrProgressText = ref('');
const cameraInput = ref(null);
const scanVisible = ref(false);
const scanError = ref('');
let scanner = null;

onMounted(async () => {
  await loadCategories();
  const options = route.query;
  if (options.id) {
    bookId.value = options.id;
    wx.setNavigationBarTitle({ title: '编辑书籍' });
    loadBookDataForEdit(options.id);
  } else {
    wx.setNavigationBarTitle({ title: '发布一本书' });
    resetForm();
    if (options.courseCode || options.major || options.grade || options.fromRequest) {
      if (options.courseCode) formData.courseCode = options.courseCode;
      if (options.major) formData.major = options.major;
      if (options.grade) formData.grade = options.grade;
      if (options.title) formData.title = options.title;
      const majorIndex = options.major ? MAJORS.indexOf(options.major) : -1;
      selectedMajorIndex.value = majorIndex >= 0 ? majorIndex : null;
      selectedMajorName.value = majorIndex >= 0 ? MAJORS[majorIndex] : (options.major || '');
      const gradeIndex = options.grade ? GRADES.indexOf(options.grade) : -1;
      selectedGradeIndex.value = gradeIndex >= 0 ? gradeIndex : null;
      selectedGradeName.value = gradeIndex >= 0 ? GRADES[gradeIndex] : (options.grade || '');
      const scope = [options.major, options.grade].filter(Boolean).join(' · ') || options.courseCode || '教材';
      formData.description = `回应同学求购：${scope}，支持校内面交与当面验书。`;
      wx.showToast({ title: '已带入求购信息', icon: 'success' });
    }
  }
  await loadTradeContactDefaults();
});

// 交易信息默认带出：填过就不用再敲一遍
async function loadTradeContactDefaults() {
  try {
    const { fields, contactVisible: mode } = await loadTradeContact();
    Object.assign(tradeContact, fields);
    tradeBaseline.value = { ...fields };
    contactVisible.value = mode;
    visibilityHint.value = tradeVisibilityHint(mode);
    // 面交地点顺手写进备注，卖家不用再解释一遍交付方式
    if (!bookId.value && !formData.description.trim() && fields.defaultMeetPoint) {
      formData.description = `面交地点：${fields.defaultMeetPoint}，支持当面验书。`;
    }
  } catch (error) {
    console.warn('[PublishPage] load trade contact failed:', error);
  }
}

onUnmounted(() => { stopScanner(); });

function goBack() { wx.navigateBack(); }

async function loadCategories() {
  try {
    const res = await wx.cloud.callFunction({ name: 'getCategories' });
    if (res.result && res.result.success) categories.value = res.result.data || [];
  } catch (error) {
    console.warn('[PublishPage] Unable to load categories:', error);
  }
}

function resetForm() {
  bookId.value = null;
  imageUrls.value = [];
  tempFilePathsForUpload.value = [];
  Object.assign(formData, {
    title: '', author: '', isbn: '', publisher: '', edition: '', condition: '',
    price: '', originalPrice: '', courseCode: '', major: '', grade: '', description: '', categoryId: null
  });
  selectedCategoryIndex.value = null;
  selectedCategoryName.value = '';
  selectedMajorIndex.value = null;
  selectedMajorName.value = '';
  selectedGradeIndex.value = null;
  selectedGradeName.value = '';
  submitting.value = false;
  ocrState.value = '';
}

async function loadBookDataForEdit(id) {
  wx.showLoading({ title: '加载数据...' });
  try {
    const res = await wx.cloud.callFunction({ name: 'getBookDetail', data: { bookId: id } });
    wx.hideLoading();
    if (res.result && res.result.success && res.result.data) {
      const book = res.result.data;
      const categoryIndex = book.categoryId ? categories.value.findIndex(cat => cat.id === book.categoryId) : -1;
      Object.assign(formData, {
        title: book.title || '', author: book.author || '', isbn: book.isbn || '',
        publisher: book.publisher || '', edition: book.edition || '', condition: book.condition || '',
        price: book.price !== null && book.price !== undefined ? String(book.price) : '',
        originalPrice: book.originalPrice !== null && book.originalPrice !== undefined ? String(book.originalPrice) : '',
        courseCode: book.courseCode || '', major: book.major || '', grade: book.grade || '',
        description: book.description || '', categoryId: book.categoryId || null
      });
      imageUrls.value = book.imageUrls || (book.coverUrl ? [book.coverUrl] : []);
      tempFilePathsForUpload.value = [];
      selectedCategoryIndex.value = categoryIndex >= 0 ? categoryIndex : null;
      selectedCategoryName.value = categoryIndex >= 0 ? categories.value[categoryIndex].name : '';
      const majorIndex = book.major ? MAJORS.indexOf(book.major) : -1;
      selectedMajorIndex.value = majorIndex >= 0 ? majorIndex : null;
      selectedMajorName.value = majorIndex >= 0 ? MAJORS[majorIndex] : (book.major || '');
      const gradeIndex = book.grade ? GRADES.indexOf(book.grade) : -1;
      selectedGradeIndex.value = gradeIndex >= 0 ? gradeIndex : null;
      selectedGradeName.value = gradeIndex >= 0 ? GRADES[gradeIndex] : (book.grade || '');
    } else {
      wx.showToast({ title: '书籍信息加载失败', icon: 'none' });
    }
  } catch (e) {
    wx.hideLoading();
    wx.showToast({ title: '加载数据出错', icon: 'none' });
  }
}

function onCategoryChange(e) {
  const index = e.target.value === '' ? null : Number(e.target.value);
  if (index !== null && categories.value[index]) {
    selectedCategoryIndex.value = index;
    selectedCategoryName.value = categories.value[index].name;
    formData.categoryId = categories.value[index].id;
  } else {
    selectedCategoryIndex.value = null;
    selectedCategoryName.value = '';
    formData.categoryId = null;
  }
}

function onMajorChange(e) {
  const index = e.target.value === '' ? null : Number(e.target.value);
  if (index !== null && majorOptions[index]) {
    selectedMajorIndex.value = index;
    selectedMajorName.value = majorOptions[index];
    formData.major = majorOptions[index];
  } else {
    selectedMajorIndex.value = null;
    selectedMajorName.value = '';
    formData.major = '';
  }
}

function onGradeChange(e) {
  const index = e.target.value === '' ? null : Number(e.target.value);
  if (index !== null && gradeOptions[index]) {
    selectedGradeIndex.value = index;
    selectedGradeName.value = gradeOptions[index];
    formData.grade = gradeOptions[index];
  } else {
    selectedGradeIndex.value = null;
    selectedGradeName.value = '';
    formData.grade = '';
  }
}

/* ---------- 三入口识别 ---------- */

// ① 拍照识别：调起摄像头拍封面，随后自动 OCR
function capturePhoto() {
  if (!cameraInput.value) return;
  cameraInput.value.value = '';
  cameraInput.value.click();
}

async function onCameraFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const dataUrl = await compressImageFile(file).catch(() => {
    wx.showToast({ title: '图片读取失败，请重拍', icon: 'none' });
    return '';
  });
  if (dataUrl) {
    addImage(dataUrl);
    runOcr(dataUrl);
  }
}

// ② 相册选择：选图后可自动识别第一张
function chooseFromAlbum() {
  const count = 9 - imageUrls.value.length;
  if (count <= 0) { wx.showToast({ title: '最多上传9张图片', icon: 'none' }); return; }
  wx.chooseMedia({ count }).then(res => {
    const newTempFiles = res.tempFiles.map(file => file.tempFilePath);
    tempFilePathsForUpload.value = tempFilePathsForUpload.value.concat(newTempFiles);
    imageUrls.value = imageUrls.value.concat(newTempFiles);
    // 教材信息为空时自动识别首张新图，减少用户操作
    if (newTempFiles.length && !formData.title && ocrState.value !== 'recognizing') {
      runOcr(newTempFiles[0]);
    }
  }).catch(err => {
    if (err && err.errMsg !== 'chooseMedia:fail cancel') wx.showToast({ title: '选择图片失败', icon: 'none' });
  });
}

function addImage(dataUrl) {
  if (imageUrls.value.length >= 9) return;
  imageUrls.value = imageUrls.value.concat([dataUrl]);
  tempFilePathsForUpload.value = tempFilePathsForUpload.value.concat([dataUrl]);
}

// OCR 识别主流程：真实识别，失败明示并保留图片
async function runOcr(dataUrl) {
  if (ocrState.value === 'recognizing') return;
  ocrState.value = 'recognizing';
  ocrProgressText.value = '';
  try {
    const info = await recognizeBookInfo(dataUrl, percent => { ocrProgressText.value = percent + '%'; });
    const found = info.title || info.isbn || info.author || info.publisher;
    if (found) {
      if (info.title && !formData.title) formData.title = info.title;
      if (info.author && !formData.author) formData.author = info.author;
      if (info.isbn && !formData.isbn) formData.isbn = info.isbn;
      if (info.publisher && !formData.publisher) formData.publisher = info.publisher;
      ocrState.value = 'success';
    } else {
      ocrState.value = 'failed';
    }
  } catch (e) {
    console.warn('[PublishPage] OCR failed:', e);
    ocrState.value = 'failed';
    wx.showToast({ title: e.message || '暂未识别出教材信息，请重新拍摄或手动填写', icon: 'none', duration: 2500 });
  }
}

// ③ 扫描 ISBN 条码：html5-qrcode 摄像头扫码 → OpenLibrary 反查
async function openScanner() {
  scanError.value = '';
  scanVisible.value = true;
  // 等 DOM 渲染出扫描容器
  await new Promise(resolve => setTimeout(resolve, 100));
  try {
    const { Html5Qrcode } = await import('html5-qrcode');
    scanner = new Html5Qrcode('isbn-scan-region');
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 8, qrbox: { width: 260, height: 140 } },
      async decodedText => {
        await stopScanner();
        handleScannedIsbn(decodedText);
      },
      () => { /* 每帧未命中属正常，忽略 */ }
    );
  } catch (e) {
    console.warn('[PublishPage] scanner start failed:', e);
    scanVisible.value = false;
    wx.showModal({
      title: '无法调用摄像头',
      content: '请检查浏览器摄像头权限，或改用「拍照识别」。',
      showCancel: false,
      confirmText: '我知道了'
    });
  }
}

async function stopScanner() {
  if (scanner) {
    try { await scanner.stop(); } catch (e) { /* 已停止 */ }
    try { scanner.clear(); } catch (e) { /* ignore */ }
    scanner = null;
  }
  scanVisible.value = false;
}

function closeScanner() { stopScanner(); }

async function handleScannedIsbn(text) {
  wx.showLoading({ title: '正在查询教材信息…', mask: true });
  try {
    const info = await lookupBookByIsbn(text);
    wx.hideLoading();
    if (info.title || info.author || info.publisher) {
      if (info.title) formData.title = info.title;
      if (info.author) formData.author = info.author;
      if (info.publisher) formData.publisher = info.publisher;
      if (info.isbn) formData.isbn = info.isbn;
      ocrState.value = 'success';
      wx.showToast({ title: '扫码成功，已自动填充', icon: 'success' });
    } else {
      formData.isbn = String(text).replace(/[^0-9Xx]/g, '');
      ocrState.value = 'failed';
      wx.showToast({ title: '已记录 ISBN，但未查到教材详情，请手动补充', icon: 'none', duration: 2500 });
    }
  } catch (e) {
    wx.hideLoading();
    formData.isbn = String(text).replace(/[^0-9Xx]/g, '');
    ocrState.value = 'failed';
    wx.showToast({ title: e.message || '扫码查询失败，请手动填写', icon: 'none', duration: 2500 });
  }
}

/* ---------- 图片管理 ---------- */

function previewImage(currentUrl) {
  const urlsToPreview = imageUrls.value.filter(url => typeof url === 'string' && url.length > 0);
  wx.previewImage({ current: currentUrl, urls: urlsToPreview });
}

function deleteImage(index) {
  const targetUrl = imageUrls.value[index];
  const newImageUrls = [...imageUrls.value];
  newImageUrls.splice(index, 1);
  tempFilePathsForUpload.value = tempFilePathsForUpload.value.filter(path => path !== targetUrl);
  imageUrls.value = newImageUrls;
}

/* ---------- 提交 ---------- */

async function submitForm() {
  if (submitting.value) return;
  if (!(await requireApproved('发布书籍'))) return;

  const cleaned = {
    title: (formData.title || '').trim(),
    author: (formData.author || '').trim(),
    isbn: (formData.isbn || '').trim(),
    publisher: (formData.publisher || '').trim(),
    edition: (formData.edition || '').trim(),
    condition: (formData.condition || '').trim(),
    courseCode: (formData.courseCode || '').trim(),
    major: (formData.major || '').trim(),
    grade: (formData.grade || '').trim(),
    description: (formData.description || '').trim(),
    price: (formData.price || '').trim(),
    originalPrice: (formData.originalPrice || '').trim(),
    categoryId: formData.categoryId
  };

  if (imageUrls.value.length === 0) { wx.showToast({ title: '请至少上传一张教材图片', icon: 'none' }); return; }
  if (!cleaned.title) { wx.showToast({ title: '请填写书名（识别失败可手动补充）', icon: 'none' }); return; }
  if (!cleaned.price || isNaN(parseFloat(cleaned.price)) || parseFloat(cleaned.price) <= 0) {
    wx.showToast({ title: '请填写有效售价', icon: 'none' }); return;
  }
  if (cleaned.originalPrice && (isNaN(parseFloat(cleaned.originalPrice)) || parseFloat(cleaned.originalPrice) < 0)) {
    wx.showToast({ title: '原价格式不正确，可留空', icon: 'none' }); return;
  }
  const contactProblem = validateTradeContact(tradeContact);
  if (contactProblem) { wx.showToast({ title: contactProblem, icon: 'none', duration: 2500 }); return; }

  submitting.value = true;
  wx.showLoading({ title: bookId.value ? '保存中…' : '发布中…', mask: true });

  try {
    // 0. 交易信息被改过就回写个人资料 —— 下次发布自动带出，不用再打字
    const contactSync = await syncTradeContact(tradeContact, tradeBaseline.value);
    if (contactSync.changed) tradeBaseline.value = { ...tradeContact };

    // 1. 新图片真实上传到服务端
    let uploadedNewFileIDs = [];
    if (tempFilePathsForUpload.value.length > 0) {
      const uploadResults = await Promise.all(
        tempFilePathsForUpload.value.map(filePath => wx.cloud.uploadFile({ filePath, type: 'public' }))
      );
      if (uploadResults.some(result => !result.fileID)) throw new Error('部分图片上传失败，请重试');
      uploadedNewFileIDs = uploadResults.map(result => result.fileID);
    }

    // 2. 合并已有图片（编辑场景）与新上传图片
    const existingURLs = imageUrls.value.filter(url =>
      typeof url === 'string' && (url.startsWith('/') || url.startsWith('http'))
    );
    const finalImages = existingURLs.concat(uploadedNewFileIDs);
    if (!finalImages.length) throw new Error('没有有效的图片信息');

    // 3. 提交
    const submitRes = await wx.cloud.callFunction({
      name: 'publishBook',
      data: {
        formData: {
          ...cleaned,
          price: parseFloat(cleaned.price),
          originalPrice: cleaned.originalPrice ? parseFloat(cleaned.originalPrice) : null,
          categoryId: cleaned.categoryId
        },
        imageFileIDs: finalImages,
        ...(bookId.value && { bookIdToEdit: bookId.value })
      }
    });

    if (submitRes.result && submitRes.result.success) {
      wx.hideLoading();
      submitting.value = false;
      wx.showToast({ title: bookId.value ? '修改成功' : '发布成功', icon: 'success', duration: 1500 });
      globalData.sellListNeedRefresh = true;
      globalData.profileNeedRefresh = true;
      setTimeout(() => { wx.navigateBack(); }, 1500);
    } else if (submitRes.result && submitRes.result.code === 'NOT_VERIFIED') {
      wx.hideLoading();
      submitting.value = false;
      requireApproved('发布书籍');
    } else {
      throw new Error((submitRes.result && submitRes.result.message) || '发布操作失败');
    }
  } catch (err) {
    wx.hideLoading();
    submitting.value = false;
    console.error('[PublishPage] submit error:', err);
    wx.showToast({ title: (err && err.message) || '发布失败，请稍后重试', icon: 'none', duration: 2500 });
  }
}

function deleteBook() {
  if (!bookId.value) return;
  wx.showModal({
    title: '确认下架',
    content: '确定要下架这本书吗？下架后其他同学将看不到它。',
    success: async res => {
      if (!res.confirm) return;
      wx.showLoading({ title: '处理中…', mask: true });
      try {
        const deleteRes = await wx.cloud.callFunction({ name: 'deletePublishedBook', data: { bookId: bookId.value } });
        if (!deleteRes.result || !deleteRes.result.success) {
          throw new Error((deleteRes.result && deleteRes.result.message) || '下架失败');
        }
        wx.hideLoading();
        globalData.sellListNeedRefresh = true;
        wx.showToast({ title: '已下架', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: (err && err.message) || '下架失败', icon: 'none' });
      }
    }
  });
}
</script>

<style scoped>
.container { padding: 0 calc(24 * var(--rpx)) calc(180 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(104 * var(--rpx)); }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(26 * var(--rpx)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.form-intro { margin-bottom: calc(18 * var(--rpx)); padding: calc(24 * var(--rpx)); border-radius: calc(20 * var(--rpx)); background: #edf5ee; }
.intro-title { color: #1d5c38; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.intro-desc { margin-top: calc(8 * var(--rpx)); color: #6e8c7c; font-size: calc(22 * var(--rpx)); }
.section { position: relative; margin-bottom: calc(18 * var(--rpx)); padding: calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; box-shadow: 0 calc(7 * var(--rpx)) calc(18 * var(--rpx)) rgba(22, 106, 63,.03); }
.section-title { color: #166a3f; font-size: calc(29 * var(--rpx)); font-weight: 750; }
.section-title-row { display: flex; align-items: center; justify-content: space-between; }
.section-tag { padding: calc(6 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(10 * var(--rpx)); background: #eef4f8; color: #5b7a9a; font-size: calc(19 * var(--rpx)); }
.trade-tag { background: #fdf6e3; color: #b07f16; }
.auto-tag { background: #e8f3ec; color: #166a3f; }
.section-tip { margin-top: calc(10 * var(--rpx)); color: #94a09a; font-size: calc(20 * var(--rpx)); line-height: 1.5; }
.visibility-hint { margin-top: calc(14 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(16 * var(--rpx)); border-radius: calc(12 * var(--rpx)); font-size: calc(20 * var(--rpx)); line-height: 1.5; }
.visibility-hint.vis-order_only { background: #edf5ee; color: #166a3f; }
.visibility-hint.vis-public { background: #fdf6e3; color: #9a7a38; }
.visibility-hint.vis-private { background: #fdf0ef; color: #a8483f; }
.section-note { position: absolute; top: calc(28 * var(--rpx)); right: calc(24 * var(--rpx)); color: #9aa89e; font-size: calc(20 * var(--rpx)); }
.recognize-entries { display: flex; gap: calc(14 * var(--rpx)); margin-top: calc(20 * var(--rpx)); }
.recog-entry { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; min-width: 0; padding: calc(22 * var(--rpx)) calc(6 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(16 * var(--rpx)); background: #f7faf7; cursor: pointer; }
.recog-icon { display: flex; align-items: center; justify-content: center; width: calc(64 * var(--rpx)); height: calc(64 * var(--rpx)); border-radius: calc(18 * var(--rpx)); background: #e8f3ec; font-size: calc(34 * var(--rpx)); line-height: 1; }
.recog-label { margin-top: calc(10 * var(--rpx)); color: #2c5343; font-size: calc(22 * var(--rpx)); font-weight: 700; white-space: nowrap; }
.ocr-status { display: flex; align-items: center; margin-top: calc(16 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(18 * var(--rpx)); border-radius: calc(12 * var(--rpx)); font-size: calc(22 * var(--rpx)); line-height: 1.5; }
.ocr-status.recognizing { background: #eef4f8; color: #4a6b8a; }
.ocr-status.success { background: #e8f3ec; color: #166a3f; }
.ocr-status.failed { background: #fdf6e3; color: #9a7a38; }
.ocr-spinner { width: calc(24 * var(--rpx)); height: calc(24 * var(--rpx)); margin-right: calc(10 * var(--rpx)); border: calc(3 * var(--rpx)) solid #b8cfe0; border-top-color: #4a6b8a; border-radius: 50%; animation: ocr-spin .8s linear infinite; flex: none; }
@keyframes ocr-spin { to { transform: rotate(360deg); } }
.image-uploader, .image-preview-list { display: flex; flex-wrap: wrap; margin-top: calc(18 * var(--rpx)); }
.image-preview-list { margin-top: 0; }
.image-item, .upload-button { width: calc(142 * var(--rpx)); height: calc(142 * var(--rpx)); margin: 0 calc(14 * var(--rpx)) calc(14 * var(--rpx)) 0; border-radius: calc(12 * var(--rpx)); overflow: hidden; box-sizing: border-box; }
.image-item { position: relative; border: calc(1 * var(--rpx)) solid #e5e7eb; cursor: pointer; }
.image-item img { width: 100%; height: 100%; object-fit: cover; }
.delete-icon { position: absolute; top: 0; right: 0; display: flex; align-items: center; justify-content: center; width: calc(34 * var(--rpx)); height: calc(34 * var(--rpx)); border-radius: 0 0 0 calc(10 * var(--rpx)); background: rgba(22, 106, 63,.65); color: #fff; font-size: calc(25 * var(--rpx)); }
.upload-button { display: flex; flex-direction: column; align-items: center; justify-content: center; border: calc(1 * var(--rpx)) dashed #bdc9c0; background: #fafbfc; color: #83988d; font-size: calc(21 * var(--rpx)); cursor: pointer; }
.upload-icon { color: #527861; font-size: calc(45 * var(--rpx)); line-height: 1; }
.input-row { display: flex; align-items: center; min-height: calc(88 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.input-row:first-of-type { margin-top: calc(8 * var(--rpx)); }
.input-row:last-child { border-bottom: 0; }
.label { width: calc(150 * var(--rpx)); color: #3d594c; font-size: calc(25 * var(--rpx)); font-weight: 600; flex: none; }
.required { margin-left: calc(4 * var(--rpx)); color: #d9a62e; }
.input-field, .category-picker { flex: 1; color: #566f62; font-size: calc(24 * var(--rpx)); text-align: right; min-width: 0; }
.price-input { color: #c98f1b; font-size: calc(28 * var(--rpx)); font-weight: 750; }
.category-select { width: 100%; color: #7a8e82; font-size: calc(24 * var(--rpx)); text-align: right; cursor: pointer; appearance: none; direction: rtl; }
.category-select option { color: #566f62; direction: ltr; }
.condition-row { display: flex; align-items: flex-start; padding: calc(20 * var(--rpx)) 0 calc(6 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f0eeea; }
.condition-chips { display: flex; flex: 1; flex-wrap: wrap; justify-content: flex-end; gap: calc(12 * var(--rpx)); min-width: 0; }
.condition-chip { padding: calc(8 * var(--rpx)) calc(18 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(22 * var(--rpx)); background: #fafbfc; color: #687d71; font-size: calc(22 * var(--rpx)); cursor: pointer; }
.condition-chip.active { border-color: #166a3f; background: #e8f3ec; color: #166a3f; font-weight: 700; }
.description-block { padding-top: calc(16 * var(--rpx)); }
.desc-label { width: auto; }
.description-input { display: block; width: 100%; min-height: calc(130 * var(--rpx)); margin-top: calc(12 * var(--rpx)); padding: calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #e7eee8; border-radius: calc(12 * var(--rpx)); background: #fafbfc; color: #3d594c; font-size: calc(25 * var(--rpx)); line-height: 1.6; box-sizing: border-box; resize: none; }
.char-count { margin-top: calc(8 * var(--rpx)); color: #a4b0a7; font-size: calc(20 * var(--rpx)); text-align: right; }
.submit-button-container { position: fixed; right: calc(24 * var(--rpx)); bottom: calc(18 * var(--rpx)); left: calc(24 * var(--rpx)); z-index: 100; max-width: calc(var(--app-max-width) - calc(48 * var(--rpx))); margin: 0 auto; }
.submit-button, .delete-button { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(84 * var(--rpx)); margin: 0; border-radius: calc(17 * var(--rpx)); font-size: calc(28 * var(--rpx)); font-weight: 700; line-height: calc(84 * var(--rpx)); }
.submit-button { background: #166a3f !important; color: #fff !important; box-shadow: 0 calc(8 * var(--rpx)) calc(16 * var(--rpx)) rgba(22, 106, 63,.16); }
.submit-button[disabled] { background: #c7cdd5 !important; }
.delete-button { margin-top: calc(12 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ecd9a8; background: #fdf8ea !important; color: #b07f16 !important; }
.scan-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: calc(40 * var(--rpx)); background: rgba(20,28,24,.72); box-sizing: border-box; }
.scan-panel { width: 100%; max-width: calc(640 * var(--rpx)); padding: calc(28 * var(--rpx)); border-radius: calc(22 * var(--rpx)); background: #fff; }
.scan-title { color: #166a3f; font-size: calc(28 * var(--rpx)); font-weight: 750; text-align: center; }
.scan-region { width: 100%; min-height: calc(360 * var(--rpx)); margin-top: calc(18 * var(--rpx)); border-radius: calc(14 * var(--rpx)); background: #101a15; overflow: hidden; }
.scan-region video { width: 100% !important; }
.scan-tip { margin-top: calc(14 * var(--rpx)); color: #8f9f94; font-size: calc(21 * var(--rpx)); text-align: center; }
.scan-error { margin-top: calc(10 * var(--rpx)); color: #b07f16; font-size: calc(21 * var(--rpx)); text-align: center; }
.scan-cancel { width: 100%; height: calc(76 * var(--rpx)); margin-top: calc(18 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(38 * var(--rpx)); background: #fff; color: #3d594c; font-size: calc(26 * var(--rpx)); cursor: pointer; }
</style>
