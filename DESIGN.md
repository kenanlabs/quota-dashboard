# QuotaDashboard 设计系统文档

## 1. 视觉主题与氛围

QuotaDashboard 的界面是一个为团队打造的 AI 资源「监控作战室」—— 冷静、克制、信息密度恰到好处。整个体验建立在 Slate 冷灰调画布 (`#f8fafc`) 之上，营造出一种工具型产品特有的专业感与可靠感。不像消费级 AI 产品追求温暖亲和，QuotaDashboard 的设计语言更接近 DevOps 仪表盘：清晰、务实，让数据自己说话。

标志性的设计语言是以 **Teal 青碧色** (`#0f766e`) 作为品牌主色贯穿所有交互元素 —— 按钮、焦点环、选中态、链接。Teal 介于蓝与绿之间，传递出"理性分析"与"健康运行"的双重信号。配合 Slate 色系的中性灰阶，界面在冷静中保留了层次感。

用量百分比采用**三色信号灯语义**：Emerald 翠绿 (`#059669`) 表示安全区间，Amber 琥珀 (`#d97706`) 表示预警区间，Rose 玫红 (`#e11d48`) 表示危险区间。这种源自交通信号灯的直觉映射，让团队成员无需阅读数字即可一眼感知每个 Key 的健康状态。

**关键特征：**
- Slate 冷灰画布 (`#f8fafc`) 营造工具型产品的专业感与可靠感
- Teal 青碧品牌主色 (`#0f766e`) 作为所有交互元素的核心色
- Inter 字体家族，搭配 `cv02/cv03/cv04/cv11` 风格化变体，呈现现代几何感
- 三色用量信号灯系统（绿/黄/红）—— 无需阅读即可感知状态
- 纯白卡片 (`#ffffff`) + 极淡边框 (`#e2e8f0`) + `shadow-sm` 微阴影，构建克制而清晰的层级
- 毛玻璃遮罩 (`bg-slate-900/50 backdrop-blur-sm`) 为 Modal 提供深度感
- 搜索框与数据卡片双轨布局，兼顾浏览与精准检索

## 2. 色彩系统与角色

### 品牌主色
- **Teal 青碧** (`#0f766e`): 核心品牌色 — 用于所有主按钮文字、主按钮背景色板、Tab 选中态、焦点环、搜索框聚焦。沉稳而富有区分度，不喧宾夺主。
- **Teal Light 浅青** (`#dff4f2`): 主按钮的默认背景 — 极淡的青绿底色，让 Teal 文字在按钮上清晰可读。
- **Teal Hover 悬停青** (`#cbf0ec`): 主按钮悬停态背景。
- **Teal Active 按下青** (`#b5e9e4`): 主按钮激活态背景。
- **Teal Border 青边框** (`#b2e8e3`): 主按钮边框色。

### 中性色 / 表面色
- **Slate 50 画布** (`#f8fafc`): 页面主背景 — 带极轻微蓝调的灰白，比纯白多了层次感，比暖灰更适合工具型产品。
- **White 纯白** (`#ffffff`): 卡片背景、导航栏背景、Modal 背景 — 在 Slate 画布上浮现的纯净表面。
- **Slate 100 浅灰** (`#f1f5f9`): 标签背景、次要按钮背景、Provider 图标容器背景。
- **Slate 200 边框** (`#e2e8f0`): 标准卡片/容器边框 — 极淡的存在感，仅用于界定边界。
- **Slate 300 输入边框** (`#cbd5e1`): 输入框默认边框 — 略深，确保输入区域可辨识。

### 文本色
- **Slate 900 主文本** (`#0f172a`): 标题、卡片名、重要文字 — 接近黑色但稍柔和。
- **Slate 800 正文** (`#1e293b`): body 默认文字色。
- **Slate 700 标签** (`#334155`): 表单标签文字。
- **Slate 600 次要文本** (`#475569`): 辅助信息、统计数字。
- **Slate 500 三级文本** (`#64748b`): 副标题、说明文字、搜索框占位符。
- **Slate 400 四级文本** (`#94a3b8`): 最后更新时间、次要图标色、拖拽手柄色。
- **Slate 300 禁用文本** (`#cbd5e1`): 空状态图标、禁用态拖拽手柄。

### 语义色

#### 用量信号灯
- **Emerald 安全** (`#059669`): 用量 < 50% — 绿色表示"放心使用"。背景 `#ecfdf5` (Emerald 50)。
- **Amber 预警** (`#d97706`): 用量 50–79% — 黄色表示"注意用量"。背景 `#fffbeb` (Amber 50)。
- **Rose 危险** (`#e11d48`): 用量 ≥ 80% — 红色表示"即将耗尽"。背景 `#fff1f2` (Rose 50)。

#### 团队标签
- **Slate 团队标签**: `bg-slate-100 text-slate-600` — 中性灰，低调标注所属团队。
- **Indigo 负责人标签**: `bg-indigo-50 text-indigo-600` — 靛蓝色，在团队标签中形成区分。
- **Amber 人数标签**: `bg-amber-50 text-amber-600` — 暖黄色，温和提示团队规模。

#### 通知与反馈
- **Emerald 成功**: `bg-emerald-50 border-emerald-200 text-emerald-800` — Toast 成功通知。
- **Rose 错误**: `bg-rose-50 border-rose-200 text-rose-800` — Toast 错误通知。
- **Rose 危险按钮**: `text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200` — 删除/退出按钮，警示性操作。

#### 焦点指示
- **Teal 焦点环**: `focus:ring-2 focus:ring-teal-500 focus:border-teal-500` — 搜索框聚焦。
- **Indigo 焦点环**: `focus:ring-2 focus:ring-indigo-500` — 表单输入框聚焦。与 Teal 区分，暗示操作上下文不同。

### 渐变色系统
- QuotaDashboard 的设计**不使用渐变**。界面深度完全通过纯色表面层级、边框和微阴影构建。Slate 画布 → White 卡片 → Slate 标签，层层递进而不依赖渐变。

## 3. 字体与排版

### 字体家族
- **主字体**: `Inter`，Google Fonts 加载，权重 400 / 500 / 600 / 700
- **等宽数字**: `Inter` 配合 `font-variant-numeric: tabular-nums`，回退 `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
- **系统回退**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
- **OpenType 特性**: `cv02`, `cv03`, `cv04`, `cv11` — Inter 的文体变体，优化几何感
- **字体平滑**: `antialiased` (WebKit) + `grayscale` (Moz)

### 排版层级

| 角色 | 字体 | 字号 | 字重 | 行高 | 说明 |
|------|------|------|------|------|------|
| 页面标题 | Inter | 18px (`text-lg`) | 700 (`font-bold`) | `leading-tight` | 导航栏中的系统名称 |
| 页面副标题 | Inter | 12px (`text-xs`) | 400 | 默认 | 导航栏中的系统描述 |
| Modal 标题 | Inter | 16px (`text-base`) | 700 (`font-bold`) | 默认 | 所有弹窗的标题 |
| 卡片标题 | Inter | 14px (`text-sm`) | 700 (`font-bold`) | 默认 | API Key 展示名称 |
| 用量百分比 | Inter | 12px (`text-xs`) | 600 (`font-semibold`) | 默认 | 用量数字，tabular-nums |
| 用量标签 | Inter | 12px (`text-xs`) | 400 | 默认 | "5小时:"、"7天:"、"每月:" |
| 重置倒计时 | Inter | 11px | 400 | 默认 | tabular-nums，等宽对齐 |
| 团队标签 | Inter | 11px | 500 (`font-medium`) | 默认 | 卡片上的团队/负责人/人数标签 |
| 表单标签 | Inter | 12px (`text-xs`) | 500 (`font-medium`) | 默认 | 输入框上方标签 |
| 按钮文字 | Inter | 12px (`text-xs`) | 500 (`font-medium`) | 默认 | 所有按钮 |
| Tab 导航 | Inter | 12px (`text-xs`) | 500 / 700 (`font-bold`) | 默认 | 设置面板的 Tab，选中态加粗 |
| 倒计时数字 | Inter | 12px (`text-xs`) | 400 | 默认 | `font-mono` 等宽数字 |
| 最后更新时间 | Inter | 12px (`text-xs`) | 400 | 默认 | 卡片的相对时间 |
| 空状态文字 | Inter | 14px (`text-sm`) | 500 (`font-medium`) | 默认 | 空数据提示标题 |
| 空状态说明 | Inter | 12px (`text-xs`) | 400 | 默认 | 空数据提示文本 |
| 加载文字 | Inter | 12px (`text-xs`) | 400 | 默认 | "正在刷新数据..." |
| Toast 文字 | Inter | 14px (`text-sm`) | 500 (`font-medium`) | 默认 | 通知消息 |

### 排版原则
- **单一字体家族**: 全站仅使用 Inter，通过字重和字号区分层级，不引入第二字体。这是一种极简主义的排版策略 —— 减少字体加载成本，保证渲染一致性。
- **tabular-nums 用于数据对齐**: 所有数字（用量百分比、倒计时、人数）使用 `font-variant-numeric: tabular-nums`，确保每个数字占据等宽空间，列表中的数字可以垂直对齐。
- **Inter OpenType 变体**: `cv02/cv03/cv04/cv11` 开启了 Inter 的文体替代字形，使字体呈现更几何化、更现代的外观，与仪表盘的工具感一致。
- **字重梯度清晰**: 700（标题）→ 600（数据强调）→ 500（交互元素）→ 400（正文/说明），四个层级各司其职。
- **中文字体回退链完整**: PingFang SC → Hiragino Sans GB → Microsoft YaHei → Noto Sans CJK SC，覆盖 macOS / iOS / Windows / Linux。

## 4. 组件样式

### 按钮

**Teal Primary（主要操作）**
- 背景: Teal Light (`#dff4f2`)
- 文字: Teal 青碧 (`#0f766e`)
- 边框: Teal Border (`#b2e8e3`)
- 内边距: `px-3.5 py-1.5` (14px × 6px) 或 `px-3 py-1.5` (12px × 6px)
- 圆角: `rounded-lg` (8px)
- 阴影: `shadow-sm`
- 悬停: `#cbf0ec` 背景
- 按下: `#b5e9e4` 背景
- 过渡: `transition`
- 这是全站唯一的 CTA 按钮样式 —— "添加 Key"、"刷新"、"保存"、"登录" 均使用此样式

**Slate Secondary（次要操作）**
- 背景: Slate 100 (`#f1f5f9`)
- 文字: Slate 600 (`#475569`)
- 内边距: `px-4 py-2` (16px × 8px)
- 圆角: `rounded-lg` (8px)
- 悬停: `#e2e8f0` 背景
- 用于 Modal 中的"取消"、"关闭"按钮

**Rose Danger（危险操作）**
- 背景: Rose 50 (`#fff1f2`)
- 文字: Rose 700 (`#be123c`)
- 边框: Rose 200 (`#fecdd3`)
- 内边距: `px-3 py-1.5` (12px × 6px)
- 圆角: `rounded-lg` (8px)
- 悬停: `#ffe4e6` 背景
- 用于"退出"、"修改密码"按钮

**Icon Button（图标按钮）**
- 文字/图标色: Slate 400 (`#94a3b8`)
- 内边距: `p-1` (4px)
- 悬停: `text-teal-600`（刷新）、`text-indigo-600`（编辑）、`text-rose-600`（删除）
- 圆角: `rounded`
- 用于卡片右上角的三个操作图标（刷新/编辑/删除）

### 卡片

**API Key 用量卡片**
- 背景: White (`#ffffff`)
- 边框: `1px solid` Slate 200 (`#e2e8f0`)
- 圆角: `rounded-xl` (12px)
- 阴影: `shadow-sm`
- 内边距: `p-4` (16px)
- 卡片间距: `space-y-4` (16px)
- 悬停: `hover:border-slate-300`（边框微微加深）
- 拖拽中: `opacity-40 border-dashed border-teal-400`（半透明+虚线+Teal 提示）
- 拖拽目标: `border-teal-500 ring-2 ring-teal-200`（Teal 高亮环）
- 刷新中: `animate-pulse`（柔和的脉冲动画）
- 布局: `flex flex-col md:flex-row`（移动端纵向堆叠，桌面端横向排列）

**空状态卡片**
- 背景: White (`#ffffff`)
- 边框: `border border-slate-200`
- 圆角: `rounded-2xl` (16px)
- 阴影: `shadow-sm`
- 内边距: `py-16` (64px 纵向)
- 图标: 12×12 Slate 300 色描边 SVG

**设置面板中的图标选择器**
- 选中态: `border-teal-500 bg-teal-50 ring-1 ring-teal-300`
- 默认态: `border-slate-200 hover:border-slate-300 hover:bg-slate-50`
- 圆角: `rounded-lg` (8px)
- 内边距: `p-1.5` (6px)
- 图标尺寸: `w-6 h-6` (24px)

### Modal（弹窗）

- 背景: White (`#ffffff`)
- 边框: `border border-slate-100`
- 圆角: `rounded-2xl` (16px)
- 阴影: `shadow-xl`
- 内边距: `p-6` (24px)
- 最大宽度: `max-w-sm` (384px, 登录) / `max-w-md` (448px, Key 编辑) / `max-w-lg` (512px, 系统设置)
- 最大高度: `max-h-[90vh] overflow-y-auto`
- 遮罩层: `bg-slate-900/50 backdrop-blur-sm`（半透明深灰 + 毛玻璃模糊）
- 关闭行为: `@click.away` 点击遮罩外部关闭
- 登录 Modal: 居中布局，表单间距 `space-y-3`
- 编辑 Modal: 表单间距 `space-y-3`，Provider 特定配置区域带彩色边框
- 设置 Modal: Tab 导航 + 多面板切换

### 输入框

- 背景: White (`#ffffff`)
- 边框: `1px solid` Slate 300 (`#cbd5e1`)
- 圆角: `rounded-lg` (8px)
- 内边距: `px-3 py-2` (12px × 8px)
- 字号: `text-xs` (12px)
- 聚焦态 (搜索框): `focus:ring-2 focus:ring-teal-500 focus:border-teal-500`
- 聚焦态 (表单): `focus:ring-2 focus:ring-indigo-500 focus:outline-none`
- 搜索框额外: 左侧内嵌 SVG 搜索图标，`pl-9 pr-4` 非对称内边距

**自定义 Select**
- 外观: `appearance: none` 移除原生样式
- 下拉箭头: 内联 SVG 背景图，默认 `#94a3b8`，聚焦时变为 `#0f766e`
- 内边距: `pr-8` 为箭头预留空间

**Checkbox**
- 圆角: `rounded`
- 选中色: `text-teal-600`
- 聚焦环: `focus:ring-teal-500`

### 导航栏

- 背景: White (`#ffffff`)
- 底部边框: `1px solid` Slate 200 (`#e2e8f0`)
- 定位: `sticky top-0 z-30`（吸顶，在 Modal 遮罩之下）
- 高度: `h-16` (64px)
- 内边距: `px-4 sm:px-6 lg:px-8`
- 最大宽度: `max-w-7xl` (1280px)，居中
- 左侧: 系统图标 (40×40, `rounded-xl`, 带 `shadow-sm`) + 标题/副标题
- 右侧: 自动刷新倒计时胶囊 + 操作按钮组

### 自动刷新倒计时胶囊

- 背景: Slate 100 (`#f1f5f9`)
- 边框: `border border-slate-200`
- 圆角: `rounded-full`
- 内边距: `px-3 py-1.5` (12px × 6px)
- 字号: `text-xs`
- 状态点: `w-2 h-2 rounded-full bg-emerald-500 animate-pulse`（绿色脉冲圆点）
- 数字: `font-mono` 等宽字体
- 响应式: `hidden sm:flex`（小屏隐藏）

### 用量百分比标签

用量核心组件，展示 API Key 的使用百分比。三色信号灯语义：

| 区间 | 文字色 | 背色 | 含义 |
|------|--------|------|------|
| < 50% | Emerald 600 (`#059669`) | Emerald 50 (`#ecfdf5`) | 安全 |
| 50–79% | Amber 600 (`#d97706`) | Amber 50 (`#fffbeb`) | 预警 |
| ≥ 80% | Rose 600 (`#e11d48`) | Rose 50 (`#fff1f2`) | 危险 |
| 无数据 | Slate 400 (`#94a3b8`) | Slate 50 (`#f8fafc`) | 未知 |

- 字号: `text-xs font-semibold`
- 内边距: `px-1.5 py-0.5` (6px × 2px)
- 圆角: `rounded`
- 数字格式: `tabular-nums`，`Math.round()` 取整，后缀 `%`

### 团队信息标签

- 团队标签: `bg-slate-100 text-slate-600` — 灰色，配合人像图标
- 负责人标签: `bg-indigo-50 text-indigo-600` — 靛蓝，配合单人图标
- 人数标签: `bg-amber-50 text-amber-600` — 暖黄，配合多人图标
- 字号: `text-[11px] font-medium`
- 内边距: `px-1.5 py-0.5` (6px × 2px)
- 圆角: `rounded` (4px)
- 图标: 3×3 小 SVG，`mr-0.5` 间距

### Provider 图标容器

- 尺寸: `w-9 h-9` (36×36px)
- 背景: Slate 100 (`#f1f5f9`)
- 边框: `border border-slate-200`
- 圆角: `rounded-lg` (8px)
- 内边距: `p-1.5` (6px)
- 图像: `object-contain` 保持比例

### Toast 通知

- 定位: `fixed top-4 right-4 z-[100]`
- 最大宽度: `max-w-sm`
- 成功样式: `bg-emerald-50 border-emerald-200 text-emerald-800`
- 错误样式: `bg-rose-50 border-rose-200 text-rose-800`
- 圆角: `rounded-xl` (12px)
- 阴影: `shadow-lg`
- 内边距: `px-4 py-3`
- 图标: `w-5 h-5` (20px)，左侧
- 进入动画: `toast-enter` — 0.25s ease-out，从上方 12px 淡入 + 缩放 0.95→1
- 退出动画: `toast-leave` — 0.2s ease-in，向上 12px 淡出 + 缩放 1→0.95
- 自动消失: 3 秒后

### 拖拽手柄

- 图标: 6 点阵 SVG（两组 3 点），`w-4 h-4`
- 默认色: Slate 400 (`#94a3b8`)，悬停 `#475569`
- 光标: `cursor-grab`，拖拽中 `active:cursor-grabbing`
- 禁用态: `opacity-40 text-slate-300 cursor-default`
- 仅管理员+无搜索过滤时可用

### 加载指示器

**全页加载（首次加载）**
- 居中布局，`py-20`
- 旋转环: `rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent animate-spin`
- 提示文字: `text-sm text-slate-500`

**行内加载（刷新中）**
- 旋转 SVG: `w-4 h-4 animate-spin text-teal-600`
- 提示文字: `text-xs text-teal-600`

**卡片刷新**
- 卡片整体: `animate-pulse`（柔和脉冲）

**状态点脉冲**
- `w-2 h-2 rounded-full bg-emerald-500 animate-pulse`（倒计时胶囊中的绿色圆点）

## 5. 布局原则

### 间距系统
- 基础单位: 4px（Tailwind 默认）
- 页面水平内边距: `px-4 sm:px-6 lg:px-8` (16px → 24px → 32px)
- 页面垂直内边距: `py-8 sm:py-10` (32px → 40px)
- 卡片间距: `space-y-4` (16px)
- 卡片内部: `p-4` (16px)
- Modal 内部: `p-6` (24px)
- 表单间距: `space-y-3` (12px)
- 按钮组间距: `space-x-2` (8px) 或 `space-x-3` (12px)
- 用量数据间距: `space-x-4` (16px)
- 标签间距: `gap-1.5` (6px)

### 网格与容器
- 最大内容宽度: `max-w-7xl` (1280px)，居中
- 导航栏: 全宽 sticky 顶栏，内容区 `max-w-7xl` 居中
- 卡片列表: 单列，`space-y-4` 纵向堆叠
- 卡片内部: `flex flex-col md:flex-row`（移动端纵向，md 以上横向）
- 表单: 2 列网格 (`grid grid-cols-2 gap-2`) 用于团队/负责人
- 设置面板: Tab 切换单面板，字段显隐 2 列 checkbox 网格
- 图标选择器: `grid grid-cols-6 sm:grid-cols-8` 响应式网格

### 留白哲学
- **工具型产品克制**: 信息密度适中，不追求奢侈留白也不堆砌数据。卡片间距 16px 提供了足够的呼吸感但不会让页面显得空洞。
- **数据优先**: 卡片内部布局紧凑（`p-4`），优先保证用量数据在同一视口内可见。
- **Modal 舒适区**: Modal 内边距 24px，表单间距 12px，营造填写表单的舒适空间。

### 圆角尺度

| 级别 | 值 | 使用场景 |
|------|-----|----------|
| 微圆角 | `rounded` (4px) | 标签、用量百分比小标签、图标按钮 |
| 舒适圆角 | `rounded-lg` (8px) | 按钮、输入框、Select、Provider 图标容器、图标选择器项 |
| 明显圆角 | `rounded-xl` (12px) | 用量卡片、导航栏图标、Toast 通知 |
| 大圆角 | `rounded-2xl` (16px) | Modal 弹窗、空状态卡片 |
| 全圆角 | `rounded-full` | 倒计时胶囊、状态点、加载旋转环 |

### 响应式行为

| 断点 | 宽度 | 关键变化 |
|------|------|----------|
| 默认 (Mobile) | < 640px | 卡片纵向堆叠，倒计时胶囊隐藏，搜索框全宽 |
| `sm` | ≥ 640px | 倒计时胶囊显示，搜索框保持 `max-w-xs` |
| `md` | ≥ 768px | 卡片内部变为横向布局（信息在左，用量在右） |
| `lg` | ≥ 1024px | 页面内边距增大到 32px |

## 6. 深度与层级

| 层级 | 处理方式 | 使用场景 |
|------|----------|----------|
| 画布层 (Level 0) | 无阴影，Slate 50 背景 | 页面基底 |
| 浮现层 (Level 1) | `shadow-sm` + `1px solid #e2e8f0` 边框 | 用量卡片、导航栏 |
| 浮起层 (Level 2) | `shadow-xl` + `1px solid #f1f5f9` 边框 | Modal 弹窗 |
| 通知层 (Level 3) | `shadow-lg`，`z-[100]` | Toast 通知 |
| 遮罩层 (Level 4) | `bg-slate-900/50 backdrop-blur-sm`，`z-50` | Modal 遮罩 |
| 导航层 | `z-30`，`sticky` | 导航栏 |
| 内容层 | 默认层叠 | 页面内容 |

**阴影哲学**: QuotaDashboard 使用 Tailwind 的语义化阴影，不自定义阴影值。`shadow-sm` 提供最轻微的浮起感（卡片），`shadow-xl` 提供明显的弹窗抬升，`shadow-lg` 用于飘浮的通知。没有使用 `shadow-md`，层级区分简洁明确。

**边框替代阴影**: 大部分层级区分通过边框色而非阴影完成 —— 卡片用 `border-slate-200` 界定边界，Modal 用 `border-slate-100` 柔化边缘。阴影仅在需要"浮起"语义时使用。

## 7. 动画与过渡

### 过渡
- 按钮: `transition`（全属性过渡，约 150ms）
- 卡片: `transition`（边框色过渡）
- 图标选择器: `transition`（边框色过渡）

### 动画
- 旋转: `animate-spin`（1s 线性无限旋转）— 用于刷新图标和加载环
- 脉冲: `animate-pulse`（2s 缓入缓出无限脉冲）— 用于卡片刷新状态、状态点
- Toast 进入: `toast-enter` — 0.25s ease-out，`translateY(-12px)` + `scale(0.95)` → 原位
- Toast 退出: `toast-leave` — 0.2s ease-in，原位 → `translateY(-12px)` + `scale(0.95)`

### 加载骨架
- 标题骨架: `h-4 w-24 bg-slate-200 rounded animate-pulse`（系统标题加载中）
- 副标题骨架: `h-3 w-36 bg-slate-100 rounded animate-pulse`（系统描述加载中）

## 8. Do's and Don'ts

### Do
- 使用 Teal 青碧 (`#0f766e`) 作为唯一的品牌交互色 — 按钮、链接、焦点环、选中态
- 使用 Slate 50 (`#f8fafc`) 作为页面背景 — 工具型产品的冷灰基底
- 使用 White (`#ffffff`) 作为卡片和 Modal 的背景 — 在 Slate 画布上浮现
- 使用三色信号灯语义展示用量 — 绿 (< 50%) / 黄 (50-79%) / 红 (≥ 80%)
- 使用 Inter 单一字体家族 — 通过字重和字号区分层级
- 使用 `tabular-nums` 展示所有数字 — 用量百分比、倒计时、人数
- 使用 `shadow-sm` 为卡片提供最轻微的浮起感
- 使用 `rounded-lg` (8px) 作为标准交互元素圆角
- 使用 Indigo 焦点环 (`focus:ring-indigo-500`) 区分表单输入框的聚焦态
- 保持 Slate 色系的中性灰基调 — 不引入暖色调灰

### Don't
- 不要使用 Teal 以外的品牌色作为交互主色 — Teal 是唯一品牌色
- 不要使用纯黑 (`#000000`) 作为文字色 — 最深文字为 Slate 900 (`#0f172a`)
- 不要使用纯白 (`#ffffff`) 作为页面背景 — 必须使用 Slate 50
- 不要使用渐变 — 界面深度通过纯色表面层级构建
- 不要使用 `shadow-md` 或自定义阴影 — 只用 `shadow-sm` / `shadow-lg` / `shadow-xl`
- 不要在非数字场景使用 `font-mono` — 等宽字体仅用于 tabular-nums 数字
- 不要引入第二字体 — Inter 是全站唯一字体
- 不要使用 `< 4px` 的圆角 — 最小圆角为 `rounded` (4px)
- 不要在 Slate 色系之外引入暖灰或蓝灰 — 保持 Slate 的一致性
- 不要使用饱和度过高的颜色 — 即使红色也是 Rose 而非纯 Red

## 9. AI Agent 提示词指南

### 快速色值参考
- 品牌 CTA: "Teal 青碧 (#0f766e)，背景 #dff4f2"
- 页面背景: "Slate 50 (#f8fafc)"
- 卡片表面: "White (#ffffff)"
- 卡片边框: "Slate 200 (#e2e8f0)"
- 主文本: "Slate 900 (#0f172a)"
- 次要文本: "Slate 500 (#64748b)"
- 安全用量: "Emerald 600 (#059669)，背景 #ecfdf5"
- 预警用量: "Amber 600 (#d97706)，背景 #fffbeb"
- 危险用量: "Rose 600 (#e11d48)，背景 #fff1f2"

### 组件提示词示例
- "创建一个用量卡片在 White (#ffffff) 背景上，使用 `rounded-xl` (12px) 圆角、`shadow-sm` 阴影、`1px solid #e2e8f0` 边框。卡片标题使用 Inter 14px 700 字重 Slate 900 色。用量百分比使用 `text-xs font-semibold tabular-nums`，低于 50% 时用 Emerald 600 文字配 Emerald 50 背景。"
- "设计一个 Teal 主题的主按钮，使用 `#dff4f2` 背景、`#0f766e` 文字、`#b2e8e3` 边框。`rounded-lg` (8px) 圆角，`px-3.5 py-1.5` 内边距，`shadow-sm` 阴影。悬停时背景变为 `#cbf0ec`，按下时变为 `#b5e9e4`。"
- "创建一个 Modal 弹窗在 White (#ffffff) 背景上，使用 `rounded-2xl` (16px) 圆角、`shadow-xl` 阴影、`border border-slate-100`。遮罩层使用 `bg-slate-900/50 backdrop-blur-sm`。Modal 内边距 `p-6` (24px)，标题用 Inter 16px 700 字重。"
- "构建一个搜索输入框，使用 `w-full` 宽度、`pl-9 pr-4 py-1.5` 非对称内边距、`text-xs` 字号、`border border-slate-300` 默认边框。聚焦时使用 `focus:ring-2 focus:ring-teal-500 focus:border-teal-500`。左侧嵌入 SVG 搜索图标，Slate 400 色。"
- "设计一个团队信息标签系统：团队标签用 `bg-slate-100 text-slate-600`，负责人标签用 `bg-indigo-50 text-indigo-600`，人数标签用 `bg-amber-50 text-amber-600`。所有标签使用 `text-[11px] font-medium` 字号、`px-1.5 py-0.5` 内边距、`rounded` (4px) 圆角。"

### 迭代指南
1. 一次聚焦一个组件
2. 引用具体色值名称 — "使用 Teal 青碧 (#0f766e)" 而非 "用青色"
3. 始终指定 Slate 色系的具体色阶 — 不同色阶有明确角色
4. 明确描述 Inter 字体的字重和字号 — "Inter 14px 700 字重"
5. 对于阴影，使用语义化命名 — "`shadow-sm`" 而非 "加一点阴影"
6. 指定背景色 — "在 Slate 50 (#f8fafc) 上" 或 "在 White (#ffffff) 上"
7. 用量百分比必须遵守三色信号灯语义 — 绿 (< 50%) / 黄 (50-79%) / 红 (≥ 80%)