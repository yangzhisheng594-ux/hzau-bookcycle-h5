// 本地演示数据服务（H5 移植版）：逻辑与原小程序 utils/demoService.js 完全一致。
// 差异说明：原版 state 存于内存（重新编译即重置），H5 版持久化到 localStorage，
// 保证刷新页面后演示数据不丢失；清空站点数据即可恢复初始状态。
const DEMO_MODE = true;
const STORAGE_KEY = 'bnbu_demo_state_v1';

const covers = {
  algorithm: '/images/图解算法.jpg',
  python: '/images/Python从入门到实践（第2版）.png',
  javascript: '/images/JavaScript高级程序设计.jpg',
  operatingSystem: '/images/demo-operating-system.png',
  compiler: '/images/demo-compiler.png',
  miniProgram: '/images/demo-mini-program.png'
};

const clone = value => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();

function createState() {
  return {
    nextBookId: 500,
    nextCartId: 100,
    nextOrderId: 800,
    nextOrderItemId: 1200,
    nextRequestId: 300,
    user: {
      user_id: 1,
      open_id: 'demo-openid-bnbu',
      nick_name: '华农书友',
      avatar_url: '/images/demo-avatar.png',
      phone: '188****2026'
    },
    categories: [
      { category_id: 1, name: '计算机科学' },
      { category_id: 2, name: '经济管理' },
      { category_id: 3, name: '文学艺术' },
      { category_id: 4, name: '语言学习' }
    ],
    books: [
      {
        id: 101, userId: 21, title: '图解算法', author: 'Aditya Bhargava', isbn: '9787115447630',
        publisher: '人民邮电出版社', condition: '九成新', price: 28, originalPrice: 49, courseCode: 'CS101',
        description: '无划线无折页，适合算法入门和课程复习。可以在校内当面交易。', categoryId: 1,
        status: 'selling', isBestseller: true, views: 156, coverUrl: covers.algorithm, imageUrls: [covers.algorithm], createdAt: now()
      },
      {
        id: 102, userId: 22, title: 'Python 编程：从入门到实践', author: 'Eric Matthes', isbn: '9787115546081',
        publisher: '人民邮电出版社', condition: '八五成新', price: 35, originalPrice: 89, courseCode: 'CS102',
        description: '含 Python 基础与项目实战内容，少量笔记已用便签标注。', categoryId: 1,
        status: 'selling', isBestseller: true, views: 128, coverUrl: covers.python, imageUrls: [covers.python], createdAt: now()
      },
      {
        id: 103, userId: 23, title: 'JavaScript 高级程序设计', author: 'Nicholas C. Zakas', isbn: '9787115545381',
        publisher: '人民邮电出版社', condition: '九成新', price: 22, originalPrice: 69, courseCode: 'WEB201',
        description: '前端开发课程参考书，书页干净，支持校内自提。', categoryId: 1,
        status: 'selling', isBestseller: false, views: 97, coverUrl: covers.javascript, imageUrls: [covers.javascript], createdAt: now()
      },
      {
        id: 301, userId: 1, title: '操作系统概念', author: 'Abraham Silberschatz', isbn: '9787111693925',
        publisher: '机械工业出版社', condition: '九成新', price: 32, originalPrice: 89, courseCode: 'CS301',
        description: '个人闲置教材，内页整洁，适用于操作系统课程。', categoryId: 1,
        status: 'selling', isBestseller: false, views: 44, coverUrl: covers.operatingSystem, imageUrls: [covers.operatingSystem], createdAt: now()
      },
      {
        id: 104, userId: 24, title: '编译原理', author: 'Alfred V. Aho', isbn: '9787111614579',
        publisher: '机械工业出版社', condition: '八成新', price: 26, originalPrice: 69, courseCode: 'CS302',
        description: '课堂笔记极少，适合编译原理课程复习，可校内面交。', categoryId: 1,
        status: 'selling', isBestseller: false, views: 72, coverUrl: covers.compiler, imageUrls: [covers.compiler], createdAt: now()
      },
      {
        id: 105, userId: 25, title: '微信小程序开发实战', author: '李宁', isbn: '9787121398581',
        publisher: '电子工业出版社', condition: '九成新', price: 24, originalPrice: 59, courseCode: 'WEB202',
        description: '小程序课程配套教材，书页整洁，附课程重点便签。', categoryId: 1,
        status: 'selling', isBestseller: false, views: 61, coverUrl: covers.miniProgram, imageUrls: [covers.miniProgram], createdAt: now()
      }
    ],
    cart: [],
    requests: [
      {
        id: 201, postUserId: 1, title: '计算机网络：自顶向下方法', author: 'Kurose', courseCode: 'CS203',
        seekingPriceMin: 20, seekingPriceMax: 35, expectedPrice: '35',
        description: '希望书内笔记较少，版本不限，可校内面交。', coverUrl: covers.python,
        coverImageUrl: covers.python, createdAt: now()
      },
      {
        id: 202, postUserId: 33, title: '微观经济学', author: '曼昆', courseCode: 'ECON101',
        seekingPriceMin: 18, seekingPriceMax: 28, expectedPrice: '28',
        description: '急需本周上课使用，如有请联系。', coverUrl: covers.javascript,
        coverImageUrl: covers.javascript, createdAt: now()
      }
    ],
    buyerOrders: [
      {
        orderId: 701, orderNumber: 'SB202607240001', rawStatus: 'shipped', totalQuantity: 1, totalAmount: 35,
        products: [{ productId: 102, title: 'Python 编程：从入门到实践', coverUrl: covers.python, courseCode: 'CS102', quantity: 1, price: 35, displayPrice: '35.00' }]
      }
    ],
    sellerOrders: [
      {
        orderItemId: 1101, orderId: 702, orderNumber: 'SB202607240002', bookId: 301,
        title: '操作系统概念', coverUrl: covers.operatingSystem, courseCode: 'CS301', buyerName: '李同学',
        quantity: 1, displayPrice: '32.00', status: 'pending'
      }
    ]
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.books) && parsed.user) return parsed;
    }
  } catch (e) {
    console.warn('[DemoService] state restore failed, using fresh state.', e);
  }
  return createState();
}

let state = loadState();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[DemoService] state persist failed (quota?).', e);
  }
}

function bookSummary(book) {
  return {
    id: book.id,
    userId: book.userId,
    title: book.title,
    author: book.author,
    isbn: book.isbn,
    publisher: book.publisher,
    condition: book.condition,
    price: Number(book.price),
    originalPrice: book.originalPrice === null || book.originalPrice === undefined ? null : Number(book.originalPrice),
    courseCode: book.courseCode,
    description: book.description,
    status: book.status,
    isBestseller: Boolean(book.isBestseller),
    views: Number(book.views || 0),
    categoryId: book.categoryId,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt || book.createdAt,
    coverUrl: book.coverUrl || null
  };
}

function paginate(items, page, pageSize) {
  const currentPage = Math.max(Number(page) || 1, 1);
  const size = Math.min(Math.max(Number(pageSize) || 10, 1), 50);
  const totalItems = items.length;
  return {
    data: items.slice((currentPage - 1) * size, currentPage * size),
    pagination: {
      currentPage,
      page: currentPage,
      pageSize: size,
      totalItems,
      total: totalItems,
      totalPages: Math.ceil(totalItems / size),
      hasMore: currentPage * size < totalItems
    }
  };
}

function visibleBooks(data) {
  let books = state.books.filter(book => book.status === 'selling');
  const keyword = String(data.searchKeyword || '').trim().toLowerCase();
  if (keyword) {
    books = books.filter(book => [book.title, book.author, book.isbn, book.courseCode, book.description]
      .some(value => String(value || '').toLowerCase().includes(keyword)));
  }
  if (Number(data.categoryId)) books = books.filter(book => book.categoryId === Number(data.categoryId));
  if (data.courseCode) books = books.filter(book => book.courseCode === data.courseCode);
  if (data.type === 'byUser' && Number(data.userId)) books = books.filter(book => book.userId === Number(data.userId));
  if (data.type === 'bestseller') books = books.slice().sort((a, b) => b.views - a.views);
  if (data.type === 'recent') books = books.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return books;
}

function formatOrder(order) {
  const presentation = {
    pending_payment: { text: '待付款', className: 'pendingPayment' },
    pending_shipment: { text: '待约定面交', className: 'pendingShipment' },
    shipped: { text: '待确认收书', className: 'pendingReceipt' },
    completed: { text: '已完成', className: 'completed' }
  }[order.rawStatus] || { text: '已完成', className: 'completed' };
  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    status: presentation.className,
    statusText: presentation.text,
    statusClass: presentation.className,
    totalQuantity: order.totalQuantity,
    totalAmount: Number(order.totalAmount),
    displayTotalAmount: Number(order.totalAmount).toFixed(2),
    products: order.products
  };
}

function findBook(id) {
  return state.books.find(book => String(book.id) === String(id));
}

function handle(name, data = {}) {
  switch (name) {
    case 'login': {
      const userInfo = data.userInfoFromWx || {};
      if (userInfo.nickName) state.user.nick_name = userInfo.nickName;
      if (userInfo.avatarUrl) state.user.avatar_url = userInfo.avatarUrl;
      persist();
      return { success: true, openid: state.user.open_id, userData: clone(state.user) };
    }
    case 'getUserProfile':
      return { success: true, data: clone(state.user) };
    case 'updateUserProfile': {
      const profile = data.updatedProfileData || {};
      if (profile.nickName) state.user.nick_name = profile.nickName;
      if (profile.avatarUrl !== undefined) state.user.avatar_url = profile.avatarUrl;
      persist();
      return { success: true, data: clone(state.user), message: '资料已保存' };
    }
    case 'getCategories':
      return { success: true, data: clone(state.categories) };
    case 'getBooksForHomepage': {
      const books = visibleBooks({});
      const bestsellers = books.slice().sort((a, b) => b.views - a.views).slice(0, 3);
      const bestsellerIds = new Set(bestsellers.map(book => book.id));
      const recentReleases = books
        .filter(book => !bestsellerIds.has(book.id))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 8);
      return {
        success: true,
        data: {
          bestsellers: bestsellers.map(bookSummary),
          recentReleases: recentReleases.map(bookSummary)
        }
      };
    }
    case 'getBooks': {
      const list = visibleBooks(data).map(bookSummary);
      const page = paginate(list, data.page, data.pageSize);
      return { success: true, data: page.data, pagination: page.pagination };
    }
    case 'getBookDetail': {
      const book = findBook(data.bookId);
      if (!book) return { success: false, message: '书籍不存在或已下架' };
      book.views = Number(book.views || 0) + 1;
      persist();
      return {
        success: true,
        data: clone({
          ...bookSummary(book),
          imageUrls: book.imageUrls || (book.coverUrl ? [book.coverUrl] : []),
          sellerInfo: {
            nickName: book.userId === state.user.user_id ? state.user.nick_name : '校园书友',
            avatarUrl: '/images/demo-avatar.png'
          }
        })
      };
    }
    case 'addToCart': {
      const book = findBook(data.bookId);
      if (!book || book.status !== 'selling') return { success: false, message: '该书籍暂不可购买' };
      if (book.userId === state.user.user_id) return { success: false, message: '不能购买自己发布的书籍' };
      if (!state.cart.some(item => item.bookId === book.id)) state.cart.push({ cartItemId: state.nextCartId++, bookId: book.id });
      persist();
      return { success: true, message: '已加入购物车', totalCartItems: state.cart.length };
    }
    case 'getCartItems': {
      const items = state.cart.map(cartItem => {
        const book = findBook(cartItem.bookId);
        return book && book.status === 'selling' ? {
          cartItemId: cartItem.cartItemId,
          id: book.id,
          bookId: book.id,
          title: book.title,
          spec: book.courseCode,
          courseCode: book.courseCode,
          price: Number(book.price),
          currentPrice: Number(book.price),
          priceAtAdd: Number(book.price),
          quantity: 1,
          coverUrl: book.coverUrl
        } : null;
      }).filter(Boolean);
      return { success: true, data: clone(items) };
    }
    case 'deleteCartItems': {
      const ids = (data.cartItemIds || []).map(String);
      state.cart = state.cart.filter(item => !ids.includes(String(item.cartItemId)));
      persist();
      return { success: true, message: '已移出购物车' };
    }
    case 'updateCartItem':
      return { success: true, message: '二手书每本仅可购买一件' };
    case 'createAndPayOrder': {
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const products = rawItems.map(item => {
        const book = findBook(item.bookId);
        return book ? {
          productId: book.id,
          title: book.title,
          coverUrl: book.coverUrl,
          courseCode: book.courseCode,
          quantity: 1,
          price: Number(book.price),
          displayPrice: Number(book.price).toFixed(2)
        } : null;
      }).filter(Boolean);
      if (!products.length) return { success: false, message: '订单商品已失效，请重新选择' };
      const totalAmount = products.reduce((total, item) => total + item.price, 0);
      const order = {
        orderId: state.nextOrderId++,
        orderNumber: `SB${Date.now()}`,
        rawStatus: 'pending_shipment',
        totalQuantity: products.length,
        totalAmount,
        products
      };
      state.buyerOrders.unshift(order);
      const cartIds = rawItems.map(item => String(item.cartItemId || '')).filter(Boolean);
      if (data.source === 'cart' && cartIds.length) state.cart = state.cart.filter(item => !cartIds.includes(String(item.cartItemId)));
      persist();
      return { success: true, message: '支付成功，请与卖家约定校内面交', data: { orderId: order.orderId, orderNumber: order.orderNumber, totalAmount } };
    }
    case 'getOrders': {
      const requestedStatus = data.status || 'all';
      const wanted = {
        pendingPayment: 'pending_payment',
        pendingShipment: 'pending_shipment',
        pendingReceipt: 'shipped',
        completed: 'completed'
      }[requestedStatus];
      const orders = state.buyerOrders.filter(order => !wanted || order.rawStatus === wanted).map(formatOrder);
      const page = paginate(orders, data.page, data.pageSize || 20);
      return { success: true, data: clone(page.data), pagination: page.pagination };
    }
    case 'confirmReceipt': {
      const order = state.buyerOrders.find(item => String(item.orderId) === String(data.orderId));
      if (!order) return { success: false, message: '订单不存在' };
      order.rawStatus = 'completed';
      persist();
      return { success: true, message: '已确认收书，交易完成' };
    }
    case 'getOrderCounts': {
      const count = status => state.buyerOrders.filter(order => order.rawStatus === status).length;
      return { success: true, data: { pendingPayment: count('pending_payment'), pendingShipment: count('pending_shipment'), pendingReceipt: count('shipped') } };
    }
    case 'getSellerOrders': {
      const statusMap = {
        pending: { text: '待约定面交', className: 'pendingShipment' },
        shipped: { text: '待买家确认', className: 'pendingReceipt' },
        completed: { text: '已完成', className: 'completed' }
      };
      const list = state.sellerOrders.map(item => ({ ...item, statusText: statusMap[item.status].text, statusClass: statusMap[item.status].className }));
      const page = paginate(list, data.page, data.pageSize || 20);
      return { success: true, data: clone(page.data), pagination: page.pagination };
    }
    case 'shipOrderItem': {
      const item = state.sellerOrders.find(order => String(order.orderItemId) === String(data.orderItemId));
      if (!item) return { success: false, message: '售出订单不存在' };
      item.status = 'shipped';
      persist();
      return { success: true, message: '已确认面交，等待买家确认' };
    }
    case 'getUserSellingBooks': {
      const books = state.books.filter(book => book.userId === state.user.user_id && book.status === 'selling').map(bookSummary);
      const page = paginate(books, data.page, data.pageSize);
      return { success: true, data: clone(page.data), total: page.pagination.totalItems, page: page.pagination.currentPage, pageSize: page.pagination.pageSize, hasMore: page.pagination.hasMore };
    }
    case 'publishBook': {
      const form = data.formData || {};
      const id = Number(data.bookIdToEdit);
      const imageUrls = (data.imageFileIDs || []).filter(Boolean);
      const book = {
        id: id || state.nextBookId++,
        userId: state.user.user_id,
        title: String(form.title || '').trim(),
        author: String(form.author || '').trim(),
        isbn: String(form.isbn || '').trim(),
        publisher: String(form.publisher || '').trim(),
        condition: String(form.condition || '九成新').trim(),
        price: Number(form.price || 0),
        originalPrice: form.originalPrice === null || form.originalPrice === undefined ? null : Number(form.originalPrice),
        courseCode: String(form.courseCode || '').trim(),
        description: String(form.description || '').trim(),
        categoryId: Number(form.categoryId) || 1,
        status: 'selling',
        isBestseller: false,
        views: 0,
        coverUrl: imageUrls[0] || covers.algorithm,
        imageUrls: imageUrls.length ? imageUrls : [covers.algorithm],
        createdAt: now(),
        updatedAt: now()
      };
      if (!book.title || !book.price) return { success: false, message: '请完善书籍信息' };
      const oldIndex = state.books.findIndex(item => item.id === book.id && item.userId === state.user.user_id);
      if (oldIndex >= 0) state.books.splice(oldIndex, 1, { ...state.books[oldIndex], ...book });
      else state.books.unshift(book);
      persist();
      return { success: true, message: oldIndex >= 0 ? '修改成功' : '发布成功', data: { bookId: book.id } };
    }
    case 'deletePublishedBook': {
      const book = state.books.find(item => String(item.id) === String(data.bookId) && item.userId === state.user.user_id);
      if (!book) return { success: false, message: '书籍不存在或无权操作' };
      book.status = 'delisted';
      persist();
      return { success: true, message: '已下架' };
    }
    case 'getSeekingPosts': {
      const ownOnly = Boolean(data.userId);
      const courseCode = String(data.courseCode || '').trim();
      const posts = state.requests
        .filter(item => (!ownOnly || item.postUserId === state.user.user_id) && (!courseCode || item.courseCode === courseCode))
        .map(item => ({ ...item, seekingPrice: item.seekingPrice || item.seekingPriceMax || item.seekingPriceMin || '' }));
      const page = paginate(posts, data.page, data.pageSize);
      return { success: true, data: clone(page.data), total: page.pagination.totalItems, page: page.pagination.currentPage, pageSize: page.pagination.pageSize, hasMore: page.pagination.hasMore };
    }
    case 'getPurchaseRequestDetail': {
      const item = state.requests.find(request => String(request.id) === String(data.requestId) && request.postUserId === state.user.user_id);
      if (!item) return { success: false, message: '求购信息不存在或无权查看' };
      return { success: true, data: clone(item) };
    }
    case 'publishOrUpdateRequest': {
      const requestData = data.requestData || {};
      const existing = state.requests.find(item => String(item.id) === String(data.requestId) && item.postUserId === state.user.user_id);
      const price = Number(requestData.expectedPrice || 0);
      const item = {
        id: existing ? existing.id : state.nextRequestId++,
        postUserId: state.user.user_id,
        title: String(requestData.title || '').trim(),
        author: String(requestData.author || '').trim(),
        courseCode: String(requestData.courseCode || '').trim(),
        seekingPriceMin: price,
        seekingPriceMax: price,
        expectedPrice: String(requestData.expectedPrice || ''),
        description: String(requestData.description || '').trim(),
        coverUrl: requestData.coverImageUrl || covers.python,
        coverImageUrl: requestData.coverImageUrl || covers.python,
        createdAt: existing ? existing.createdAt : now()
      };
      if (!item.title || !price) return { success: false, message: '请完善求购信息' };
      if (existing) Object.assign(existing, item);
      else state.requests.unshift(item);
      persist();
      return { success: true, message: existing ? '修改成功' : '发布成功', data: { requestId: item.id } };
    }
    case 'deletePurchaseRequest': {
      const index = state.requests.findIndex(item => String(item.id) === String(data.requestId) && item.postUserId === state.user.user_id);
      if (index < 0) return { success: false, message: '求购信息不存在或无权操作' };
      state.requests.splice(index, 1);
      persist();
      return { success: true, message: '删除成功' };
    }
    default:
      return { success: false, message: `演示模式暂未实现 ${name} 功能` };
  }
}

// 与小程序版 install() 等价的调用入口：模拟云函数延迟与返回结构 { result }
function callFunction(options) {
  return new Promise(resolve => {
    const delay = options && options.name === 'login' ? 80 : 160;
    setTimeout(() => {
      try {
        resolve({ result: handle(options && options.name, (options && options.data) || {}) });
      } catch (error) {
        console.error('[DemoService] mock call failed:', error);
        resolve({ result: { success: false, message: '演示数据处理失败' } });
      }
    }, delay);
  });
}

// 与小程序 wx.cloud.uploadFile 等价：H5 中本地图片已转为 dataURL，直接回传作为 fileID
function uploadFile(options) {
  return Promise.resolve({ fileID: (options && options.filePath) || covers.algorithm });
}

export default {
  isEnabled: () => DEMO_MODE,
  callFunction,
  uploadFile,
  resetDemo: () => { state = createState(); persist(); }
};
