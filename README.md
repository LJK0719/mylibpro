# 📚 MyLibPro — 智能个人学术图书馆

> 一个融合 **AI 深度研究** 与 **高性能全文检索** 的个人学术文献管理系统，基于 Next.js 15 与 Google Gemini 构建。

---

## 🌟 项目简介

MyLibPro 是一款专为学术研究者设计的**私有数字图书馆**系统。它不仅提供美观的图书浏览与检索界面，更通过接入 Google Gemini 大语言模型，实现了**具备工具调用能力的 AI 研究助手**——让你的 AI 能够自主搜索文献、阅读全文、记录笔记并给出引用自本地藏书的专业答案。

---

## ✨ 核心功能

### 📖 图书馆主页
- **三种视图模式**：网格视图、列表视图、封面视图，自由切换
- **实时全文搜索**：输入防抖（400ms）+ SQLite FTS5 全文索引，支持书名、作者、关键词、摘要联合检索
- **多维度筛选**：按文献类型（图书/论文）、学科、子领域筛选
- **灵活排序**：支持最新优先、最早优先、书名 A-Z/Z-A、篇幅大小
- **分页浏览**：智能椭圆分页器，每页数量随视图模式自适应

### 🤖 AI 研究助手（Agent）
- **流式对话**：响应内容实时逐字流出，体验流畅
- **工具调用可视化**：实时展示 AI 正在调用哪些工具及执行状态
- **工作区面板**：直观展示当前会话已加载的参考文献、阅读历史与研究笔记
- **多轮对话**：完整保留历史上下文，支持追问与深度研究

### 📦 数据管理
- **元数据导入**：扫描 `data/book` 与 `data/paper` 目录下各文献的 `metadata.json` 并批量入库
- **封面生成**：Python 脚本自动生成图书封面
- **图书详情页**：独立路由展示单本文献的完整信息

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                    浏览器（客户端）                           │
│  ┌──────────────┐  ┌──────────────────────────────────────┐ │
│  │ 图书馆主页    │  │          AI 研究助手页面              │ │
│  │ /            │  │          /agent                      │ │
│  │ - 搜索/筛选  │  │ - 流式 SSE 对话                      │ │
│  │ - 分页浏览   │  │ - 工具调用可视化                      │ │
│  │ - 三种视图   │  │ - 工作区面板（参考文献 / 笔记）       │ │
│  └──────┬───────┘  └──────────────┬───────────────────────┘ │
└─────────┼────────────────────────┼───────────────────────────┘
          │ REST API               │ Streaming JSON
          ▼                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Next.js 服务端（App Router）                 │
│  ┌────────────────┐  ┌─────────────────────────────────────┐│
│  │ /api/books     │  │ /api/agent/chat                     ││
│  │ /api/disciplines│  │ - Gemini Function Calling 循环      ││
│  │                │  │ - 工具分发 (executeTool)            ││
│  └───────┬────────┘  └──────────┬──────────────────────────┘│
│          │                      │                            │
│  ┌───────▼──────────────────────▼───────────────────────┐   │
│  │                    lib/ 服务层                        │   │
│  │  db.ts           workspace.ts       agent-tools.ts   │   │
│  │  - SQLite 连接   - 会话状态管理     - 6 个工具定义   │   │
│  │  - FTS5 索引     - 活跃引用追踪     - 工具执行逻辑   │   │
│  └───────┬──────────────────────────────────────────────┘   │
└──────────┼──────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────┐    ┌───────────────────────────┐
│  SQLite (library.db)    │    │  文件系统 (../data/)       │
│  - documents 主表       │    │  - book/{id}/metadata.json │
│  - documents_fts 虚表   │    │  - book/{id}/content.md    │
│  - WAL 模式             │    │  - paper/{id}/...          │
└─────────────────────────┘    └───────────────────────────┘
```

---

## 🧠 AI Agent 工作原理

### Gemini Function Calling 循环

```
用户提问
    │
    ▼
┌─────────────────────────────────────────────┐
│         Gemini API (Function Calling)        │
│   接收：用户消息 + 对话历史 + 工作区状态      │
│   可用：6 个工具函数声明                      │
└────────────────────┬────────────────────────┘
                     │ AI 决定调用工具
                     ▼
            ┌──────────────────┐
            │  工具执行层       │        ← 纯服务端同步执行
            │  executeTool()   │
            └────────┬─────────┘
                     │ 工具结果返回给 Gemini
                     ▼
             Gemini 继续思考
            （可能多轮调用工具）
                     │
                     ▼
              生成最终回答（流式输出）
                     │
                     ▼
         前端 SSE 实时接收渲染
```

### 六大工具能力

| 工具名称 | 类别 | 功能描述 |
|---|---|---|
| `search_library` | 🔍 读取 | 在图书馆目录中全文检索，返回元数据列表 |
| `get_document_detail` | 🔍 读取 | 获取单本文献详情：摘要、目录、引用信息 |
| `load_full_text` | 🔍 读取 | 加载文献完整 Markdown 全文，自动加入活跃引用 |
| `record_reading` | ✍️ 写入 | 记录阅读发现：关键结论、阅读目的 |
| `update_research_notes` | ✍️ 写入 | 更新研究笔记（支持追加/全量替换） |
| `remove_reference` | ✍️ 写入 | 从活跃引用中移除低相关文献，释放 Token 预算 |

### 会话工作区（Workspace）设计

每个对话 Session 维护一份**内存中的工作区状态**，包含三张表：

```typescript
WorkspaceState {
  activeReferences:  ActiveReference[]      // 当前已加载的文献（含全文）
  readingHistory:    ReadingHistoryEntry[]   // 历史阅读记录（已读/已移除）
  researchNotebook:  string                 // AI 研究笔记（Markdown）
  totalTokens:       number                 // 当前活跃引用的总 Token 用量
}
```

- **Token 预算管理**：AI 可自主评估已加载文献的相关性，调用 `remove_reference` 释放 Token 空间，再加载新文献
- **阅读轨迹记录**：所有阅读行为（包括原因、关键发现）均写入历史，构成完整研究过程

---

## 🗄️ 数据库设计

### documents 主表

| 字段 | 类型 | 说明 |
|---|---|---|
| `document_id` | TEXT PK | 文献唯一标识符 |
| `type` | TEXT | 文献类型：`book` / `paper` |
| `title` | TEXT | 书名 / 论文标题 |
| `authors` | TEXT | 作者列表（JSON 数组字符串） |
| `year` | INTEGER | 出版年份 |
| `discipline` | TEXT | 一级学科（JSON 数组） |
| `subdiscipline` | TEXT | 子领域（JSON 数组） |
| `keywords` | TEXT | 关键词（JSON 数组） |
| `abstract` | TEXT | 摘要 |
| `toc` | TEXT | 目录 |
| `full_text_path` | TEXT | 全文 Markdown 文件的相对路径 |
| `token_count` | INTEGER | 全文 Token 数量（用于 Token 预算管理） |
| `citation_info` | TEXT | 引用信息（可指向 .txt 文件路径） |

### FTS5 全文搜索虚表

```sql
CREATE VIRTUAL TABLE documents_fts USING fts5(
  document_id UNINDEXED,
  title,
  authors,
  keywords,
  abstract,
  discipline,
  subdiscipline,
  content='documents',          -- 内容表关联
  content_rowid='rowid',
  tokenize='unicode61'          -- Unicode 分词，支持中英文
);
```

通过 **AFTER INSERT / UPDATE / DELETE 触发器**保持 FTS 索引与主表实时同步。查询时使用 `MATCH` 操作符进行高效全文检索，支持多词 OR 查询。

---

## 🛠️ 技术栈

### 前端
| 技术 | 版本 | 用途 |
|---|---|---|
| **Next.js** | 16.x (App Router) | 全栈框架，SSR/RSC/API 路由 |
| **React** | 19.x | UI 构建 |
| **TypeScript** | 5.x | 类型安全 |
| **Tailwind CSS** | 4.x | 原子化样式 |
| **Radix UI** | 1.x | 无障碍 UI 组件原语 |
| **shadcn/ui** | 3.x | 组件库（基于 Radix + Tailwind） |
| **Lucide React** | — | 图标库 |
| **next-themes** | — | 深色/浅色主题切换 |

### 后端
| 技术 | 版本 | 用途 |
|---|---|---|
| **Next.js API Routes** | — | RESTful API + Streaming 端点 |
| **better-sqlite3** | 12.x | 同步 SQLite 客户端（高性能） |
| **SQLite FTS5** | — | 全文检索引擎 |
| **@google/genai** | 1.x | Google Gemini API SDK |

### 工具链 & 脚本
| 技术 | 用途 |
|---|---|
| **tsx** | 直接运行 TypeScript 脚本 |
| **Python** | 封面图片自动生成 |
| **ESLint** | 代码质量检查 |

---

## 🚀 项目优势

### 1. 本地优先，数据私有
所有文献数据存储在本地 SQLite 数据库与文件系统中，**无需任何云端数据库订阅**，完整保护学术资料的隐私性。

### 2. AI 具备真实记忆与推理能力
不同于简单的 RAG（检索增强生成），本系统的 AI Agent 具备**主动规划能力**：
- 自主决定搜索策略
- 判断是否需要加载全文（避免无效 Token 消耗）
- 记录阅读过程，积累研究笔记
- 主动管理 Token 预算，可处理超大文献集

### 3. 流式响应体验
API 层采用 **NDJSON 流式传输**（换行分隔 JSON），前端实时解析多类型事件（`text` / `tool_call` / `tool_result` / `workspace`），用户能即时感知 AI 的思考过程，**透明度极高**。

### 4. 搜索性能卓越
- SQLite FTS5 索引覆盖标题、作者、关键词、摘要、学科等字段
- 触发器自动维护 FTS 与主表一致性
- 查询结果毫秒级返回，无需服务器端搜索引擎

### 5. 零运维复杂度
- 单一 SQLite 文件作为数据库，无需 PostgreSQL 等独立服务
- Next.js 全栈部署，前后端合一
- 文献数据通过简单 `metadata.json` 描述，导入流程极简

---

## 📁 项目结构

```
mylibpro/
├── app/
│   ├── page.tsx              # 图书馆主页（搜索+浏览）
│   ├── layout.tsx            # 全局布局（导航栏+主题）
│   ├── globals.css           # 全局样式（CSS 变量+主题）
│   ├── agent/
│   │   └── page.tsx          # AI 研究助手对话界面
│   ├── books/
│   │   └── [id]/             # 图书详情页（动态路由）
│   └── api/
│       ├── books/route.ts    # GET /api/books  — 文献列表+搜索
│       ├── disciplines/      # GET /api/disciplines — 筛选元数据
│       └── agent/
│           ├── chat/         # POST /api/agent/chat — 流式对话
│           └── sessions/     # 会话管理端点
├── components/
│   ├── BookCard.tsx          # 图书卡片组件（支持三种视图模式）
│   ├── CoverImage.tsx        # 封面图片组件
│   ├── ThemeProvider.tsx     # 主题上下文
│   ├── ThemeToggle.tsx       # 明暗主题切换按钮
│   ├── agent/
│   │   ├── ChatMessage.tsx   # 对话消息（含工具调用展示）
│   │   ├── ChatInput.tsx     # 输入框组件
│   │   └── WorkspacePanel.tsx# 工作区面板（引用列表+笔记）
│   └── ui/                   # shadcn/ui 基础组件
├── lib/
│   ├── db.ts                 # SQLite 连接 + 表结构 + 类型定义
│   ├── workspace.ts          # 会话工作区状态管理（内存）
│   ├── agent-tools.ts        # Gemini 工具声明 + 执行逻辑
│   └── utils.ts              # 工具函数
├── db/
│   └── library.db            # SQLite 数据库文件
├── scripts/
│   ├── import-books.ts       # 批量导入文献元数据
│   └── generate_covers.py    # Python 封面生成脚本
└── public/                   # 静态资源
```

---

## ⚡ 快速开始

### 环境要求
- Node.js 20+
- Python 3.8+（仅封面生成需要）
- Google Gemini API Key

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
# 创建 .env.local 文件
GEMINI_API_KEY=你的_Google_Gemini_API_Key
```

### 3. 准备文献数据

将文献按以下结构放置（位于项目上级目录）：

```
../data/
├── book/
│   └── {书名文件夹}/
│       ├── metadata.json     # 文献元数据
│       └── content.md        # 全文（Markdown 格式）
└── paper/
    └── {论文文件夹}/
        ├── metadata.json
        └── content.md
```

`metadata.json` 示例：

```json
{
  "document_id": "bishop-prml-2006",
  "type": "book",
  "title": "Pattern Recognition and Machine Learning",
  "authors": ["Christopher M. Bishop"],
  "year": 2006,
  "discipline": ["机器学习", "统计学"],
  "subdiscipline": ["贝叶斯方法", "神经网络"],
  "keywords": ["模式识别", "贝叶斯推断", "深度学习"],
  "abstract": "...",
  "toc": "...",
  "full_text_path": "book/bishop-prml-2006/content.md",
  "token_count": 180000
}
```

### 4. 导入数据

```bash
# 导入元数据并生成封面（一键完成）
npm run prepare-data

# 或分步执行
npm run import    # 仅导入元数据到 SQLite
npm run covers    # 仅生成封面图片
```

### 5. 启动开发服务器

```bash
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000) 查看图书馆主页。

访问 [http://localhost:3000/agent](http://localhost:3000/agent) 使用 AI 研究助手。

---

## 🔌 API 文档

### `GET /api/books`

获取文献列表，支持搜索、筛选、排序和分页。

| 参数 | 类型 | 说明 |
|---|---|---|
| `q` | string | 全文搜索查询词 |
| `type` | string | `book` 或 `paper` |
| `discipline` | string | 按学科筛选 |
| `subdiscipline` | string | 按子领域筛选 |
| `sort` | string | `year_desc` / `year_asc` / `title_asc` / `title_desc` / `token_desc` |
| `page` | number | 页码（默认 1） |
| `pageSize` | number | 每页数量（默认 12，最大 50） |

### `GET /api/disciplines`

获取所有学科、子领域、文献类型及年份范围，用于前端筛选面板。

### `POST /api/agent/chat`

AI 研究助手对话端点，返回 **NDJSON 流**。

**请求体：**
```json
{
  "message": "用户消息",
  "sessionId": "唯一会话 ID",
  "history": [
    { "role": "user", "text": "历史消息..." },
    { "role": "model", "text": "AI 回复..." }
  ]
}
```

**流式事件类型：**
```
{"type":"text",        "content":"..."}          # 文本增量
{"type":"tool_call",   "tool":"...", "args":{}}  # 工具调用开始
{"type":"tool_result", "tool":"...", "success":true} # 工具执行完成
{"type":"workspace",   "workspace":{...}}        # 工作区状态更新
{"type":"error",       "error":"..."}            # 错误信息
{"type":"status",      "message":"..."}          # 状态提示（如限流等待）
```

---

## 🎨 主题与样式

系统支持**明暗双主题**，通过 `next-themes` 管理，CSS 变量驱动设计 token。`globals.css` 中定义了完整的设计系统，包括颜色、圆角、阴影和自定义组件类（如 `.book-card`、`.tag-chip`、`.agent-avatar` 等）。

---

## 📄 许可证

MIT License
