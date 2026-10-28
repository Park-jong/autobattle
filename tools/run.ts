/**
 * 헤드리스 자동 런 도구: 단순 정책으로 1액트(13층)를 끝까지 진행해 결과를 출력한다.
 *
 *   npm run run -- --seed 1 --n 20
 *   npm run run -- --seed 1 --n 20 --path random --plan tools/plans/harten-basic.json
 *   npm run run -- --seed 5 --n 1 --verbose --no-cards
 *
 * i번째 런의 시드는 (seed + i). 각 런은 보스 처치(승리) 또는 지휘관 HP 0(사망)으로 끝난다.
 *
 * 옵션
 *   --seed N        시작 시드 (기본 1)
 *   --n N           런 횟수 (기본 20)
 *   --path first|random   맵 경로 선택 (기본 first)
 *   --plan 파일     전투 중 카드 사용 계획 (기본 tools/plans/harten-basic.json)
 *   --no-cards      카드를 쓰지 않는다
 *   --commander ID  지휘관 (기본 cmd_harten)
 *   --deck starter|test   덱 프리셋 (기본 starter)
 *   --verbose       런마다 한 줄씩 출력
 *
 * 정책(밸런스 확인용): 보드를 채우고 가장 싼 유닛을 구매, 인구가 차고 골드가 넉넉하면 경험치 구매, 카드 보상은 첫 장,
 * 이벤트는 선택 가능한 첫 선택지, 야영지는 HP 50% 미만이면 휴식 아니면 카드 강화.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCardPlan, type PlanEntry } from '../src/core/combat';
import { AutoRunner, loadRunDeps, RunController, type AutoRunSummary } from '../src/core/run';

interface Args {
  seed: number;
  n: number;
  path: 'first' | 'random';
  plan: string | null;
  commander: string;
  deck: 'starter' | 'test';
  verbose: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(['verbose', 'no-cards']);
  const options = new Set(['seed', 'n', 'path', 'plan', 'commander', 'deck']);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith('--')) throw new Error(`인자 형식 오류: ${key ?? ''}`);
    const name = key.slice(2);
    if (flags.has(name)) {
      values.set(name, 'true');
      continue;
    }
    if (!options.has(name)) throw new Error(`알 수 없는 옵션: --${name}`);
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${name}에 값이 필요함`);
    values.set(name, value);
  }
  const seed = Number(values.get('seed') ?? '1');
  const n = Number(values.get('n') ?? '20');
  if (!Number.isInteger(seed)) throw new Error('--seed는 정수여야 함');
  if (!Number.isInteger(n) || n < 1) throw new Error('--n은 1 이상의 정수여야 함');
  const path = values.get('path') ?? 'first';
  if (path !== 'first' && path !== 'random') throw new Error('--path는 first 또는 random이어야 함');
  const deck = values.get('deck') ?? 'starter';
  if (deck !== 'starter' && deck !== 'test') throw new Error('--deck은 starter 또는 test여야 함');
  return {
    seed, n, path, deck, verbose: values.has('verbose'),
    plan: values.has('no-cards') ? null : (values.get('plan') ?? 'tools/plans/harten-basic.json'),
    commander: values.get('commander') ?? 'cmd_harten',
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = new URL('../data/', import.meta.url);
  const read = (name: string) => readJson(fileURLToPath(new URL(name, dataDir)));
  const deps = loadRunDeps({
    traits: read('traits.json'), units: read('units.json'), cards: read('cards.json'),
    commanders: read('commanders.json'), encounters: read('encounters.json'), events: read('events.json'),
  });
  const plan: PlanEntry[] | null = args.plan ? parseCardPlan(readJson(resolve(args.plan)), '계획') : null;

  const results: AutoRunSummary[] = [];
  for (let i = 0; i < args.n; i++) {
    const seed = args.seed + i;
    const controller = RunController.create(deps, { seed, commanderId: args.commander, deckPreset: args.deck });
    const summary = new AutoRunner(controller, deps.cards, deps.units, { pathMode: args.path, policySeed: seed, plan }).run();
    results.push(summary);
    if (args.verbose) {
      const where = summary.diedAt ? ` 사망 ${summary.diedAt.nodeId}(${summary.diedAt.type})` : '';
      console.log(
        `시드 ${seed}: ${summary.outcome === 'victory' ? '승리' : '사망'} 도달 ${summary.floorReached}층 ` +
          `HP ${summary.hp}/${summary.maxHp} 골드 ${summary.gold} 전투 ${summary.battles}회(승 ${summary.wins}/패 ${summary.losses + summary.draws}) ` +
          `평균 ${summary.averageBattleSeconds.toFixed(1)}초${where}`,
      );
    }
  }

  const victories = results.filter((r) => r.outcome === 'victory').length;
  const avg = (pick: (r: AutoRunSummary) => number): number => results.reduce((sum, r) => sum + pick(r), 0) / results.length;
  const battles = results.reduce((sum, r) => sum + r.battles, 0);
  const battleSeconds = results.reduce((sum, r) => sum + r.averageBattleSeconds * r.battles, 0);
  console.log(`지휘관 ${args.commander}, ${args.deck === 'test' ? '확장 테스트' : '기본'} 덱, 경로 ${args.path}, 카드 ${plan ? args.plan : '사용 안 함'}`);
  console.log(`런 ${args.n}회, 시드 ${args.seed}~${args.seed + args.n - 1}`);
  console.log(`승리 ${victories} (${((victories / args.n) * 100).toFixed(1)}%), 사망 ${args.n - victories}`);
  console.log(`평균 도달 층 ${avg((r) => r.floorReached).toFixed(1)}, 평균 남은 HP ${avg((r) => r.hp).toFixed(1)}, 평균 전투 ${avg((r) => r.battles).toFixed(1)}회`);
  console.log(`전투 평균 시간 ${(battles === 0 ? 0 : battleSeconds / battles).toFixed(1)}초`);
  const deaths = new Map<number, number>();
  for (const r of results) if (r.diedAt) deaths.set(r.diedAt.floor, (deaths.get(r.diedAt.floor) ?? 0) + 1);
  if (deaths.size > 0) {
    console.log(`사망 층 분포: ${[...deaths].sort((a, b) => a[0] - b[0]).map(([floor, count]) => `${floor}층 ${count}`).join(', ')}`);
  }
}

try {
  main();
} catch (e) {
  console.error(`오류: ${(e as Error).message}`);
  process.exitCode = 1;
}
