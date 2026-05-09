# doc-verify

> 技术文档自动化验证工具——以**事实优先**为核心：先让 Agent 在控制台跑出真实事实库，再用文档对它做审计，输出差异报告。

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-yellow.svg)](https://opensource.org/licenses/Apache-2.0)

**Version: 0.2.0**（2026-05）—— 工作流反转 + CLI 模块化 + Schema 验证 + 登录态去歧义。详见下方 [v0.2.0 改造](#v020-改造)。

## 为什么需要这个工具

技术文档会腐化。按钮改名了、选项增减了、标签换词了——文档还停留在旧版本。手动逐页点控制台核对，既低效又容易遗漏。

doc-verify 让 AI Agent 自动完成这件事:**控制台是地面真相,文档是待审对象**。先让 Agent 在控制台独立爬一遍事实(不依赖文档!),再用事实库审计文档,输出差异报告告诉你哪里错了、怎么改。

> **设计核心**:文档错了时,Agent 不会卡住——因为它根本不靠文档去导航。文档只是被审计的输入。

## 工作原理(v0.2.0 反转后)

```
       [事实优先]                          [文档审计]
                                                
  控制台 ──→ console-explorer ──→ 事实库 ──→ doc-collection-planner
                                       ↓                ↓
                            (源码补充,可选)        audit-plan.json
                                       ↓                ↓
                              ui-code-fact-extractor    │
                                       ↓                ↓
                                       └──→ 合并 ──→ doc-fact-verifier
                                                          ↓
                                                       差异报告
```

两种模式,按是否有源码选择:

| 模式 | 适用场景 | 事实来源 |
|------|---------|---------|
| **Mode A — 源码增强** | 有前端源码 | 源码 + 控制台 (双源交叉验证) |
| **Mode B — 纯控制台** | 无源码 | 控制台 (`console-explorer` 全量爬取) |

> 与 v0.1 的关键差别:v0.1 是文档驱动 Playwright 去走流程,文档错了就卡住;v0.2 是 Agent 先独立把控制台爬完,文档只在最后被对照审计。

## 快速开始

**前置条件**:Node.js 18+、[@playwright/cli](https://github.com/microsoft/playwright-cli) `^0.1`

```bash
git clone https://github.com/yuanshan8053/doc-verify.git
cd doc-verify
npm install                           # 安装 ajv 等依赖

# 1. 环境自检(可选,推荐)
node bin/doc-verify.js doctor

# 2. 初始化项目(交互式)
node bin/doc-verify.js init
#    或非交互(CI 友好):
node bin/doc-verify.js init --non-interactive --config fixtures/iga.json --out ./iga-docs

# 3. 安装 Skills 到 AI Agent 目录
node bin/doc-verify.js install --agent claude-code,trae

# 4. 登录控制台(浏览器打开后手动登录,保存认证状态)
node bin/doc-verify.js login --wait-and-save

# 5. 让 AI Agent 验证你的文档(调用 doc-console-verifier Skill)
```

初始化完成后,项目目录结构如下:

```
your-project/
├── config/
│   ├── project.json            # 项目配置
│   └── paths.json              # 路径清单(供 Skills 解析)
├── .playwright/cli.config.json # Playwright 配置(已无 userDataDir)
├── skills/                     # 6 个 Skill 定义
└── fact-base/iga-byteplus-en/  # 事实库(按 产品-控制台-语言 组织)
    ├── exploration-report.json # 探索覆盖度报告
    ├── flow-deviations.json    # 文档流偏离记录
    ├── source-facts/
    ├── console-facts/
    ├── merged-facts/
    ├── audit-plan.json         # 文档审计计划
    └── reports/
```

## CLI 命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `init` | 创建验证项目(支持 `--non-interactive`) | `doc-verify init` |
| `install` | 安装 Skills 到 AI Agent 目录 | `doc-verify install --agent claude-code` |
| `login` | 打开浏览器手动登录,保存认证状态 | `doc-verify login --wait-and-save` |
| `login-save` | 保存当前浏览器的认证状态 | `doc-verify login-save` |
| `console` | 加载认证 + 导航到控制台(结构化登录探测) | `doc-verify console` |
| `validate <file...>` | **新**:用 JSON Schema 校验事实库产物 | `doc-verify validate fact-base/.../audit-plan.json` |
| `doctor` | **新**:Node/Playwright/config/schemas 预检 | `doc-verify doctor` |

公共标志:

- `--non-interactive` — 不弹任何 prompt(用于 CI/Agent 调度)
- `--config <path>` — 指定配置文件路径(也支持 `DOC_VERIFY_CONFIG` 环境变量)
- `--json` — 输出结构化 JSON 日志(每行一条记录,便于 Agent 解析)
- `--force` — `init` 时覆盖已有目录

## Skills(v0.2.0)

doc-verify 通过 **6 个 Skill** 指导 AI Agent 完成验证工作流。事实优先:`console-explorer` 先把控制台跑一遍,后续 Skill 都基于事实库工作。

| Skill | 职责 | 何时使用 |
|-------|------|---------|
| `console-explorer` ⭐ **新** | 独立爬控制台、导航树 BFS、生成事实库,不依赖文档 | 每次验证的第一步 |
| `console-fact-collector` | 通过 Playwright CLI 采集/验证单个流程的事实 | 探索遇阻或针对性验证 |
| `ui-code-fact-extractor` | 从前端源码提取 UI 事实(LLM 驱动) | 有源码时(Mode A) |
| `doc-collection-planner` | **反转**:用事实库审计文档,生成 audit-plan | 探索完成后 |
| `doc-fact-verifier` | 消费 audit-plan,生成差异报告 | 审计计划生成后 |
| `doc-console-verifier` | 编排完整工作流(顶层 Skill) | 端到端验证 |

> 所有 Skill 输出的 JSON 都附带 `$schema` 字段,可被 `doc-verify validate` 校验。

### 失败→pivot 决策表(`console-fact-collector`)

v0.2 给每种失败症状定义了对应的 pivot 动作(节选):

| 症状 | Pivot |
|------|-------|
| 标签匹配不上 | `fuzzy_match_token_set` / `disambiguate_by_section` |
| 选项弹窗找不到选项 | `open_dropdown_enumerate` |
| 表单验证失败 | `test_data_strategy_a/b/c` |
| 步骤顺序对不上 | `capture_actual_step_labels` / `follow_actual_order` |
| 同一动作 2 次未通过 | 触发 `console-explorer` 接管 |

每条偏离都被写入 `flow-deviations.json`,作为候选文档 bug。

## 项目结构(v0.2.0)

```
doc-verify/
├── bin/doc-verify.js               # ~80 行薄路由
├── src/
│   ├── commands/                   # 各子命令独立模块
│   │   ├── init.js     install.js     login.js
│   │   ├── login-save.js  console.js
│   │   ├── validate.js doctor.js
│   └── lib/                        # 复用模块
│       ├── args.js     paths.js   config.js
│       ├── log.js      prompts.js
│       ├── playwright-cli.js       # 版本 pin + open/poll/probeLogin
│       └── schema.js               # ajv + fallback
├── schemas/                        # JSON Schema 定义
│   ├── ui-code-facts.v1.json
│   ├── audit-plan.v1.json
│   ├── exploration-report.v1.json
│   └── flow-deviations.v1.json
├── skills/                         # 6 个 Skill
│   ├── console-explorer/           # ⭐ 新增
│   ├── console-fact-collector/
│   ├── ui-code-fact-extractor/
│   ├── doc-collection-planner/
│   ├── doc-fact-verifier/
│   └── doc-console-verifier/
├── test/                           # node:test 单元测试
└── package.json                    # v0.2.0
```

### 事实库组织方式

事实库按 **产品-控制台-语言** 三维组织,支持多产品并行:

```
fact-base/iga-byteplus-en/      # IGA 产品,BytePlus 控制台,英文
fact-base/dcdn-volcengine-zh/   # DCDN 产品,火山引擎控制台,中文
```

每个事实文件提供 **双格式输出**:

| 格式 | 用途 |
|------|------|
| `.json` | 机器可读,带 `$schema`,可被 `validate` 校验 |
| `.md` | 人类可读,便于审阅和协作 |

## 配置说明

### project.json

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | string | 项目名称 |
| `console_url` | string | 控制台 URL |
| `source_code_path` | string \| null | 前端源码路径,为 null 则使用 Mode B |
| `docs_path` | string \| null | 文档根目录 |
| `mode` | `"source-enhanced"` \| `"console-only"` | 验证模式 |
| `locale` | string | 主语言 |
| `locales` | string[] | 所有支持的语言 |
| `fact_base` | string | 事实库路径,格式:`fact-base/{product}-{console}-{locale}` |

### paths.json (新)

`config/paths.json` 由 `init` 写入,把所有标准路径(事实库、报告、截图、各类输出文件)集中在一处,避免每个 Skill 各自硬编码。

### Playwright CLI 配置

`.playwright/cli.config.json` 中:

- `--no-sandbox` 和 `--disable-gpu-sandbox` 是 **Trae IDE 沙箱环境必需的**(不加会触发 `GPU process isn't usable. Goodbye.`)。
- **v0.2 移除了 `userDataDir`**:认证状态以 `auth-state.json` 为唯一真相源,避免"两个真相"的歧义。如果 `doctor` 检测到老配置仍含 `userDataDir`,会发出 warning。

## 输出示例

差异报告示例:

```markdown
# Best practices — Solutions by scenario: Diff report

## Summary

| 指标 | 数量 |
|------|------|
| 提取声明总数 | 32 |
| 确认匹配 | 22 |
| 不匹配 | 5 |
| 未记录 | 3 |

## C1 — 缺少 AI 场景文档 [高]

**文档声明**:4 个场景(APIs、Web pages、Uploads、Other)
**控制台事实**:6 个场景,分 2 组(AI services + Generic)
**修订建议**:补充 AI services 和 AI download 两个场景的文档
```

## v0.2.0 改造

| 类别 | 改造 |
|------|------|
| **架构** | 工作流反转:facts-first;新增 `console-explorer` 作为第一步 |
| **韧性** | `console-fact-collector` 引入 12 条 fail→pivot 决策;同一动作最多 2 次,然后强制交回 explorer |
| **CLI** | `bin/doc-verify.js` 拆为 `src/commands/*` + `src/lib/*`;统一错误码 + `--non-interactive` + `--json` 日志 |
| **Schema** | 4 份 JSON Schema(ui-code-facts / audit-plan / exploration-report / flow-deviations);新增 `validate` 命令(ajv + fallback) |
| **登录态** | 移除 `userDataDir`;新增 `probeLogin()` 结构化登录探测;`sleep` 全部换成 `pw.poll/waitOpen/waitReady` |
| **可观测** | 新增 `doctor` 预检命令;`runStep` 包装错误并附 hint |

## 常见问题

### 浏览器打开后立即关闭

**原因**:Trae IDE 沙箱与 Chrome 沙箱冲突,GPU 进程崩溃。
**解决**:确认 `.playwright/cli.config.json` 的 `launchOptions.args` 包含 `--no-sandbox` 和 `--disable-gpu-sandbox`。`doc-verify doctor` 也会自动检查这一项。

### 认证状态加载后仍显示未登录

**原因**:`state-load` 只注入 cookies,已渲染的页面不会自动刷新。
**解决**:加载认证后,`console` 命令会自动 `goto` 目标 URL 触发刷新,并通过 `probeLogin()` 探测 URL/密码框/重定向链综合判定登录状态。

### 文档错了导致 Playwright 卡住

**v0.2 解决方案**:不再用文档驱动 Playwright。`console-explorer` 先独立爬控制台拿到事实,文档只在最后被审计。即使文档完全错乱,事实库依然完整。

### 多步表单卡在中间步骤

**原因**:部分表单(如"添加域名"向导)需要有效测试数据才能通过验证。
**解决**:`console-fact-collector` 的 pivot 决策表会自动尝试 strategy A(复用已有数据改前缀)→ B(API)→ C(最小输入)。

### 认证过期

**解决**:重新运行 `node bin/doc-verify.js login --wait-and-save`,登录后保存新的认证状态。

## 测试

```bash
npm test                         # 单元测试 (node:test, 0 dependency)
node bin/doc-verify.js doctor    # 环境自检
node bin/doc-verify.js validate fact-base/.../audit-plan.json
```

## 系统要求

- Node.js 18+
- [@playwright/cli](https://github.com/microsoft/playwright-cli) `^0.1`(可通过 `DOC_VERIFY_PW_PIN` 覆盖)
- Chromium 浏览器(通过 `npx playwright-cli install-browser chromium` 安装)
- 支持 Skills 的 AI Agent(Claude Code、Trae、Copilot 等)

## 许可证

Apache-2.0
