const fs = require('fs');
const path = require('path');

const NOTES_DIR = path.join(__dirname, 'notes-source/操作系统');
const OUTPUT_FILE = path.join(__dirname, 'data/os-notes.json');

// 需要过滤的细节关键词
const FILTER_KEYWORDS = [
  '实现思想', '优缺点', '特点', '适用场景', '具体', '细节',
  '实现过程', '原理', '区别', '联系', '对比', '比较',
  '前因', '后果', '特征', '属性', '内容与作用', '三个', '四个', '几个',
  '是否遵循', '实现细节', '图', '两者的对比', '基本概念一览',
  '组成', '定义', '目的'
];

function shouldFilter(line) {
  return FILTER_KEYWORDS.some(kw => line.includes(kw));
}

function parseNoteFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 按 ### 级别组织知识点
  const chapters = {};
  let currentH2 = null;
  let currentH3 = null;
  let currentH4List = [];

  function flushH4() {
    if (currentH3 && currentH4List.length > 0) {
      const key = `${currentH2}|||${currentH3}`;
      if (!chapters[key]) {
        chapters[key] = {
          chapter: currentH2,
          topic: currentH3,
          subtopics: []
        };
      }
      chapters[key].subtopics.push(...currentH4List);
      currentH4List = [];
    }
  }

  for (const line of lines) {
    const trimmed = line.trim();

    // ## 章节标题
    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      flushH4();
      currentH2 = trimmed.slice(3).trim();
      currentH3 = null;
      continue;
    }

    // ### 小节标题
    if (trimmed.startsWith('### ')) {
      flushH4();
      currentH3 = trimmed.slice(4).trim();
      continue;
    }

    // #### 知识点
    if (trimmed.startsWith('#### ')) {
      const topic = trimmed.slice(5).trim();
      if (!shouldFilter(topic) && topic.length > 1 && topic.length < 30) {
        currentH4List.push(topic);
      }
      continue;
    }

    // - 知识点列表项 (只取 - 一级)
    if (trimmed.startsWith('- ') && !trimmed.startsWith('- -') && !trimmed.startsWith('- 注意')) {
      const topic = trimmed.slice(2).trim();
      if (!shouldFilter(topic) &&
          topic.length > 1 &&
          topic.length < 30 &&
          !/^\d+$/.test(topic) &&
          topic !== '' &&
          !topic.startsWith('总之') &&
          !topic.startsWith('注意')) {
        currentH4List.push(topic);
      }
    }
  }

  flushH4();
  return Object.values(chapters);
}

function buildGraphData(allChapters) {
  const questions = [];

  for (const item of allChapters) {
    // 每个 ### 级别作为一个 topic
    questions.push({
      id: questions.length + 1,
      chapter: item.chapter,
      topic: item.topic,
      question: item.topic,
      answer: item.subtopics.join('、')
    });
  }

  return {
    title: '操作系统',
    subtitle: Array.from(new Set(allChapters.map(c => c.chapter))).join('·'),
    questions: questions
  };
}

// 主程序
const files = fs.readdirSync(NOTES_DIR).filter(f => f.endsWith('.md') && f !== '# 基本使用规则.md');

let allChapters = [];

for (const file of files) {
  const filePath = path.join(NOTES_DIR, file);
  const chapters = parseNoteFile(filePath);
  allChapters = allChapters.concat(chapters);
  console.log(`${file}: ${chapters.length} 个主题`);
}

console.log(`\n总共 ${allChapters.length} 个主题`);

const graphData = buildGraphData(allChapters);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(graphData, null, 2), 'utf-8');
console.log(`\n已生成: ${OUTPUT_FILE}`);

// 输出统计
const chapterStats = {};
for (const item of allChapters) {
  const key = item.chapter;
  if (!chapterStats[key]) chapterStats[key] = 0;
  chapterStats[key]++;
}
console.log('\n各章主题数量:');
for (const [ch, count] of Object.entries(chapterStats)) {
  console.log(`  ${ch}: ${count} 个`);
}
