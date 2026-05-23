# 知识点问答系统

一个通用的卡片式问答系统，支持加载外部题目数据集，适用于各种知识点的复习与自测。

## 功能

- 卡片式问答：查看问题 → 自行回忆 → 点击显示答案核对
- 多数据集支持：通过下拉菜单或 URL 参数切换不同题库
- 进度追踪：进度条 + 已掌握 / 待复习计数
- 导航切换：上一题、下一题、随机跳转
- 键盘快捷键：
  - `空格` / `回车` — 显示答案
  - `←` `→` — 切换题目
- 数据持久化：自动记住上次使用的题库

## 快速开始

项目为纯静态页面，使用任意 HTTP 服务器启动即可：

```bash
cd quiz-system
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`

## URL 参数

| 参数 | 示例 | 说明 |
|------|------|------|
| `?file=` | `?file=data/custom.json` | 直接加载指定文件 |
| `?set=`  | `?set=ds-stack-queue` | 按数据集 ID 加载 |

## 项目结构

```
quiz-system/
├── index.html          # 主页面
├── style.css           # 样式
├── app.js              # 逻辑（支持多数据集）
├── datasets.json       # 数据集清单
├── data/               # 题库目录
│   ├── ds-stack-queue.json   # 408 数据结构·栈队列数组
│   └── demo-english.json     # 考研英语·高频词汇（示例）
├── data.json           # 旧版数据（向后兼容）
├── server.py           # 简易局域网服务器
└── README.md
```

## 如何添加自己的题库

1. 在 `data/` 目录下新建 JSON 文件，格式如下：

```json
{
  "title": "科目名称",
  "subtitle": "副标题（可选）",
  "questions": [
    {
      "id": 1,
      "topic": "章节/主题",
      "question": "问题内容",
      "answer": "答案内容（支持 Markdown 风格格式）"
    }
  ]
}
```

2. 在 `datasets.json` 中添加条目：

```json
{
  "id": "my-quiz",
  "file": "data/my-quiz.json",
  "title": "我的题库",
  "subject": "分类名称",
  "description": "简短描述"
}
```

3. 刷新页面，在下拉菜单中即可选择新题库。

### 简易方式

如果只想快速测试一个文件，直接用 URL 参数即可：

```
http://localhost:8080/?file=data/你的文件.json
```

此时无需修改 `datasets.json`，文件格式同上（支持带 metadata 的对象格式或旧版纯数组格式）。

## 数据格式

### 新版（推荐）
```json
{
  "title": "标题",
  "subtitle": "副标题",
  "questions": [
    { "id": 1, "topic": "主题", "question": "?", "answer": "!" }
  ]
}
```

### 旧版（兼容）
```json
[
  { "id": 1, "topic": "主题", "question": "?", "answer": "!" }
]
```

答案支持：
- `- ` 开头 → 无序列表
- `数字. ` 开头 → 有序列表
- ` ``` ` 包裹 → 代码块
- 普通文本 → 段落
