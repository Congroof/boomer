# Pulse

基于 **React 18 + TypeScript + Tailwind CSS + shadcn/ui + Tauri v2 + Rust (Tokio + Reqwest)** 构建的纯本地 PC 桌面客户端，原生支持 **macOS** 与 **Windows**。无需任何后端服务器，所有接口配置与压测统计数据均安全持久化在本地操作系统应用目录。

---

## 核心特性与工程设计

### 1. 接口录入与模板化设计 (`Endpoint Studio`)
- **全方法与多格式支持**：支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`，以及 Query 参数、自定义请求头、`JSON`、`x-www-form-urlencoded`、`Multipart Form`、`Raw` 请求体。
- **自定义参数自动识别 (`{{变量}}`)**：在 URL、Query、Headers 或 Body 任意位置编写如 `{{phone}}`、`{{userId}}`、`{{token}}`，前端自动扫描并生成参数元数据定义（中文名称、默认值、必填校验、备注）。
- **内置动态函数 (`{{$...}}`)**：Rust 引擎在每次并发请求发出前零正则开销实时求值：
  - `{{$uuid}}`：随机 UUID v4
  - `{{$timestamp}}` / `{{$timestamp_ms}}`：秒级 / 毫秒级时间戳
  - `{{$seq}}`：任务内单调递增请求序号
  - `{{$random_int:min:max}}` / `{{$random_str:len}}` / `{{$random_phone}}`
- **多维成功断言规则 (`Assertions`)**：支持自定义预期 HTTP 状态码区间（如 `200-299` 或 `200,201`）、响应体包含/不包含关键字、JSON 点号路径精确断言（如 `code == 0`、`data.accepted == true`）及最大耗时阈值 SLA。
- **高效录入与在线单次调试**：内置 **cURL 命令一键解析导入**、JSON 批量导入导出，以及编辑器内直接注入参数「发送测试」检视原始响应。

### 2. Rust + Tokio 高性能并发调度引擎 (`src-tauri/src/engine`)
- **连接池复用与纯 Rust TLS**：基于 `reqwest` + `rustls-tls`（免除 Windows / macOS OpenSSL 动态库依赖困扰），开启 `tcp_nodelay` 与高并发连接池复用。
- **O(Concurrency) 恒定内存有界派发**：采用流式懒派发器配合 `tokio::sync::Semaphore` 控制在途并发协程上限（`1 ~ 512`），即使执行十万级轮次也不会一次性膨胀内存，同时支持全局速率上限（`Max RPS`）与单协程间隔（`Interval ms`）。
- **零忙等待暂停与恢复 (`Pause & Resume`)**：通过 `tokio::sync::watch::channel<ControlSignal>` 协调调度状态，点击「暂停」后所有待发协程零 CPU 占用挂起，且内置 `ActiveStopwatch` 自动冻结暂停期间计时，确保恢复执行后的吞吐率（RPS）计算精准无偏。
- **节流遥测聚合 (`120ms` 批量推送)**：独立 Tokio Aggregator 协程实时汇总成功/失败计数、状态码分布、失败原因归类、分接口指标、P50/P90/P95/P99 分位耗时与每秒吞吐曲线，避免高频 IPC 阻塞前端渲染。

---

## 项目工程目录结构

```text
├── .github/workflows/build-desktop.yml  # macOS (.dmg) + Windows (.msi/.exe) 自动打包流水线
├── src/                                 # React + TypeScript + Tailwind + shadcn/ui 前端层
│   ├── components/
│   │   ├── ui/                          # shadcn/ui 基础无障碍组件库
│   │   ├── layout/AppSidebar.tsx        # 桌面端侧边导航与运行环境状态栏
│   │   ├── endpoints/                   # 接口管理库、多标签编辑器、cURL 导入器、单次调试台
│   │   ├── tasks/                       # 并发任务编排器、暂停/恢复控制台、实时图表、请求日志检视
│   │   └── settings/SettingsView.tsx    # 全局代理、默认并发度、主题切换与系统诊断
│   ├── lib/                             # 模板变量提取器、cURL 词法解析器、CSV/JSON 报告导出
│   ├── services/tauriClient.ts          # 强类型 Tauri IPC 通信封装（含纯浏览器开发预览兼容层）
│   ├── stores/                          # Zustand 模块化状态管理
│   ├── types/                           # 与 Rust Serde 1:1 对齐的领域类型定义
│   └── __tests__/                       # Vitest 前端核心逻辑单元测试
└── src-tauri/                           # Tauri v2 + Rust 后端层
    └── src/
        ├── commands/                    # Tauri IPC 命令控制器
        ├── engine/                      # Tokio 并发执行器、暂停恢复状态机、模板渲染、断言引擎、内置回显服务
        ├── models/                      # 强类型领域模型 (EndpointConfig, TaskConfig, TaskSnapshot)
        ├── storage/                     # 基于临时文件原子重命名的本地 JSON 持久化层
        ├── error.rs                     # 统一错误处理 (thiserror)
        └── lib.rs / main.rs             # 应用组装与 Windows 无黑框子系统配置
```

---

## 本地开发与跨平台打包指南

### 环境要求
- **Node.js** >= 20 & **pnpm** >= 9
- **Rust** >= 1.80 (`rustup`)
- **macOS**：安装 Xcode Command Line Tools (`xcode-select --install`)
- **Windows**：安装 Microsoft C++ Build Tools (Visual Studio 2022 生成工具) 与系统自带 WebView2

### 常用工程命令

```bash
# 1. 安装前端依赖
pnpm install

# 2. 启动桌面客户端开发模式（同时热更新 React 与编译运行 Rust Tauri 窗口）
pnpm tauri:dev

# 3. 运行前端类型检查与单元测试
pnpm typecheck
pnpm test

# 4. 运行 Rust 并发引擎与暂停/恢复集成测试
cd src-tauri && cargo test

# 5. 构建生产安装包（在 macOS 下产出 .dmg/.app，在 Windows 下产出 .msi 与 -setup.exe）
pnpm tauri:build
```
