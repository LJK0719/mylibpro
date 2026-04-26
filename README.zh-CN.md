# MyLibPro

[English](./README.md) | 简体中文

MyLibPro 是一个本地优先的个人学术文献管理应用，基于 Next.js App Router、React、TypeScript、Tailwind CSS 和 SQLite 构建。它使用 SQLite 保存文献元数据，通过 FTS5 做检索，并支持基于本地 Markdown 全文的 AI 研究助手。

这个项目面向个人研究场景：浏览文献库、管理阅读状态和书架、查看文献详情，以及让研究助手基于已经加载的全文证据回答问题。

## 为什么需要这个项目

很多文献管理工具停留在 PDF 编目层面，很多 RAG Demo 又停留在“检索几个 chunk 然后回答”的层面。MyLibPro 关注的是中间这一层：既要把原始文献资料组织好，也要把 AI 需要阅读的内容转换成结构化 Markdown，并且要求研究助手在生成结论前先读取证据单元。

这里有一个关键分工：

- PDF 是归档格式。它保留原始排版、页码、图表、出版格式和可核对的引用依据。
- Markdown 是工作格式。它适合全文检索、版本管理、人工检查，也更适合 LLM 稳定读取。

在 AI 时代，一个可用的个人学术图书馆通常需要同时管理 PDF 和 Markdown：PDF 作为原始凭证保存，Markdown 作为检索、阅读、笔记提取、Agent 研究和自动化处理的工作副本。

## 功能

- 文献库浏览：搜索、学科筛选、阅读状态、收藏和书架。
- 图书和论文详情页。
- 使用 `better-sqlite3` 访问本地 SQLite，支持自动迁移和 WAL 模式。
- 以 Markdown 全文作为研究数据源。
- 带状态机约束的 AI 研究助手。
- 支持 Gemini 和 OpenAI 兼容接口。
- 清晰区分原始 PDF、解析后的 Markdown、元数据和生成的封面资源。

## AI 研究助手

`去向量化知识库系统` `全文优先研究助手`

研究助手是这个项目区别于普通文献管理器的核心。它面向的是基于证据的学术工作，而不是对搜索结果做快速拼接回答。

它不会简单地“检索 top-k chunk 然后回答”，而是按一个可追踪的研究流程工作：

```text
搜索文献目录
  -> 加载 Markdown 全文证据
  -> 记录阅读笔记
  -> 更新研究笔记
  -> 决定继续阅读还是回答
```

这种设计带来几个实际优势：

- 搜索只用于选择文献，不把搜索摘要当成最终证据。
- 论文按完整 Markdown 全文读取。
- 图书按章节读取，避免一次性塞入整本书，也避免假装已经读完整本教材。
- 每个被加载的证据单元都会留下阅读记录。
- 会话研究笔记会跨文献积累，回答来自研究轨迹，而不是单次 prompt。
- Agent 可以释放 active full text 来管理上下文，但阅读历史和研究笔记仍然保留。

这比普通聊天机器人更慢，也更克制。目标不是让模型显得自信，而是让它先读图书馆，再写结论。

工作流由 `lib/agent/state-machine.ts` 和 chat route 在代码层强制执行：

```text
initial
  -> must_read
  -> must_record
  -> must_notes
  -> must_decide
  -> can_decide
```

不同阶段可用工具不同：

| 阶段 | 可用工具 |
| --- | --- |
| `initial` | 全部工具 |
| `must_read` | `get_document_detail`, `load_full_text`, `load_chapter`, `remove_reference`, `decide_continue_or_answer` |
| `must_record` | `record_reading` |
| `must_notes` | `update_research_notes` |
| `must_decide` | `decide_continue_or_answer` |
| `can_decide` | 全部工具 |

关键约束：

- 深度研究流程为 `search -> read full text -> record reading -> update notes -> decide`。
- 图书通过 `load_chapter` 按章节读取，不把整本书作为一个证据单元加载。
- `record_reading` 必须绑定具体文献；如果是图书，还必须绑定章节文件。
- 最终回答应只引用已经读过或仍在 active reference 中的文献。
- `remove_reference` 只释放 active context，不删除阅读历史、笔记或 artifact。
- `decide_continue_or_answer` 只能在至少记录一次阅读并更新笔记后调用。

## 技术栈

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/Radix 风格 UI 组件
- lucide-react 图标
- SQLite FTS5 和 `better-sqlite3`
- `@google/genai` 以及 OpenAI 兼容 provider

## 快速开始

环境要求：

- Node.js 20+
- npm
- `better-sqlite3` 对应的本地 SQLite 运行支持
- 如果使用研究助手，需要配置 LLM API key

安装依赖：

```bash
npm install
```

创建本地配置：

```bash
cp .env.example .env.local
```

至少需要配置：

```bash
GEMINI_API_KEY=...
DATA_ROOT=D:/bookdata/libdata
DB_PATH=./db/library.db
```

启动开发服务：

```bash
npm run dev
```

访问地址：

- 文献库：`http://localhost:3000`
- 研究助手：`http://localhost:3000/agent`

## 文献资料目录结构

MyLibPro 不是从任意目录随便扫描文献。当前导入脚本要求文献资料按固定结构放在 `DATA_ROOT` 下。

当前默认规则：

- 如果存在 `D:\bookdata\libdata`，默认使用它作为 `DATA_ROOT`。
- 否则使用项目根目录同级的 `../data`。
- 可以在 `.env.local` 里通过 `DATA_ROOT` 显式覆盖。

顶层结构：

```text
DATA_ROOT/
  book/
    <folder_name>/
      metadata.json
      source.pdf              # 推荐：原始 PDF，用于归档和核对
      content.md              # 可选：整书 Markdown，Agent 不会把整本书作为一个证据单元加载
      chapters/
        01-introduction.md
        02-related-work.md
        ...
  paper/
    <folder_name>/
      metadata.json
      source.pdf              # 推荐：原始 PDF
      content.md              # 论文全文 Markdown，或由 full_text_path 指向其他 Markdown 文件
  report/
    ...                       # 当前导入脚本不会自动扫描，除非后续扩展 importer
```

当前 importer 只扫描 `book/` 和 `paper/`。其他文献类型可以先在元数据里表达，但如果要自动发现，需要扩展导入脚本。

图书目录示例：

```text
DATA_ROOT/book/bishop-prml-2006/
  metadata.json
  source.pdf
  content.md
  chapters/
    00-preface.md
    01-introduction.md
    02-probability-distributions.md
```

对图书来说，`chapters/*.md` 是 Agent 真正读取的核心。导入脚本会把排序后的章节文件名写入数据库的 `chapters` 字段，`load_chapter` 会从下面的位置读取章节：

```text
DATA_ROOT/<type>/<folder_name>/chapters/<chapter_file_name>
```

论文目录示例：

```text
DATA_ROOT/paper/attention-is-all-you-need-2017/
  metadata.json
  source.pdf
  content.md
```

对论文或短文档，`load_full_text` 会读取元数据里解析出的 Markdown 路径。常见写法：

```json
{
  "type": "paper",
  "folder_name": "attention-is-all-you-need-2017",
  "full_text_path": "paper/attention-is-all-you-need-2017/content.md"
}
```

推荐本地约定：

- 原始 PDF 固定保存为 `source.pdf`。
- 论文解析后的 Markdown 保存为 `content.md`。
- 图书拆分到 `chapters/*.md`；`content.md` 只作为需要时的整书副本。
- `metadata.json` 与原始 PDF、Markdown 放在同一个文献目录下。
- 不要把 SQLite 运行时数据库文件放到 `DATA_ROOT` 里。

## PDF 转 Markdown

PDF 转换不属于 importer 的职责。运行 `npm run import` 前，Markdown 文件应该已经准备好。

对于包含公式、表格、代码块、多栏排版的技术 PDF，建议使用能保留结构的解析平台。本项目推荐使用 [KolmoPDF](https://www.kolmopdf.com/) 的会员 API 做批量 PDF-to-Markdown 工作流。

推荐处理流程：

```text
1. 将原始 PDF 保存到 DATA_ROOT/book/... 或 DATA_ROOT/paper/...。
2. 使用 KolmoPDF 或同类解析器把 PDF 转成 Markdown。
3. 如果是图书，将 Markdown 按章节拆分到 chapters/。
4. 创建或更新 metadata.json。
5. 运行 npm run prepare-data。
6. 在 MyLibPro 中检查文献，再让 Agent 基于它做研究。
```

转换质量会直接影响研究质量。标题层级丢失、表格被压平、公式乱码，都会让 Agent 的阅读和引用变差。

## 数据导入

数据库从 `DATA_ROOT` 下的 `metadata.json` 和章节文件导入。

执行导入：

```bash
npm run prepare-data
```

该命令会依次运行：

```bash
npm run import
npm run covers
```

导入脚本会把元数据写入 `db/library.db`。`library.db-wal` 和 `library.db-shm` 是 SQLite 运行时文件，通常视为本地状态。

## 元数据格式

一个典型的 `metadata.json`：

```json
{
  "document_id": "bishop-prml-2006",
  "type": "book",
  "title": "Pattern Recognition and Machine Learning",
  "authors": ["Christopher M. Bishop"],
  "year": 2006,
  "discipline": ["Machine Learning"],
  "subdiscipline": ["Probabilistic Models"],
  "keywords": ["Bayesian inference", "pattern recognition"],
  "abstract": "...",
  "toc": "...",
  "folder_name": "bishop-prml-2006",
  "full_text_path": "book/bishop-prml-2006/content.md",
  "chapters": ["01-introduction.md"],
  "token_count": 180000
}
```

应用也支持中英文元数据字段，例如 `title_zh`、`title_en`、`authors_zh`、`authors_en`、`discipline_zh`、`discipline_en`、`abstract_zh`、`abstract_en`。

## 常用命令

```bash
npm run dev          # 启动 Next.js 开发服务
npm run build        # 构建生产版本
npm run start        # 启动生产服务
npm run lint         # 运行 ESLint
npm run import       # 导入元数据到 SQLite
npm run covers       # 生成封面图片
npm run prepare-data # 导入数据并生成封面
```

## 项目结构

```text
app/                         Next.js 路由和 API handlers
  api/agent/chat/route.ts     研究助手流式接口
  api/agent/sessions/route.ts Agent 会话创建和删除接口
  api/books/                  文献库 API
  agent/                      研究助手页面
  books/                      文献详情页

components/
  agent/                      聊天和 workspace UI
  common/                     导航、语言、主题 provider
  library/                    文献库和文献详情组件
  ui/                         通用 UI primitives

lib/
  db.ts                       SQLite 初始化和迁移
  repositories/               数据访问层
  search/                     搜索归一化辅助逻辑
  agent/                      Agent prompt、工具、状态机和 providers

skills/                       本地 research skill 定义
scripts/                      数据导入和封面生成脚本
public/covers/                生成或静态封面资源
db/                           本地 SQLite 数据库
```

## LLM Provider

默认 provider 是 Gemini：

```bash
AGENT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```

也支持 OpenAI 兼容接口：

```bash
AGENT_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

如果使用 Ollama、LM Studio 等本地 OpenAI 兼容服务，调整 `OPENAI_BASE_URL` 和 `OPENAI_MODEL` 即可。

## 开发注意事项

- 数据库访问放在 API route 或 `lib/` 下的服务端 helper 中。
- 项目模块导入优先使用 `@/*` alias。
- 只有需要 state、effect 或浏览器 API 的组件才加 `"use client"`。
- UI 改动应尽量复用 `components/ui` 中的现有组件模式。
- 不要提交 `.env.local` 或其他密钥文件。
- 除非任务明确要求处理数据库资产，否则把 `db/library.db`、`db/library.db-wal`、`db/library.db-shm` 视为本地运行状态。

## 验证

一般代码改动：

```bash
npm run lint
npm run build
```

数据或 API 相关改动，建议使用隔离数据库：

```bash
DB_PATH=./db/test-library.db npm run import
```

前端改动应启动开发服务，并在浏览器中检查受影响页面。

## License

MIT
