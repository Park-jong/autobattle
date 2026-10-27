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
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const allowed = path.resolve(root, 'agent-summaries');
  const target = path.resolve(input.cwd || root, String(toolInput.file_path || ''));

  const norm = p => process.platform === 'win32' ? p.toLowerCase() : p;
  const rel = path.relative(norm(allowed), norm(target));
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.endsWith('.md')) {
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `이 에이전트는 agent-summaries/ 안의 .md 요약 파일만 쓸 수 있습니다 (요청 경로: ${target}). 코드는 수정하지 말고 결과만 보고하세요.`
    }
  }));
});
