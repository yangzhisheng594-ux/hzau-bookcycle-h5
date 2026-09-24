<template>
  <view class="page-container">
    <view class="page-nav"><view class="nav-back" @click="goBack">‹</view><text class="nav-title">管理后台</text></view>

    <!-- 管理员登录 -->
    <view class="login-card" v-if="!loggedIn">
      <view class="login-title">管理员登录</view>
      <view class="login-desc">管理平台用户审核、商品、订单与首页运营位</view>
      <input class="login-input" type="password" v-model="password" placeholder="请输入管理员密码" @keyup.enter="doLogin" />
      <button class="login-btn" :disabled="loggingIn" @click="doLogin">{{ loggingIn ? '登录中…' : '登录' }}</button>
    </view>

    <template v-else>
      <!-- 待处理提醒：只在下有待办时出现，点击直达审核 -->
      <view class="alert-bar" v-if="pendingCount" @click="switchTab('verify')">
        <view class="ov-left">
          <text class="ov-title">有 {{ pendingCount }} 条认证申请待处理</text>
          <text class="ov-sub">通过后用户即可发布与购买，点击进入审核</text>
        </view>
        <text class="ov-arrow">›</text>
      </view>
      <view class="admin-topbar">
        <text class="topbar-btn" @click="refreshActive">刷新当前页</text>
        <text class="topbar-btn" @click="logout">退出登录</text>
      </view>

      <view class="tab-bar">
        <text v-for="tab in tabs" :key="tab.key" class="tab" :class="{ active: activeTab === tab.key }" @click="switchTab(tab.key)">{{ tab.label }}<text v-if="tabBadge(tab.key)" class="tab-badge">{{ tabBadge(tab.key) }}</text></text>
      </view>

      <!-- ========== 数据概览 ========== -->
      <view v-if="activeTab === 'overview'">
        <view class="stat-grid">
          <view class="stat-card" @click="switchTab('users')">
            <text class="stat-value">{{ stats.users.total }}</text>
            <text class="stat-label">用户总数</text>
            <text class="stat-sub">今日新增 {{ stats.users.todayNew }}</text>
          </view>
          <view class="stat-card" @click="switchTab('books')">
            <text class="stat-value">{{ stats.books.total }}</text>
            <text class="stat-label">已发布书籍</text>
            <text class="stat-sub">在售 {{ stats.books.available }}</text>
          </view>
          <view class="stat-card" @click="switchTab('verify')">
            <text class="stat-value" :class="{ warn: stats.verifications.pending }">{{ stats.verifications.pending }}</text>
            <text class="stat-label">待处理认证</text>
            <text class="stat-sub">已认证 {{ stats.users.verified }}</text>
          </view>
          <view class="stat-card" @click="switchTab('orders')">
            <text class="stat-value">{{ stats.orders.completed }}</text>
            <text class="stat-label">已完成订单</text>
            <text class="stat-sub">交易中 {{ stats.orders.active }}</text>
          </view>
          <view class="stat-card" @click="switchTab('books')">
            <text class="stat-value">{{ stats.books.removed }}</text>
            <text class="stat-label">已下架书籍</text>
            <text class="stat-sub">已售出 {{ stats.books.sold }}</text>
          </view>
          <view class="stat-card" @click="switchTab('orders')">
            <text class="stat-value">{{ stats.orders.total }}</text>
            <text class="stat-label">订单总数</text>
            <text class="stat-sub">已取消 {{ stats.orders.cancelled }}</text>
          </view>
        </view>
        <view class="stat-foot">
          <text class="stat-foot-item">求购帖 <text class="stat-foot-num">{{ stats.requests.total }}</text></text>
          <text class="stat-foot-item">今日新增书籍 <text class="stat-foot-num">{{ stats.books.todayNew }}</text></text>
          <text class="stat-foot-item">运营位 <text class="stat-foot-num">{{ stats.banners.enabled }}/{{ stats.banners.total }}</text> 启用</text>
          <text class="stat-foot-item">已冻结 <text class="stat-foot-num">{{ stats.users.frozen }}</text></text>
          <text class="stat-foot-item">黑名单 <text class="stat-foot-num">{{ stats.users.blacklisted }}</text></text>
        </view>

        <!-- 登录情况：今天谁登进来了、谁没进来 -->
        <view class="section-mini" @click="switchTab('login')">
          <view class="sec-title">登录情况（点击查看明细）</view>
          <view class="stat-row">
            <view class="ls-item"><text class="ls-num ok">{{ stats.login.successToday }}</text><text class="ls-label">今日成功</text></view>
            <view class="ls-item"><text class="ls-num bad">{{ stats.login.failToday }}</text><text class="ls-label">今日失败</text></view>
            <view class="ls-item"><text class="ls-num">{{ stats.users.onlineNow }}</text><text class="ls-label">在线用户</text></view>
            <view class="ls-item"><text class="ls-num warn">{{ stats.users.neverLoggedIn }}</text><text class="ls-label">从未登录</text></view>
          </view>
        </view>

        <!-- 邮件服务状态：不配 SMTP 时验证邮件根本不会发出，必须显性可见 -->
        <view class="section-mini" @click="switchTab('mail')">
          <view class="sec-title">邮件服务（点击配置）</view>
          <view class="mail-line" :class="stats.mail.ready ? 'ml-ok' : 'ml-bad'">
            <text class="ml-dot">●</text>
            <text class="ml-text">{{ stats.mail.ready ? '正常发信中' : (stats.mail.configured ? '已配置但未启用/连接失败' : '未配置 SMTP，验证邮件不会真实发出') }}</text>
            <text class="ov-arrow">›</text>
          </view>
          <text class="mail-err" v-if="stats.mail.lastError">最近错误：{{ stats.mail.lastError }}</text>
        </view>
      </view>

      <!-- ========== 用户审核 ========== -->
      <view v-if="activeTab === 'verify'">
        <view class="verify-filter">
          <text v-for="f in verifyFilters" :key="f.key" class="filter-chip" :class="{ active: verifyFilter === f.key }" @click="verifyFilter = f.key; loadVerifications()">{{ f.label }}</text>
        </view>
        <view class="card" v-for="item in verifications" :key="item.id">
          <view class="ver-head">
            <img class="ver-avatar" :src="item.avatarUrl || '/images/demo-avatar.png'" />
            <view class="ver-user">
              <text class="ver-name">{{ item.nickName }}</text>
              <text class="ver-meta">提交于 {{ formatTime(item.createdAt) }}</text>
            </view>
            <text class="ver-status" :class="'vs-' + item.status">{{ statusText(item.status) }}</text>
          </view>
          <img class="ver-proof" v-if="item.displayProof" :src="item.displayProof" @click="preview(item.displayProof)" />
          <view class="ver-reject-reason" v-if="item.status === 'rejected'">拒绝原因：{{ item.reviewReason }}</view>
          <view class="ver-actions" v-if="item.status === 'pending'">
            <button class="btn-approve" @click="review(item, true)">通过</button>
            <button class="btn-reject" @click="openReject(item)">拒绝</button>
          </view>
        </view>
        <view class="empty" v-if="!verifications.length && !loading">暂无审核记录</view>
      </view>

      <!-- ========== 用户列表 ========== -->
      <view v-if="activeTab === 'users'">
        <view class="toolbar">
          <input class="search-input" v-model="userQuery" placeholder="搜索昵称 / 邮箱 / 用户ID" @keyup.enter="loadUsers" />
          <button class="btn-plain small" @click="loadUsers">搜索</button>
        </view>
        <view class="verify-filter">
          <text v-for="f in userFilters" :key="f.key" class="filter-chip" :class="{ active: userFilter === f.key }" @click="userFilter = f.key; loadUsers()">{{ f.label }}</text>
        </view>
        <view class="list-summary" v-if="userTotal">共 {{ userTotal }} 位用户，当前显示 {{ users.length }} 位</view>
        <view class="card" v-for="user in users" :key="user.user_id">
          <view class="ver-head">
            <img class="ver-avatar" :src="user.avatar_url || '/images/demo-avatar.png'" />
            <view class="ver-user">
              <text class="ver-name">{{ user.nick_name }}</text>
              <text class="ver-meta">{{ user.email || ('ID ' + user.user_id) }} · 发布 {{ user.bookCount }} 本 · 订单 {{ user.orderCount }} 单</text>
              <text class="ver-meta">
                最后登录：{{ user.lastLoginAt ? formatTime(user.lastLoginAt) : '从未登录' }}{{ user.lastLoginIp ? ' · ' + user.lastLoginIp : '' }} · 共 {{ user.loginCount }} 次
              </text>
            </view>
            <text class="ver-status" :class="'vs-' + user.verifyStatus">{{ statusText(user.verifyStatus) }}</text>
          </view>
          <view class="user-tags">
            <text class="mini-tag" v-if="user.deleted">已注销</text>
            <text class="mini-tag danger" v-if="user.frozen">已冻结</text>
            <text class="mini-tag danger" v-if="user.blacklisted">黑名单</text>
            <text class="mini-tag warn" v-if="user.locked">密码锁定中</text>
            <text class="mini-tag warn" v-if="user.restrictPublishUntil">限发布</text>
            <text class="mini-tag warn" v-if="user.restrictBuyUntil">限购买</text>
            <text class="mini-tag warn" v-if="user.failedLogins">近期失败 {{ user.failedLogins }} 次</text>
          </view>
          <view class="ver-reject-reason" v-if="user.frozen && user.frozenReason">冻结原因：{{ user.frozenReason }}</view>
          <view class="ver-reject-reason" v-if="user.verifyStatus === 'rejected' && user.rejectReason">拒绝原因：{{ user.rejectReason }}</view>
          <view class="ver-actions">
            <button class="btn-plain small" @click="openUserDetail(user)">查看详情</button>
            <button class="btn-plain small" @click="openUserBooks(user)">发布的书（{{ user.bookCount }}）</button>
            <template v-if="!user.deleted">
              <button v-if="!user.frozen" class="btn-reject small" @click="quickToggleFreeze(user)">冻结</button>
              <button v-else class="btn-approve small" @click="quickToggleFreeze(user)">解冻</button>
              <button class="btn-reject small" @click="deleteUserItem(user)">删除</button>
            </template>
          </view>
        </view>
        <view class="empty" v-if="!users.length && !loading">{{ userQuery || userFilter !== 'all' ? '没有符合条件的用户' : '暂无用户' }}</view>
      </view>

      <!-- ========== 登录记录 ========== -->
      <view v-if="activeTab === 'login'">
        <view class="login-summary">
          <view class="ls-item"><text class="ls-num ok">{{ loginSummary.success }}</text><text class="ls-label">登录成功</text></view>
          <view class="ls-item"><text class="ls-num bad">{{ loginSummary.fail }}</text><text class="ls-label">登录失败</text></view>
          <view class="ls-item"><text class="ls-num warn">{{ loginSummary.locked }}</text><text class="ls-label">被锁定</text></view>
          <view class="ls-item"><text class="ls-num warn">{{ loginSummary.blocked }}</text><text class="ls-label">被拦截</text></view>
        </view>
        <view class="login-hint">「被拦截」= 触发频率限制或人机校验；「未登录成功」多为账号不存在或密码错误。</view>
        <view class="verify-filter">
          <text v-for="f in loginFilters" :key="f.key" class="filter-chip" :class="{ active: loginFilter === f.key }" @click="loginFilter = f.key; loadLoginRecords()">{{ f.label }}</text>
        </view>
        <view class="toolbar">
          <input class="search-input" v-model="loginQuery" placeholder="搜索账号 / 昵称 / IP" @keyup.enter="loadLoginRecords" />
          <button class="btn-plain small" @click="loadLoginRecords">搜索</button>
        </view>
        <view class="toolbar">
          <button class="btn-plain small" @click="clearLoginRecords(0)">清空「{{ loginFilterLabel }}」（{{ loginRecords.length }} 条）</button>
          <button class="btn-plain small" @click="clearLoginRecords(30)">只留最近 30 天</button>
        </view>
        <view class="card login-card-row" v-for="rec in loginRecords" :key="rec.id">
          <view class="rec-head">
            <text class="mini-tag" :class="rec.success ? 'ok-tag' : 'bad-tag'">{{ rec.success ? '登录成功' : '未登入' }}</text>
            <text class="rec-reason">{{ rec.reasonText }}</text>
            <text class="rec-time">{{ formatTime(rec.createdAt) }}</text>
          </view>
          <text class="rec-account">{{ rec.account || '（未提供账号）' }}{{ rec.nickName ? ' · ' + rec.nickName : '' }}</text>
          <text class="rec-meta">IP {{ rec.ip || '—' }}{{ rec.accountExists ? '' : ' · 账号不存在' }}</text>
          <view class="ver-actions">
            <button class="btn-plain small" @click="deleteLoginRecord(rec)">删除此条</button>
          </view>
        </view>
        <view class="empty" v-if="!loginRecords.length && !loading">暂无登录记录</view>
      </view>

      <!-- ========== 邮件设置 ========== -->
      <view v-if="activeTab === 'mail'" class="mail-tab">
        <view class="mail-status" :class="mailStatus.ready ? 'ms-ok' : 'ms-bad'">
          <text class="ms-title">{{ mailStatus.ready ? '邮件服务正常，发信中' : '邮件服务未就绪，验证邮件发不出去' }}</text>
          <text class="ms-desc" v-if="mailStatus.ready">已连接 {{ mailStatus.host }}:{{ mailStatus.port }}（{{ mailStatus.secure ? 'SSL/TLS' : 'STARTTLS' }}），注册验证与找回密码邮件会真实发出。</text>
          <text class="ms-desc" v-else>{{ mailStatus.readyReason || '配置不完整，请检查服务器 / 账号 / 授权码' }}</text>
          <text class="ms-meta">配置来源：{{ mailSourceText }}<text v-if="mailStatus.fileConfigPresent">（已固化到部署包，重新部署不丢）</text></text>
          <text class="ms-meta" v-if="mailStatus.meta && mailStatus.meta.lastError">最近错误：{{ mailStatus.meta.lastError }}</text>
          <text class="ms-meta" v-if="mailStatus.meta && mailStatus.meta.lastSuccessAt">最近成功发信：{{ formatTime(mailStatus.meta.lastSuccessAt) }}（累计 {{ mailStatus.meta.sentCount }} 封）</text>
        </view>

        <view class="section-mini">
          <view class="sec-title">SMTP 配置</view>
          <view class="preset-row">
            <text v-for="p in mailPresets" :key="p.key" class="filter-chip" :class="{ active: mailForm.preset === p.key }" @click="applyPreset(p)">{{ p.label }}</text>
          </view>
          <view class="form-row">
            <text class="form-label">启用</text>
            <text class="switch" :class="{ on: mailForm.enabled }" @click="mailForm.enabled = !mailForm.enabled">{{ mailForm.enabled ? '已开启' : '已关闭' }}</text>
          </view>
          <view class="form-row">
            <text class="form-label">服务器</text>
            <input class="form-input" v-model="mailForm.host" placeholder="smtp.qq.com" />
          </view>
          <view class="form-row">
            <text class="form-label">端口</text>
            <input class="form-input" type="number" v-model="mailForm.port" placeholder="465" />
          </view>
          <view class="form-row">
            <text class="form-label">加密</text>
            <text class="switch" :class="{ on: mailForm.secure }" @click="mailForm.secure = !mailForm.secure">{{ mailForm.secure ? 'SSL/TLS（465）' : 'STARTTLS（587）' }}</text>
          </view>
          <view class="form-row">
            <text class="form-label">账号</text>
            <input class="form-input" v-model="mailForm.user" placeholder="发信邮箱，如 xxx@qq.com" />
          </view>
          <view class="form-row">
            <text class="form-label">授权码</text>
            <input class="form-input" type="password" v-model="mailForm.pass" :placeholder="mailStatus.hasPassword ? '已保存，留空表示不修改' : 'SMTP 授权码（不是邮箱登录密码）'" />
          </view>
          <view class="form-row">
            <text class="form-label">发件人</text>
            <input class="form-input" v-model="mailForm.from" placeholder="留空则用账号本身" />
          </view>
          <view class="ver-actions">
            <button class="btn-plain small" :disabled="mailExporting" @click="exportMailConfig">{{ mailExporting ? '导出中…' : '导出配置（固化到部署包）' }}</button>
            <button class="btn-approve" :disabled="mailSaving" @click="saveMail">{{ mailSaving ? '保存中…' : '保存配置' }}</button>
          </view>
          <view class="login-hint">点「导出配置」会把当前配置（含授权码）复制到剪贴板，交给开发者写入部署包 <text class="hl">server/mail-config.json</text> 后重新部署 —— 这样连「重新部署」也不会再丢配置。</view>
          <view class="login-hint">QQ / 163 邮箱需在网页版「设置 → 账户」里开启 SMTP 服务并生成<text class="hl">授权码</text>填到这里；直接用登录密码会认证失败。启用状态下，服务器 / 账号 / 授权码三者缺一不可，否则保存会被拒绝。</view>
        </view>

        <view class="section-mini">
          <view class="sec-title">发送测试邮件</view>
          <view class="toolbar">
            <input class="search-input" v-model="mailTestTo" placeholder="收件邮箱，例如 you@qq.com" />
            <button class="btn-plain small" :disabled="mailTesting" @click="testMail">{{ mailTesting ? '发送中…' : '发送测试' }}</button>
          </view>
          <view class="login-hint">测试走真实 SMTP 直发且不降级，失败原因会原样显示，便于区分「授权码错 / 端口错 / 被拦截」。</view>
        </view>

        <view class="section-mini">
          <view class="sec-title">待人工代发（{{ mailOutbox.length }}）</view>
          <view class="login-hint">邮件服务不可用时，注册验证与找回密码的链接会记录在这里，由管理员通过微信发给本人。配置好 SMTP 后请清空，避免令牌长期留存。</view>
          <view class="card" v-for="m in mailOutbox" :key="m.at + m.to">
            <text class="rec-account">{{ m.to }}</text>
            <text class="rec-meta">{{ m.subject }} · {{ formatTime(m.at) }}</text>
            <text class="outbox-link" @click="copyMailLink(m.link)">{{ m.link }}</text>
          </view>
          <view class="ver-actions" v-if="mailOutbox.length">
            <button class="btn-reject small" @click="clearOutbox">清空队列</button>
          </view>
          <view class="empty" v-if="!mailOutbox.length && !loading">暂无待发邮件</view>
        </view>
      </view>

      <!-- ========== 商品管理 ========== -->
      <view v-if="activeTab === 'books'">
        <view class="toolbar">
          <input class="search-input" v-model="bookQuery" placeholder="搜索书名 / 作者 / ISBN / 卖家ID" @keyup.enter="loadBooks" />
          <button class="btn-plain small" @click="loadBooks">搜索</button>
        </view>
        <view class="verify-filter">
          <text v-for="f in bookFilters" :key="f.key" class="filter-chip" :class="{ active: bookFilter === f.key }" @click="bookFilter = f.key; loadBooks()">{{ f.label }}</text>
        </view>
        <view class="list-summary" v-if="bookTotal">共 {{ bookTotal }} 本书，当前显示 {{ books.length }} 本</view>
        <view class="card" v-for="book in books" :key="book.id">
          <view class="book-row">
            <img class="book-cover" v-if="book.coverUrl" :src="book.coverUrl" />
            <view class="book-info">
              <text class="ver-name">{{ book.title || '（无标题）' }}</text>
              <text class="ver-meta">{{ book.sellerInfo ? book.sellerInfo.nickName : '未知卖家' }} · ¥{{ book.price }}</text>
              <text class="ver-meta" v-if="book.major || book.grade">{{ book.major || '' }}{{ book.grade ? ' ' + book.grade : '' }} · 卖家ID {{ book.userId }}</text>
            </view>
            <text class="ver-status" :class="'bs-' + book.status">{{ bookStatusText(book.status) }}</text>
          </view>
          <view class="ver-actions">
            <button v-if="book.status === 'available'" class="btn-reject small" @click="setBookStatus(book, 'removed')">下架</button>
            <button v-if="book.status === 'removed'" class="btn-approve small" @click="setBookStatus(book, 'available')">上架</button>
            <button v-if="canDeleteBook(book)" class="btn-danger small" @click="deleteBook(book)">删除</button>
          </view>
        </view>
        <view class="empty" v-if="!books.length && !loading">{{ bookQuery || bookFilter !== 'all' ? '没有符合条件的商品' : '暂无商品' }}</view>
      </view>

      <!-- ========== 订单管理 ========== -->
      <view v-if="activeTab === 'orders'">
        <view class="card" v-for="order in orders" :key="order.orderId">
          <view class="ver-head">
            <view class="ver-user">
              <text class="ver-name">{{ order.title }}</text>
              <text class="ver-meta">买家 {{ order.buyerName }} → 卖家 {{ order.sellerName }} · ¥{{ order.displayPrice }}</text>
              <text class="ver-meta">{{ order.orderNumber }}</text>
            </view>
            <text class="ver-status" :class="'os-' + order.status">{{ order.statusText }}</text>
          </view>
          <view class="ver-actions">
            <button v-if="['locked','trading'].includes(order.status)" class="btn-reject small" @click="cancelOrder(order)">关闭异常订单</button>
            <button v-else class="btn-danger small" @click="deleteOrder(order)">删除订单</button>
          </view>
        </view>
        <view class="empty" v-if="!orders.length && !loading">暂无订单</view>
      </view>

      <!-- ========== 求购帖管理 ========== -->
      <view v-if="activeTab === 'requests'">
        <view class="toolbar">
          <input class="search-input" v-model="requestQuery" placeholder="搜索书名 / 专业 / 发布者" @keyup.enter="loadRequests" />
          <button class="btn-plain small" @click="loadRequests">搜索</button>
        </view>
        <view class="list-summary" v-if="requestTotal">共 {{ requestTotal }} 条求购，当前显示 {{ requests.length }} 条</view>
        <view class="card" v-for="item in requests" :key="item.id">
          <view class="book-row">
            <img class="book-cover" v-if="item.coverUrl" :src="item.coverUrl" />
            <view class="book-info">
              <text class="ver-name">{{ item.title || '（无书名）' }}</text>
              <text class="ver-meta">期望价 ¥{{ item.expectedPrice }} · {{ item.posterName }}</text>
              <text class="ver-meta" v-if="item.major || item.grade">{{ item.major || '' }}{{ item.grade ? ' ' + item.grade : '' }} · 发布者ID {{ item.postUserId }}</text>
              <text class="ver-meta" v-if="item.description">{{ item.description }}</text>
            </view>
          </view>
          <view class="ver-actions">
            <button class="btn-danger small" @click="deleteRequestItem(item)">删除求购帖</button>
          </view>
        </view>
        <view class="empty" v-if="!requests.length && !loading">{{ requestQuery ? '没有符合条件的求购帖' : '暂无求购帖' }}</view>
      </view>

      <!-- ========== 运营位管理 ========== -->
      <view v-if="activeTab === 'banners'">
        <view class="card" v-for="banner in banners" :key="banner.id">
          <view class="ver-head">
            <view class="ver-user">
              <text class="ver-name">{{ banner.title }}</text>
              <text class="ver-meta">{{ banner.subtitle || '（无副标题）' }} · 排序 {{ banner.sort }}</text>
            </view>
            <text class="ver-status" :class="banner.enabled ? 'vs-approved' : 'vs-rejected'">{{ banner.enabled ? '启用中' : '已停用' }}</text>
          </view>
          <view class="ver-actions">
            <button class="btn-plain small" @click="editBanner(banner)">编辑</button>
            <button class="btn-plain small" @click="toggleBanner(banner)">{{ banner.enabled ? '停用' : '启用' }}</button>
            <button class="btn-reject small" @click="deleteBanner(banner)">删除</button>
          </view>
        </view>
        <button class="add-banner-btn" @click="editBanner(null)">＋ 新增运营位</button>
      </view>

      <!-- ========== 存储与数据清理 ========== -->
      <view v-if="activeTab === 'storage'" class="storage-tab">
        <view class="empty" v-if="!storage">加载中…</view>
        <template v-else>
          <view class="st-cards">
            <view class="st-card">
              <text class="st-num">{{ formatBytes(storage.dataBytes) }}</text>
              <text class="st-label">数据库文件</text>
            </view>
            <view class="st-card">
              <text class="st-num">{{ formatBytes(storage.uploads.bytes) }}</text>
              <text class="st-label">图片占用 · {{ storage.uploads.files }} 张</text>
            </view>
            <view class="st-card" :class="{ 'st-warn': storage.orphans.count }">
              <text class="st-num">{{ storage.orphans.count }}</text>
              <text class="st-label">孤儿图片 · {{ formatBytes(storage.orphans.bytes) }}</text>
            </view>
          </view>

          <view class="st-hint">
            会随时间无限增长的只有「只写不删」的表：登录审计、安全日志、后台日志、会话与令牌。它们跟账号数量无关，跟运行时长和被攻击次数有关。因此按保留期（当前 {{ storage.retentionDays }} 天）自动清理，进程启动时与每 6 小时各跑一次。
          </view>

          <view class="section-mini">
            <view class="sec-title">db.json 各集合占用（按体积排序）</view>
            <view class="st-row" v-for="c in storage.collections" :key="c.name">
              <text class="st-row-name">{{ c.name }}</text>
              <text class="st-row-count">{{ c.count }} 条</text>
              <text class="st-row-bytes">{{ formatBytes(c.bytes) }}</text>
            </view>
          </view>

          <view class="section-mini" v-if="storage.orphans.count">
            <view class="sec-title">孤儿图片（磁盘上有，但已无任何数据引用）</view>
            <text class="st-file" v-for="(f, i) in storage.orphans.sample" :key="i">{{ f }}</text>
            <text class="st-hint" v-if="storage.orphans.count > storage.orphans.sample.length">…等共 {{ storage.orphans.count }} 张</text>
          </view>

          <view class="st-actions">
            <button class="btn-plain" @click="previewCleanup">预演清理</button>
            <button class="btn-reject" :disabled="cleaning" @click="runCleanup">{{ cleaning ? '清理中…' : '立即清理' }}</button>
          </view>

          <view class="section-mini">
            <view class="sec-title">数据备份</view>
            <view class="login-hint">
              线上数据只是一个 JSON 文件，而重新部署会用开发者本地的库覆盖线上 —— 所以部署前必须先执行
              <text class="hl">npm run deploy:prep</text>（把 server/data 移出项目目录）。
              上线前建议先在这里导出留底：文件含全部集合与设置，可直接写回 server/data/db.json 还原。
            </view>
            <view class="st-actions">
              <button class="btn-approve" :disabled="backingUp" @click="downloadBackup">{{ backingUp ? '导出中…' : '导出全量数据备份' }}</button>
            </view>
            <view class="login-hint" v-if="lastBackupLabel">最近导出：{{ lastBackupLabel }}</view>
          </view>
        </template>
      </view>

      <!-- ========== 操作日志 ========== -->
      <view v-if="activeTab === 'logs'">
        <view class="toolbar">
          <button class="btn-plain small" @click="clearLogs(30)">只留最近 30 天</button>
          <button class="btn-plain small" @click="clearLogs(0)">清空全部（{{ logs.length }} 条）</button>
        </view>
        <view class="card log-card" v-for="log in logs" :key="log.id">
          <text class="log-text">{{ formatTime(log.createdAt) }} · {{ log.adminId }} · {{ log.action }} · {{ log.targetType }}#{{ log.targetId }} {{ log.detail }}</text>
        </view>
        <view class="empty" v-if="!logs.length && !loading">暂无操作日志</view>
      </view>
    </template>

    <!-- 拒绝原因弹窗 -->
    <view class="modal-mask" v-if="rejectTarget" @click="rejectTarget = null">
      <view class="modal" @click.stop>
        <view class="modal-title">拒绝「{{ rejectTarget.nickName }}」的认证</view>
        <view class="reason-chips">
          <text v-for="r in rejectPresets" :key="r" class="reason-chip" :class="{ active: rejectReason === r }" @click="rejectReason = r">{{ r }}</text>
        </view>
        <input class="modal-input" v-model="rejectReason" placeholder="或填写其他原因（必填）" />
        <view class="modal-actions">
          <button class="btn-plain" @click="rejectTarget = null">取消</button>
          <button class="btn-reject" @click="confirmReject">确认拒绝</button>
        </view>
      </view>
    </view>

    <!-- 某用户发布的书（下钻） -->
    <view class="modal-mask" v-if="userBooksTarget" @click="closeUserBooks">
      <view class="modal" @click.stop>
        <view class="modal-title">{{ userBooksTarget.nick_name }} 发布的书</view>
        <view class="modal-sub">共 {{ userBooks.length }} 本 · 含已下架与已售出</view>
        <view class="ub-item" v-for="book in userBooks" :key="book.id">
          <img class="ub-cover" v-if="book.coverUrl" :src="book.coverUrl" />
          <view class="ub-info">
            <text class="ub-title">{{ book.title || '（无标题）' }}</text>
            <text class="ub-meta">¥{{ book.price }} · {{ bookStatusText(book.status) }}</text>
          </view>
          <button v-if="book.status === 'available'" class="btn-reject small" @click="setBookStatus(book, 'removed')">下架</button>
          <button v-if="book.status === 'removed'" class="btn-approve small" @click="setBookStatus(book, 'available')">上架</button>
          <button v-if="canDeleteBook(book)" class="btn-danger small" @click="deleteBook(book)">删除</button>
        </view>
        <view class="empty" v-if="!userBooks.length && !userBooksLoading">该用户暂无发布书籍</view>
        <view class="modal-actions">
          <button class="btn-plain" @click="closeUserBooks">关闭</button>
        </view>
      </view>
    </view>

    <!-- 运营位编辑弹窗 -->
    <view class="modal-mask" v-if="bannerForm" @click="bannerForm = null">
      <view class="modal" @click.stop>
        <view class="modal-title">{{ bannerForm.id ? '编辑运营位' : '新增运营位' }}</view>
        <input class="modal-input" v-model="bannerForm.title" placeholder="标题（必填），如：勤读力耕，立己达人" />
        <input class="modal-input" v-model="bannerForm.subtitle" placeholder="副标题（选填）" />
        <input class="modal-input" v-model="bannerForm.imageUrl" placeholder="图片URL（选填）" />
        <input class="modal-input" v-model="bannerForm.linkUrl" placeholder="跳转链接（选填）" />
        <input class="modal-input" v-model="bannerForm.sort" type="number" placeholder="排序（数字小在前）" />
        <view class="modal-actions">
          <button class="btn-plain" @click="bannerForm = null">取消</button>
          <button class="btn-approve" @click="saveBanner">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue';
import * as wx from '../services/wx';
import { isAdminLoggedIn, setAdminToken, loadPrivateImage } from '../services/server';

const loggedIn = ref(false);
const password = ref('');
const loggingIn = ref(false);
const activeTab = ref('overview');
const loading = ref(false);
const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'verify', label: '用户审核' },
  { key: 'users', label: '用户' },
  { key: 'login', label: '登录记录' },
  { key: 'books', label: '商品' },
  { key: 'requests', label: '求购' },
  { key: 'orders', label: '订单' },
  { key: 'banners', label: '运营位' },
  { key: 'mail', label: '邮件' },
  { key: 'storage', label: '存储' },
  { key: 'logs', label: '日志' }
];

// 概览指标：结构固定，避免模板访问 undefined
function emptyStats() {
  return {
    users: { total: 0, deleted: 0, verified: 0, pending: 0, todayNew: 0, frozen: 0, blacklisted: 0, neverLoggedIn: 0, onlineNow: 0 },
    login: { successTotal: 0, failTotal: 0, successToday: 0, failToday: 0, lockedToday: 0, blockedToday: 0, activeSessions: 0 },
    books: { total: 0, available: 0, trading: 0, sold: 0, removed: 0, todayNew: 0 },
    orders: { total: 0, active: 0, completed: 0, cancelled: 0 },
    requests: { total: 0 },
    verifications: { pending: 0 },
    banners: { total: 0, enabled: 0 },
    mail: { ready: false, enabled: false, configured: false, mode: 'dev', lastError: '' },
    storage: { dataBytes: 0, uploadBytes: 0, uploadFiles: 0, orphanCount: 0, retentionDays: 90 }
  };
}
const stats = ref(emptyStats());

const verifications = ref([]);
const pendingCount = ref(0);
const verifyFilter = ref('pending');
const verifyFilters = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部' }
];

// 用户列表：关键词 + 认证状态筛选
const users = ref([]);
const userQuery = ref('');
const userFilter = ref('all');
const userTotal = ref(0);
const userFilters = [
  { key: 'all', label: '全部' },
  { key: 'approved', label: '已认证' },
  { key: 'pending', label: '待审核' },
  { key: 'none', label: '未认证' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'frozen', label: '已冻结' },
  { key: 'deleted', label: '已注销' }
];

// 登录记录：谁登录上去了、谁没登上来、为什么
const loginRecords = ref([]);
const loginFilter = ref('all');
const loginQuery = ref('');
const loginSummary = ref({ success: 0, fail: 0, userNotFound: 0, wrongPassword: 0, locked: 0, rateLimited: 0, challenge: 0, frozen: 0 });
const loginFilters = [
  { key: 'all', label: '全部' },
  { key: 'success', label: '成功' },
  { key: 'fail', label: '失败' }
];

// 邮件设置：SMTP 配置在后台维护（托管沙箱没有环境变量入口），保存即生效
const mailStatus = ref({
  ready: false, enabled: false, configured: false, mode: 'dev', nodemailerInstalled: false,
  nodemailerError: '', host: '', port: 465, secure: true, user: '', hasPassword: false,
  from: '', configSource: 'none', readyReason: '', authComplete: false,
  fileConfigPresent: false, configFilePath: '', meta: {}
});
const mailForm = ref({ preset: 'custom', enabled: false, host: '', port: 465, secure: true, user: '', pass: '', from: '' });
const mailSaving = ref(false);
const mailTesting = ref(false);
const mailExporting = ref(false);
const mailTestTo = ref('');
const mailOutbox = ref([]);
// 配置存在哪 —— 直接告诉管理员「会不会丢」
const mailSourceText = computed(() => ({
  backend: '后台保存（存在服务器实例内）',
  file: '部署包文件 mail-config.json（重新部署不丢）',
  env: '环境变量',
  none: '尚未配置'
}[mailStatus.value.configSource] || '尚未配置'));
const mailPresets = [
  { key: 'qq', label: 'QQ 邮箱', host: 'smtp.qq.com', port: 465, secure: true },
  { key: 'qq-exmail', label: '腾讯企业邮', host: 'smtp.exmail.qq.com', port: 465, secure: true },
  { key: '163', label: '163 邮箱', host: 'smtp.163.com', port: 465, secure: true },
  { key: 'custom', label: '自定义', host: '', port: 465, secure: true }
];

// 某用户发布书籍下钻
const userBooksTarget = ref(null);
const userBooks = ref([]);
const userBooksLoading = ref(false);

// 商品列表：关键词 + 状态筛选
const books = ref([]);
const bookQuery = ref('');
const bookFilter = ref('all');
const bookTotal = ref(0);
const bookFilters = [
  { key: 'all', label: '全部' },
  { key: 'available', label: '可购买' },
  { key: 'trading', label: '交易中' },
  { key: 'sold', label: '已售出' },
  { key: 'removed', label: '已下架' }
];

const orders = ref([]);
const banners = ref([]);
const logs = ref([]);

// 求购帖（用户发布的「买书」信息）
const requests = ref([]);
const requestQuery = ref('');
const requestTotal = ref(0);

const rejectTarget = ref(null);
const rejectReason = ref('');
const rejectPresets = ['截图不清晰', '无法确认身份', '资料不完整'];
const bannerForm = ref(null);

// 按页签惰性加载：进入后台只拉当前页签，避免登录即并发拉取全部数据
const loadedTabs = {};
onMounted(() => {
  loggedIn.value = isAdminLoggedIn();
  if (loggedIn.value) initPanel();
});

// 从用户详情页返回时刷新：那里可能刚删除了用户或改了处置状态
onActivated(() => {
  if (loggedIn.value && activeTab.value !== 'overview') refreshActive();
});

async function initPanel() {
  activeTab.value = 'overview';
  await loadStats();
  loadedTabs.overview = true;
}

async function doLogin() {
  if (!password.value || loggingIn.value) return;
  loggingIn.value = true;
  const res = await wx.cloud.callFunction({ name: 'adminLogin', data: { password: password.value } });
  loggingIn.value = false;
  if (res.result && res.result.success && res.result.token) {
    setAdminToken(res.result.token);
    loggedIn.value = true;
    wx.showToast({ title: '登录成功', icon: 'success' });
    initPanel();
  } else {
    wx.showToast({ title: (res.result && res.result.message) || '登录失败', icon: 'none' });
  }
}

function switchTab(key) {
  activeTab.value = key;
  if (loadedTabs[key]) return;
  loadTab(key).then(() => { loadedTabs[key] = true; });
}

function loadTab(key) {
  if (key === 'overview') return loadStats();
  if (key === 'verify') return loadVerifications();
  if (key === 'users') return loadUsers();
  if (key === 'login') return loadLoginRecords();
  if (key === 'books') return loadBooks();
  if (key === 'requests') return loadRequests();
  if (key === 'orders') return loadOrders();
  if (key === 'banners') return loadBanners();
  if (key === 'mail') return loadMailSettings();
  if (key === 'storage') return loadStorage();
  if (key === 'logs') return loadLogs();
  return Promise.resolve();
}

function refreshActive() {
  loadTab(activeTab.value).then(() => { loadedTabs[activeTab.value] = true; });
}

// 徽标取「总量」而非当前筛选结果，避免筛选后数字跳动造成误解
function tabBadge(key) {
  if (key === 'verify') return pendingCount.value || '';
  if (key === 'users') return stats.value.users.total || '';
  if (key === 'login') return stats.value.login.failToday || '';
  if (key === 'books') return stats.value.books.total || '';
  if (key === 'requests') return requestTotal.value || '';
  if (key === 'orders') return stats.value.orders.total || '';
  if (key === 'banners') return stats.value.banners.total || '';
  // 邮件不通是"隐形故障"：不配 SMTP 时验证邮件根本不发，这里必须显性提醒
  if (key === 'mail') return stats.value.mail && stats.value.mail.ready ? '' : '!';
  // 有孤儿图片说明「删了书但文件还在磁盘上」，属于该清理的信号
  if (key === 'storage') return stats.value.storage && stats.value.storage.orphanCount ? stats.value.storage.orphanCount : '';
  if (key === 'logs') return logs.value.length || '';
  return '';
}

function logout() {
  wx.showModal({
    title: '退出管理后台',
    content: '确定退出管理员登录吗？',
    success: res => {
      if (!res.confirm) return;
      setAdminToken('');
      loggedIn.value = false;
      password.value = '';
      wx.showToast({ title: '已退出', icon: 'success' });
    }
  });
}

async function call(name, data) {
  loading.value = true;
  const res = await wx.cloud.callFunction({ name, data });
  loading.value = false;
  if (!res.result || !res.result.success) {
    wx.showToast({ title: (res.result && res.result.message) || '操作失败', icon: 'none' });
    return null;
  }
  return res.result;
}

async function loadStats() {
  const result = await call('adminGetStats');
  if (!result) return;
  const d = result.data || {};
  stats.value = { ...emptyStats(), ...d };
  // 概览一次性拿到待办数，省掉单独的审核列表请求
  if (d.verifications) pendingCount.value = d.verifications.pending || 0;
}

async function loadVerifications() {
  const result = await call('adminGetVerifications', { status: verifyFilter.value });
  if (result) {
    const list = result.data || [];
    // 审核截图是私有文件，需鉴权 fetch 转 blob 才能显示
    await Promise.all(list.map(async item => {
      item.displayProof = item.proofImage ? await loadPrivateImage(item.proofImage, { admin: true }) : '';
    }));
    verifications.value = list;
    // 当前筛选即「待审核」时，列表长度就是待办数，省掉一次冗余请求
    if (verifyFilter.value === 'pending') { pendingCount.value = list.length; return; }
  }
  const pending = await call('adminGetVerifications', { status: 'pending' });
  if (pending) pendingCount.value = (pending.data || []).length;
}

async function loadUsers() {
  const params = { q: userQuery.value.trim(), status: userFilter.value === 'frozen' ? 'all' : userFilter.value };
  if (userFilter.value === 'frozen') params.frozen = 1;
  const result = await call('adminGetUsers', params);
  if (result) {
    users.value = result.data || [];
    userTotal.value = Number(result.total) || users.value.length;
  }
}

async function loadLoginRecords() {
  const result = await call('adminGetLoginRecords', {
    result: loginFilter.value,
    q: loginQuery.value.trim(),
    limit: 200
  });
  if (result) {
    loginRecords.value = result.data || [];
    loginSummary.value = result.summary || loginSummary.value;
  }
}

const loginFilterLabel = computed(() => {
  const hit = loginFilters.find(f => f.key === loginFilter.value);
  return hit ? hit.label : '全部';
});

async function deleteLoginRecord(rec) {
  const result = await call('adminDeleteLoginRecord', { id: rec.id });
  if (!result) return;
  wx.showToast({ title: result.message || '已删除', icon: 'success' });
  loadLoginRecords();
  loadStats();
}

// keepDays>0 走「全局只留最近 N 天」，忽略当前筛选；否则按当前筛选全部清掉
function clearLoginRecords(keepDays) {
  const payload = keepDays > 0
    ? { keepDays, result: 'all', q: '' }
    : { keepDays: 0, result: loginFilter.value, q: loginQuery.value.trim() };
  const label = keepDays > 0
    ? `只保留最近 ${keepDays} 天的登录记录，更早的全部删除`
    : `清空「${loginFilterLabel.value}」筛选下的 ${loginRecords.value.length} 条记录`;
  wx.showModal({
    title: '清空登录记录',
    content: `${label}？\n\n登录记录是「谁登录过、谁没登上来、为什么」的唯一凭据，删掉无法恢复。`,
    confirmText: '确认清空',
    confirmColor: '#b35353',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminClearLoginRecords', payload);
      if (!result) return;
      wx.showToast({ title: result.message || '已清空', icon: 'none', duration: 2500 });
      loadLoginRecords();
      loadStats();
    }
  });
}

// 打开用户详情页（完整画像 + 处置入口）
function openUserDetail(user) {
  wx.navigateTo({ url: `/pages/admin/userDetail?userId=${user.user_id}` });
}

/* ================= 邮件设置 ================= */

function matchPreset(host) {
  const hit = mailPresets.find(p => p.key !== 'custom' && p.host === host);
  return hit ? hit.key : 'custom';
}

function applyPreset(preset) {
  mailForm.value.preset = preset.key;
  if (preset.key === 'custom') return;
  mailForm.value.host = preset.host;
  mailForm.value.port = preset.port;
  mailForm.value.secure = preset.secure;
}

async function loadMailSettings() {
  const result = await call('adminGetMailSettings');
  if (result && result.data) {
    const d = result.data;
    mailStatus.value = d;
    mailForm.value = {
      preset: matchPreset(d.host),
      enabled: Boolean(d.enabled),
      host: d.host || '',
      port: d.port || 465,
      secure: d.secure !== false,
      user: d.user || '',
      pass: '', // 密码永不回显
      from: d.from || ''
    };
    if (!mailTestTo.value) mailTestTo.value = d.user || '';
  }
  const outbox = await call('adminGetMailOutbox', { limit: 20 });
  if (outbox) mailOutbox.value = outbox.data || [];
}

async function saveMail() {
  if (mailSaving.value) return;
  mailSaving.value = true;
  const result = await call('adminSaveMailSettings', {
    enabled: mailForm.value.enabled,
    host: mailForm.value.host,
    port: Number(mailForm.value.port) || 465,
    secure: mailForm.value.secure,
    user: mailForm.value.user,
    pass: mailForm.value.pass,
    from: mailForm.value.from
  });
  mailSaving.value = false;
  if (result) {
    if (result.success) {
      wx.showToast({ title: result.message || '已保存', icon: 'success' });
    } else {
      // 保存被拒（如缺账号/授权码）必须原样告诉管理员，不能假装成功
      wx.showToast({ title: result.message || '保存失败', icon: 'none' });
    }
    await loadMailSettings();
    loadStats();
  }
}

// 导出配置（含授权码）→ 剪贴板，交给开发者写进部署包 mail-config.json
async function exportMailConfig() {
  if (mailExporting.value) return;
  mailExporting.value = true;
  const result = await call('adminExportMailSettings');
  mailExporting.value = false;
  if (!result || !result.success || !result.data) {
    wx.showToast({ title: (result && result.message) || '导出失败', icon: 'none' });
    return;
  }
  const d = result.data;
  const payload = {
    enabled: d.enabled, host: d.host, port: d.port, secure: d.secure,
    user: d.user, pass: d.pass, from: d.from, appBaseUrl: d.appBaseUrl
  };
  const text = JSON.stringify(payload, null, 2);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      wx.showToast({ title: '配置已复制，粘贴给开发者固化', icon: 'none' });
    } else {
      wx.showModal({ title: '配置内容（手动复制）', content: text, showCancel: false });
    }
  } catch (e) {
    wx.showModal({ title: '配置内容（手动复制）', content: text, showCancel: false });
  }
}

async function testMail() {
  if (mailTesting.value) return;
  const to = (mailTestTo.value || '').trim();
  if (!to) {
    wx.showToast({ title: '请填写收件邮箱', icon: 'none' });
    return;
  }
  mailTesting.value = true;
  const result = await call('adminTestMail', { to });
  mailTesting.value = false;
  if (result) wx.showToast({ title: result.message || '测试邮件已发出', icon: 'none' });
  await loadMailSettings();
}

async function clearOutbox() {
  const result = await call('adminClearMailOutbox');
  if (result) {
    wx.showToast({ title: '已清空待发队列', icon: 'success' });
    await loadMailSettings();
  }
}

function copyMailLink(link) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link);
      wx.showToast({ title: '链接已复制，可发给用户', icon: 'success' });
      return;
    }
  } catch (e) { /* 降级到提示 */ }
  wx.showToast({ title: link, icon: 'none' });
}

// 列表内快捷处置：冻结 / 解冻（完整处置在用户详情页）
function quickToggleFreeze(user) {
  const freezing = !user.frozen;
  wx.showModal({
    title: freezing ? '冻结账号' : '解冻账号',
    content: freezing
      ? `冻结「${user.nick_name}」后其无法登录，所有设备立即下线。`
      : `解冻「${user.nick_name}」后其可重新登录。`,
    success: async res => {
      if (!res.confirm) return;
      const reason = freezing ? '管理员在列表中冻结' : '管理员在列表中解冻';
      const result = await call('adminSetUserStatus', {
        userId: user.user_id,
        action: freezing ? 'freeze' : 'unfreeze',
        reason
      });
      if (result) {
        wx.showToast({ title: result.message || '已执行', icon: 'success' });
        loadUsers();
        loadStats();
      }
    }
  });
}

async function loadBooks() {
  const result = await call('adminGetBooks', { q: bookQuery.value.trim(), status: bookFilter.value });
  if (result) {
    books.value = result.data || [];
    bookTotal.value = Number(result.total) || books.value.length;
  }
}

async function loadOrders() { const r = await call('adminGetOrders'); if (r) orders.value = r.data || []; }
async function loadBanners() { const r = await call('adminGetBanners'); if (r) banners.value = r.data || []; }
async function loadLogs() { const r = await call('adminGetLogs'); if (r) logs.value = r.data || []; }

/* ================= 求购帖管理（用户发布的「买书」信息） ================= */

async function loadRequests() {
  const r = await call('adminGetRequests', { q: requestQuery.value.trim() });
  if (r) {
    requests.value = r.data || [];
    requestTotal.value = Number(r.total) || requests.value.length;
  }
}

// 删除求购帖：求购是用户公开发布的「我想买」信息，删掉后其他人的回应线索也会断
function deleteRequestItem(item) {
  const title = item.title ? `《${item.title}》` : '（无书名）';
  wx.showModal({
    title: '删除求购帖',
    content: `删除「${item.posterName || '未知用户'}」发布的求购帖 ${title}？\n\n求购帖是面向全站公开的求助信息，删除后不可恢复。`,
    confirmText: '确认删除',
    confirmColor: '#b35353',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminDeleteRequest', { id: item.id });
      if (!result) return;
      wx.showToast({ title: result.message || '已删除', icon: 'none', duration: 2600 });
      loadRequests();
      loadStats();
    }
  });
}

/* ================= 订单删除（仅终态） ================= */

// 卡片只对非进行中的订单显示删除按钮；服务端亦会二次拦截进行中订单
function deleteOrder(order) {
  wx.showModal({
    title: '删除订单',
    content: `删除订单 ${order.orderNumber}（${order.statusText}）？\n\n订单是买卖双方共有的交易凭据，删除后双方都查不到这笔记录，且不可恢复。`,
    confirmText: '确认删除',
    confirmColor: '#b35353',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminDeleteOrder', { id: order.orderId });
      if (!result) return;
      wx.showToast({ title: result.message || '已删除', icon: 'none', duration: 2600 });
      loadOrders();
      loadStats();
    }
  });
}

/* ================= 操作日志清空 ================= */

// keepDays>0 只删更早的；keepDays=0 全清。服务端先清空再补写本次记录，保证事后可追溯
function clearLogs(keepDays) {
  const label = keepDays > 0
    ? `只保留最近 ${keepDays} 天的操作日志，更早的全部删除`
    : `清空全部 ${logs.value.length} 条操作日志`;
  wx.showModal({
    title: '清空操作日志',
    content: `${label}？\n\n操作日志记录了「谁在后台做了什么处置」，是事后追责的唯一凭据，删掉无法恢复。`,
    confirmText: '确认清空',
    confirmColor: '#b35353',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminClearLogs', { keepDays });
      if (!result) return;
      wx.showToast({ title: result.message || '已清空', icon: 'none', duration: 2600 });
      loadLogs();
      loadStats();
    }
  });
}

/* ================= 存储治理 ================= */

const storage = ref(null);
const cleaning = ref(false);
const backingUp = ref(false);
const lastBackupLabel = ref('');

// 一键导出全量数据备份（含 settings，可直接写回 db.json 还原）
async function downloadBackup() {
  if (backingUp.value) return;
  backingUp.value = true;
  const result = await call('adminBackup');
  backingUp.value = false;
  if (!result || !result.success || !result.data || !result.data.db) {
    wx.showToast({ title: (result && result.message) || '导出失败', icon: 'none' });
    return;
  }
  const d = result.data;
  const text = JSON.stringify(d.db, null, 2);
  const name = d.fileName || 'hzau-bookcycle-backup.json';
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    lastBackupLabel.value = `${name}（${formatBytes(d.bytes)}）`;
    wx.showToast({ title: '备份已下载', icon: 'success' });
  } catch (e) {
    // 下载被拦（部分 WebView）：退回剪贴板，至少把内容带出来
    try {
      await navigator.clipboard.writeText(text);
      wx.showToast({ title: '已复制到剪贴板，请自行保存', icon: 'none' });
      lastBackupLabel.value = `${name}（${formatBytes(d.bytes)}，已复制）`;
    } catch (e2) {
      wx.showModal({ title: '备份内容（手动复制）', content: text.slice(0, 3000), showCancel: false });
    }
  }
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
}

async function loadStorage() {
  const result = await call('adminGetStorage');
  if (result) storage.value = result.data || null;
}

// 预演：只算能删多少，不碰数据
async function previewCleanup() {
  const result = await call('adminRunCleanup', { dryRun: true });
  if (!result) return;
  const d = result.data || {};
  wx.showModal({
    title: '可清理内容（预演）',
    content: `保留期：${d.retentionDays} 天\n过期记录：${d.totalRemoved} 条\n磁盘孤儿图片：${d.orphans} 张\n\n预演不会删除任何数据。`,
    showCancel: false,
    confirmText: '知道了'
  });
}

// 真清理：过期日志/会话/令牌 + 磁盘上已无引用的图片
function runCleanup() {
  const days = (storage.value && storage.value.retentionDays) || 90;
  wx.showModal({
    title: '执行清理',
    content: `将删除 ${days} 天前的登录日志、安全日志、后台日志、已结束会话与令牌，并删除磁盘上不再被引用的图片。\n\n此操作不可撤销。`,
    confirmText: '确认清理',
    success: async res => {
      if (!res.confirm) return;
      cleaning.value = true;
      const result = await call('adminRunCleanup', { purgeOrphans: true });
      cleaning.value = false;
      if (!result) return;
      wx.showToast({ title: result.message || '清理完成', icon: 'none', duration: 3000 });
      loadStorage();
      loadStats();
    }
  });
}

// 删除用户：无交易记录 → 彻底删除；有交易记录 → 匿名化保留（保住买家的订单视图）
function deleteUserItem(user) {
  wx.showModal({
    title: '删除用户',
    content: `删除「${user.nick_name}」（ID ${user.user_id}）？\n\n其发布的书、购物车、会话、令牌、通知与登录日志会一并清除。\n若该用户存在历史订单，账号将匿名化保留，以免买家查不到订单。`,
    confirmText: '确认删除',
    confirmColor: '#b35353',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminDeleteUser', { userId: user.user_id, reason: '管理员在列表中删除' });
      if (!result) return;
      wx.showToast({ title: result.message || '已删除', icon: 'none', duration: 3200 });
      loadUsers();
      loadStats();
    }
  });
}

// 某用户发布过的全部书籍（含已下架/已售出）
async function loadUserBooks(user) {
  userBooksLoading.value = true;
  const result = await call('adminGetUserBooks', { userId: user.user_id });
  userBooksLoading.value = false;
  if (result) userBooks.value = result.data || [];
}

function openUserBooks(user) {
  userBooksTarget.value = user;
  userBooks.value = [];
  loadUserBooks(user);
}

function closeUserBooks() {
  userBooksTarget.value = null;
  userBooks.value = [];
}

function statusText(status) {
  return { none: '未认证', pending: '待审核', approved: '已认证', rejected: '已拒绝' }[status] || status;
}
function bookStatusText(status) {
  return { available: '可购买', locked: '已锁定', trading: '交易中', sold: '已售出', removed: '已下架' }[status] || status;
}
function canDeleteBook(book) {
  return ['available', 'removed'].includes(book.status);
}
function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function preview(url) { wx.previewImage({ current: url, urls: [url] }); }

async function review(item, approve) {
  const result = await call('adminReviewVerification', { id: item.id, approve });
  if (result) {
    wx.showToast({ title: approve ? '已通过' : '已拒绝', icon: 'success' });
    loadVerifications();
    loadStats();
  }
}

function openReject(item) {
  rejectTarget.value = item;
  rejectReason.value = '';
}

async function confirmReject() {
  if (!rejectReason.value.trim()) { wx.showToast({ title: '请填写拒绝原因', icon: 'none' }); return; }
  const result = await call('adminReviewVerification', { id: rejectTarget.value.id, approve: false, reason: rejectReason.value.trim() });
  if (result) {
    wx.showToast({ title: '已拒绝', icon: 'success' });
    rejectTarget.value = null;
    loadVerifications();
    loadStats();
  }
}

// 下架 / 恢复上架。若在下钻弹窗内操作，同时刷新弹窗列表与用户书数
async function setBookStatus(book, status) {
  const action = status === 'removed' ? '下架' : '上架';
  wx.showModal({
    title: `确认${action}`,
    content: `确定要${action}《${book.title || '未命名'}》吗？`,
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminSetBookStatus', { id: book.id, status });
      if (result) {
        wx.showToast({ title: `已${action}`, icon: 'success' });
        refreshBookViews();
      }
    }
  });
}

// 删除违规商品（硬删除，服务端会拦截交易中/已售出的商品并返回原因）
async function deleteBook(book) {
  wx.showModal({
    title: '删除商品',
    content: `确定删除《${book.title || '未命名'}》吗？删除后不可恢复，购物车中的记录也会一并清除。`,
    confirmText: '确认删除',
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminDeleteBook', { id: book.id });
      if (result) {
        wx.showToast({ title: '已删除', icon: 'success' });
        refreshBookViews();
      }
    }
  });
}

// 商品变更后刷新受影响的视图：概览 + (下钻弹窗 or 商品列表) + 用户书数
function refreshBookViews() {
  loadStats();
  if (userBooksTarget.value) {
    loadUserBooks(userBooksTarget.value);
    if (loadedTabs.users) loadUsers();
  } else {
    loadBooks();
  }
}

async function cancelOrder(order) {
  wx.showModal({
    title: '关闭异常订单',
    content: `确定关闭订单 ${order.orderNumber} 吗？商品将恢复可购买。`,
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminCancelOrder', { orderId: order.orderId });
      if (result) { wx.showToast({ title: '已关闭', icon: 'success' }); loadOrders(); loadStats(); }
    }
  });
}

function editBanner(banner) {
  bannerForm.value = banner
    ? { ...banner }
    : { title: '', subtitle: '', imageUrl: '', linkUrl: '', sort: banners.value.length + 1, enabled: true };
}

async function saveBanner() {
  const form = bannerForm.value;
  if (!form.title || !form.title.trim()) { wx.showToast({ title: '请填写标题', icon: 'none' }); return; }
  const payload = { ...form, title: form.title.trim(), sort: Number(form.sort) || 0 };
  const result = form.id
    ? await call('adminUpdateBanner', payload)
    : await call('adminCreateBanner', payload);
  if (result) {
    wx.showToast({ title: '已保存', icon: 'success' });
    bannerForm.value = null;
    loadBanners();
  }
}

async function toggleBanner(banner) {
  const result = await call('adminUpdateBanner', { id: banner.id, enabled: !banner.enabled });
  if (result) { wx.showToast({ title: banner.enabled ? '已停用' : '已启用', icon: 'success' }); loadBanners(); loadStats(); }
}

async function deleteBanner(banner) {
  wx.showModal({
    title: '删除运营位',
    content: `确定删除「${banner.title}」吗？`,
    success: async res => {
      if (!res.confirm) return;
      const result = await call('adminDeleteBanner', { id: banner.id });
      if (result) { wx.showToast({ title: '已删除', icon: 'success' }); loadBanners(); loadStats(); }
    }
  });
}

function goBack() { wx.navigateBack(); }
</script>

<style scoped>
.page-container { min-height: 100vh; padding: 0 calc(24 * var(--rpx)) calc(40 * var(--rpx)); box-sizing: border-box; }
.page-nav { position: relative; display: flex; align-items: center; justify-content: center; height: calc(calc(104 * var(--rpx)) + env(safe-area-inset-top)); padding-top: env(safe-area-inset-top); box-sizing: border-box; }
.nav-title { color: #166a3f; font-size: calc(31 * var(--rpx)); font-weight: 750; }
.nav-back { position: absolute; left: 0; top: calc(calc(26 * var(--rpx)) + env(safe-area-inset-top)); display: flex; align-items: center; justify-content: center; width: calc(52 * var(--rpx)); height: calc(52 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; color: #2c463b; font-size: calc(48 * var(--rpx)); font-weight: 300; line-height: calc(46 * var(--rpx)); box-sizing: border-box; cursor: pointer; }
.login-card { margin-top: calc(60 * var(--rpx)); padding: calc(40 * var(--rpx)) calc(30 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(22 * var(--rpx)); background: #fff; }
.login-title { color: #166a3f; font-size: calc(34 * var(--rpx)); font-weight: 750; text-align: center; }
.login-desc { margin-top: calc(12 * var(--rpx)); color: #83998d; font-size: calc(22 * var(--rpx)); text-align: center; }
.login-input { width: 100%; height: calc(84 * var(--rpx)); margin-top: calc(28 * var(--rpx)); padding: 0 calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); font-size: calc(26 * var(--rpx)); box-sizing: border-box; }
.login-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(84 * var(--rpx)); margin-top: calc(20 * var(--rpx)); border: 0; border-radius: calc(17 * var(--rpx)); background: #166a3f; color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 700; cursor: pointer; }

/* 待办提醒条 */
.alert-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: calc(14 * var(--rpx)); padding: calc(24 * var(--rpx)); border-radius: calc(20 * var(--rpx)); background: linear-gradient(135deg, #b3760f 0%, #c98f1b 100%); cursor: pointer; }
.ov-left { display: flex; flex-direction: column; min-width: 0; }
.ov-title { color: #fff; font-size: calc(28 * var(--rpx)); font-weight: 750; }
.ov-sub { margin-top: calc(8 * var(--rpx)); color: #f6e6c4; font-size: calc(21 * var(--rpx)); }
.ov-arrow { margin-left: calc(16 * var(--rpx)); color: #fff; font-size: calc(44 * var(--rpx)); font-weight: 300; line-height: 1; flex: none; }
.admin-topbar { display: flex; justify-content: flex-end; gap: calc(10 * var(--rpx)); margin-bottom: calc(14 * var(--rpx)); }
.topbar-btn { padding: calc(10 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(20 * var(--rpx)); background: #fff; color: #527861; font-size: calc(21 * var(--rpx)); font-weight: 600; cursor: pointer; }
.tab-bar { display: flex; gap: calc(8 * var(--rpx)); margin-bottom: calc(18 * var(--rpx)); overflow-x: auto; }
.tab { position: relative; padding: calc(14 * var(--rpx)) calc(22 * var(--rpx)); border-radius: calc(26 * var(--rpx)); background: #fff; color: #687d71; font-size: calc(23 * var(--rpx)); font-weight: 600; white-space: nowrap; cursor: pointer; }
.tab.active { background: #166a3f; color: #fff; }
.tab-badge { position: absolute; top: calc(-6 * var(--rpx)); right: calc(-4 * var(--rpx)); min-width: calc(28 * var(--rpx)); height: calc(28 * var(--rpx)); padding: 0 calc(6 * var(--rpx)); border-radius: calc(14 * var(--rpx)); background: #c98f1b; color: #fff; font-size: calc(18 * var(--rpx)); line-height: calc(28 * var(--rpx)); text-align: center; }

/* 数据概览 */
.stat-grid { display: flex; flex-wrap: wrap; gap: calc(14 * var(--rpx)); }
.stat-card { display: flex; flex: 1 1 calc(210 * var(--rpx)); flex-direction: column; min-width: calc(200 * var(--rpx)); padding: calc(24 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fff; cursor: pointer; }
.stat-value { color: #166a3f; font-size: calc(52 * var(--rpx)); font-weight: 800; line-height: 1.1; }
.stat-value.warn { color: #c98f1b; }
.stat-label { margin-top: calc(10 * var(--rpx)); color: #45584d; font-size: calc(24 * var(--rpx)); font-weight: 650; }
.stat-sub { margin-top: calc(6 * var(--rpx)); color: #93a29a; font-size: calc(20 * var(--rpx)); }
.stat-foot { display: flex; flex-wrap: wrap; gap: calc(10 * var(--rpx)) calc(28 * var(--rpx)); margin-top: calc(16 * var(--rpx)); padding: calc(22 * var(--rpx)) calc(24 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fafbfa; }
.stat-foot-item { color: #62786c; font-size: calc(22 * var(--rpx)); }
.stat-foot-num { color: #166a3f; font-weight: 700; }

/* 登录情况 */
.section-mini { margin-top: calc(16 * var(--rpx)); padding: calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fff; cursor: pointer; }
.login-summary { display: flex; gap: calc(12 * var(--rpx)); margin-bottom: calc(12 * var(--rpx)); }
.stat-row { display: flex; gap: calc(12 * var(--rpx)); margin-top: calc(16 * var(--rpx)); }
.ls-item { display: flex; flex: 1; flex-direction: column; align-items: center; padding: calc(16 * var(--rpx)) 0; border-radius: calc(14 * var(--rpx)); background: #f7faf7; }
.ls-num { color: #45584d; font-size: calc(36 * var(--rpx)); font-weight: 800; line-height: 1.1; }
.ls-num.ok { color: #166a3f; }
.ls-num.bad { color: #b35353; }
.ls-num.warn { color: #c98f1b; }
.ls-label { margin-top: calc(6 * var(--rpx)); color: #8d98a8; font-size: calc(19 * var(--rpx)); }
.login-hint { margin-bottom: calc(14 * var(--rpx)); color: #9daaa1; font-size: calc(20 * var(--rpx)); line-height: 1.6; }

/* 登录记录条目 */
.login-card-row { display: flex; flex-direction: column; gap: calc(8 * var(--rpx)); }
.rec-head { display: flex; align-items: center; gap: calc(12 * var(--rpx)); }
.rec-reason { flex: 1; color: #45584d; font-size: calc(22 * var(--rpx)); font-weight: 650; }
.rec-time { color: #8d98a8; font-size: calc(20 * var(--rpx)); }
.rec-account { color: #29443a; font-size: calc(23 * var(--rpx)); font-weight: 600; word-break: break-all; }
.rec-meta { color: #8d98a8; font-size: calc(20 * var(--rpx)); }
.mini-tag { padding: calc(4 * var(--rpx)) calc(12 * var(--rpx)); border-radius: calc(10 * var(--rpx)); font-size: calc(19 * var(--rpx)); font-weight: 650; white-space: nowrap; }
.ok-tag { background: #e8f3ec; color: #166a3f; }
.bad-tag { background: #fdf0f0; color: #b35353; }
.user-tags { display: flex; flex-wrap: wrap; gap: calc(8 * var(--rpx)); margin-top: calc(12 * var(--rpx)); }
.mini-tag.danger { background: #fdf0f0; color: #b35353; }
.mini-tag.warn { background: #fdf6e3; color: #c98f1b; }

/* 搜索与筛选 */
.toolbar { display: flex; align-items: center; gap: calc(12 * var(--rpx)); margin-bottom: calc(12 * var(--rpx)); }
.search-input { flex: 1; min-width: 0; height: calc(72 * var(--rpx)); padding: 0 calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(14 * var(--rpx)); background: #fff; font-size: calc(23 * var(--rpx)); box-sizing: border-box; }
.list-summary { margin-bottom: calc(14 * var(--rpx)); color: #8d98a8; font-size: calc(21 * var(--rpx)); }
.verify-filter { display: flex; flex-wrap: wrap; gap: calc(10 * var(--rpx)); margin-bottom: calc(16 * var(--rpx)); }
.filter-chip { padding: calc(8 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(20 * var(--rpx)); background: #fff; color: #687d71; font-size: calc(21 * var(--rpx)); cursor: pointer; }
.filter-chip.active { border-color: #166a3f; background: #e8f3ec; color: #166a3f; font-weight: 700; }

.card { margin-bottom: calc(16 * var(--rpx)); padding: calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(20 * var(--rpx)); background: #fff; }
.ver-head { display: flex; align-items: center; }
.ver-avatar { width: calc(72 * var(--rpx)); height: calc(72 * var(--rpx)); margin-right: calc(16 * var(--rpx)); border-radius: 50%; background: #f1f4f0; object-fit: cover; flex: none; }
.ver-user { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ver-name { overflow: hidden; color: #29443a; font-size: calc(27 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.ver-meta { margin-top: calc(6 * var(--rpx)); color: #8d98a8; font-size: calc(20 * var(--rpx)); }
.ver-status { padding: calc(6 * var(--rpx)) calc(14 * var(--rpx)); border-radius: calc(10 * var(--rpx)); font-size: calc(20 * var(--rpx)); font-weight: 650; white-space: nowrap; }
.vs-pending { background: #fdf6e3; color: #c98f1b; }
.vs-approved { background: #e8f3ec; color: #166a3f; }
.vs-rejected, .vs-none { background: #f4f4f2; color: #a3a39e; }
.bs-available { background: #e8f3ec; color: #166a3f; }
.bs-locked, .bs-trading { background: #fdf6e3; color: #c98f1b; }
.bs-sold, .bs-removed { background: #f4f4f2; color: #a3a39e; }
.os-locked { background: #fdf6e3; color: #c98f1b; }
.os-trading { background: #edf6ef; color: #4d806b; }
.os-completed { background: #f3f5f1; color: #7b8797; }
.os-cancelled, .os-timeout { background: #f4f4f2; color: #a3a39e; }
.ver-proof { width: 100%; max-height: calc(420 * var(--rpx)); margin-top: calc(16 * var(--rpx)); border: calc(1 * var(--rpx)) solid #f0eeea; border-radius: calc(12 * var(--rpx)); object-fit: contain; cursor: pointer; }
.ver-reject-reason { margin-top: calc(14 * var(--rpx)); padding: calc(12 * var(--rpx)); border-radius: calc(10 * var(--rpx)); background: #fef6f6; color: #b35353; font-size: calc(21 * var(--rpx)); }
.ver-actions { display: flex; justify-content: flex-end; gap: calc(14 * var(--rpx)); margin-top: calc(18 * var(--rpx)); }
button { display: flex; align-items: center; justify-content: center; min-width: calc(140 * var(--rpx)); height: calc(60 * var(--rpx)); margin: 0; padding: 0 calc(20 * var(--rpx)); border: 0; border-radius: calc(13 * var(--rpx)); font-size: calc(23 * var(--rpx)); cursor: pointer; }
.btn-approve { background: #166a3f; color: #fff; }
.btn-reject { background: #fdf0f0; color: #b35353; }
.btn-danger { background: #b35353; color: #fff; }
.btn-plain { border: calc(1 * var(--rpx)) solid #dfe9e1; background: #fff; color: #687d71; }
button.small { min-width: calc(110 * var(--rpx)); height: calc(52 * var(--rpx)); font-size: calc(21 * var(--rpx)); }

/* 商品行 */
.book-row { display: flex; align-items: center; }
.book-cover { width: calc(88 * var(--rpx)); height: calc(114 * var(--rpx)); margin-right: calc(16 * var(--rpx)); border-radius: calc(8 * var(--rpx)); background: #eff3ef; object-fit: cover; flex: none; }
.book-info { display: flex; flex: 1; flex-direction: column; min-width: 0; }

/* 用户书籍下钻 */
.modal-sub { margin-top: calc(10 * var(--rpx)); color: #8d98a8; font-size: calc(21 * var(--rpx)); }
.ub-item { display: flex; align-items: center; gap: calc(12 * var(--rpx)); padding: calc(16 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f2f4f0; }
.ub-cover { width: calc(64 * var(--rpx)); height: calc(84 * var(--rpx)); border-radius: calc(8 * var(--rpx)); background: #eff3ef; object-fit: cover; flex: none; }
.ub-info { display: flex; flex: 1; flex-direction: column; min-width: 0; }
.ub-title { overflow: hidden; color: #29443a; font-size: calc(24 * var(--rpx)); font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.ub-meta { margin-top: calc(6 * var(--rpx)); color: #8d98a8; font-size: calc(20 * var(--rpx)); }

.empty { padding: calc(80 * var(--rpx)) 0; color: #9daaa1; font-size: calc(25 * var(--rpx)); text-align: center; }
.add-banner-btn { display: flex; align-items: center; justify-content: center; width: 100%; height: calc(80 * var(--rpx)); border: calc(1 * var(--rpx)) dashed #bdc9c0; border-radius: calc(16 * var(--rpx)); background: #fafbfc; color: #527861; font-size: calc(25 * var(--rpx)); cursor: pointer; }
.log-card { padding: calc(16 * var(--rpx)) calc(20 * var(--rpx)); }
.log-text { color: #62786c; font-size: calc(21 * var(--rpx)); line-height: 1.6; }
.modal-mask { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: calc(40 * var(--rpx)); background: rgba(30,42,36,.5); box-sizing: border-box; }
.modal { width: 100%; max-width: calc(620 * var(--rpx)); max-height: 82vh; overflow-y: auto; padding: calc(30 * var(--rpx)); border-radius: calc(22 * var(--rpx)); background: #fff; }
.modal-title { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 750; }
.reason-chips { display: flex; flex-wrap: wrap; gap: calc(12 * var(--rpx)); margin-top: calc(20 * var(--rpx)); }
.reason-chip { padding: calc(10 * var(--rpx)) calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(22 * var(--rpx)); color: #687d71; font-size: calc(22 * var(--rpx)); cursor: pointer; }
.reason-chip.active { border-color: #b35353; background: #fdf0f0; color: #b35353; }
.modal-input { width: 100%; height: calc(76 * var(--rpx)); margin-top: calc(18 * var(--rpx)); padding: 0 calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(12 * var(--rpx)); font-size: calc(24 * var(--rpx)); box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: calc(14 * var(--rpx)); margin-top: calc(24 * var(--rpx)); }

/* ========== 邮件设置 ========== */
.mail-tab .section-mini { cursor: default; }
.mail-status { display: flex; flex-direction: column; gap: calc(8 * var(--rpx)); padding: calc(24 * var(--rpx)); border-radius: calc(20 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; background: #fafbfa; }
.mail-status.ms-ok { border-color: #b7dcc6; background: #eef8f1; }
.mail-status.ms-bad { border-color: #f0cfcf; background: #fdf3f3; }
.ms-title { font-size: calc(27 * var(--rpx)); font-weight: 750; color: #29443a; }
.mail-status.ms-ok .ms-title { color: #166a3f; }
.mail-status.ms-bad .ms-title { color: #b35353; }
.ms-desc { color: #62786c; font-size: calc(22 * var(--rpx)); line-height: 1.6; }
.ms-meta { color: #8d98a8; font-size: calc(20 * var(--rpx)); word-break: break-all; }
.preset-row { display: flex; flex-wrap: wrap; gap: calc(10 * var(--rpx)); margin-bottom: calc(16 * var(--rpx)); }
.form-row { display: flex; align-items: center; gap: calc(16 * var(--rpx)); padding: calc(12 * var(--rpx)) 0; border-bottom: calc(1 * var(--rpx)) solid #f2f4f0; }
.form-label { width: calc(110 * var(--rpx)); flex: none; color: #527861; font-size: calc(23 * var(--rpx)); font-weight: 600; }
.form-input { flex: 1; min-width: 0; height: calc(70 * var(--rpx)); padding: 0 calc(18 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(12 * var(--rpx)); background: #fff; font-size: calc(23 * var(--rpx)); box-sizing: border-box; }
.switch { padding: calc(10 * var(--rpx)) calc(22 * var(--rpx)); border: calc(1 * var(--rpx)) solid #dfe9e1; border-radius: calc(22 * var(--rpx)); background: #f4f6f4; color: #8d98a8; font-size: calc(22 * var(--rpx)); cursor: pointer; }
.switch.on { border-color: #166a3f; background: #e8f3ec; color: #166a3f; font-weight: 700; }
.mail-line { display: flex; align-items: center; gap: calc(10 * var(--rpx)); margin-top: calc(12 * var(--rpx)); }
.ml-dot { font-size: calc(20 * var(--rpx)); }
.mail-line.ml-ok .ml-dot, .mail-line.ml-ok .ml-text { color: #166a3f; }
.mail-line.ml-bad .ml-dot, .mail-line.ml-bad .ml-text { color: #b35353; }
.ml-text { flex: 1; font-size: calc(23 * var(--rpx)); }
.mail-err { display: block; margin-top: calc(8 * var(--rpx)); color: #b35353; font-size: calc(20 * var(--rpx)); word-break: break-all; }
.outbox-link { display: block; margin-top: calc(8 * var(--rpx)); color: #166a3f; font-size: calc(20 * var(--rpx)); word-break: break-all; text-decoration: underline; cursor: pointer; }
.login-hint .hl { color: #b35353; font-weight: 700; }
/* 存储治理页 */
.storage-tab .section-mini { cursor: default; }
.st-cards { display: flex; margin-top: calc(4 * var(--rpx)); }
.st-card { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; min-height: calc(134 * var(--rpx)); padding: calc(14 * var(--rpx)) calc(8 * var(--rpx)); border: calc(1 * var(--rpx)) solid #ebe8e2; border-radius: calc(18 * var(--rpx)); background: #fff; box-sizing: border-box; }
.st-card + .st-card { margin-left: calc(12 * var(--rpx)); }
.st-card.st-warn { border-color: #f0dede; background: #fffafa; }
.st-num { color: #166a3f; font-size: calc(30 * var(--rpx)); font-weight: 780; }
.st-card.st-warn .st-num { color: #b35353; }
.st-label { margin-top: calc(7 * var(--rpx)); color: #8d98a8; font-size: calc(19 * var(--rpx)); line-height: 1.35; text-align: center; }
.st-hint { display: block; margin-top: calc(16 * var(--rpx)); color: #8d98a8; font-size: calc(20 * var(--rpx)); line-height: 1.55; }
.st-row { display: flex; align-items: center; height: calc(58 * var(--rpx)); border-bottom: calc(1 * var(--rpx)) solid #f4f2ee; }
.st-row:last-child { border-bottom: none; }
.st-row-name { flex: 1; color: #526074; font-size: calc(23 * var(--rpx)); font-weight: 600; }
.st-row-count { width: calc(120 * var(--rpx)); color: #8d98a8; font-size: calc(21 * var(--rpx)); text-align: right; }
.st-row-bytes { width: calc(130 * var(--rpx)); color: #166a3f; font-size: calc(21 * var(--rpx)); font-weight: 700; text-align: right; }
.st-file { display: block; margin-top: calc(8 * var(--rpx)); color: #8d98a8; font-size: calc(19 * var(--rpx)); word-break: break-all; }
.st-actions { display: flex; margin-top: calc(20 * var(--rpx)); }
.st-actions button { flex: 1; }
.st-actions button + button { margin-left: calc(14 * var(--rpx)); }
</style>
