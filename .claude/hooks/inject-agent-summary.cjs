const fs = require('fs');
const path = require('path');

let data = '';
process.stdin.on('data', c => data += c);
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch (e) {
    process.exit(0);
  }
  const toolInput = input.tool_input || {};
  if (typeof toolInput.prompt !== 'string' || toolInput.prompt.includes('agent-summaries/')) {
    return;
  }

  const dir = path.join(process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(), 'agent-summaries');
  let last = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      const m = /^(\d+)-/.exec(name);
      if (m) last = Math.max(last, parseInt(m[1], 10));
    }
  } catch (e) {}
  const seq = String(last + 1).padStart(2, '0');
  const role = (toolInput.subagent_type || 'agent').toLowerCase();
  const slug = (toolInput.description || 'task')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50)
    .replace(/-+$/, '') || 'task';
  const filename = `agent-summaries/${seq}-${slug}-${role}.md`;

  const note = `\n\n---\n작업 완료 후, 무엇을 했는지와 주요 변경/발견 사항을 요약해서 저장소 루트의 ${filename} 파일로 (경로/파일명 그대로, 다르게 바꾸지 말고) 작성해줘.`;
  const updatedInput = Object.assign({}, toolInput, { prompt: toolInput.prompt + note });
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput
    }
  }));
});
