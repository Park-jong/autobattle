/**
 * 헤드리스 자동 런 도구: 단순 정책으로 런(기본 3액트, 액트당 13층)을 끝까지 진행해 결과를 출력한다.
 *
 *   npm run run -- --seed 1 --n 20
 *   npm run run -- --seed 1 --n 20 --path random --plan tools/plans/harten-basic.json
 *   npm run run -- --seed 5 --n 1 --verbose --no-cards
 *
 * i번째 런의 시드는 (seed + i). 각 런은 마지막 액트의 보스 처치(승리) 또는 지휘관 HP 0(사망)으로 끝난다.
 *
 * 옵션
 *   --seed N        시작 시드 (기본 1)
 *   --n N           런 횟수 (기본 20)
 *   --path first|random   맵 경로 선택 (기본 first)
 *   --plan 파일     전투 중 카드 사용 계획 (기본: 지휘관별 tools/plans/<harten|isera|nox>-basic.json)
 *   --no-cards      카드를 쓰지 않는다
 *   --no-relics     유물 정책을 끈다 (정예 보상·상점·이벤트에서 유물을 얻지 않는다)
 *   --no-ultimate   궁극기를 쓰지 않는다 (끄면 M4 이전과 같은 결과)
 *   --commander ID  지휘관 (기본 cmd_harten)
 *   --deck starter|test   덱 프리셋 (기본 starter)
 *   --acts N        액트 수 1~3 (기본 3). 1이면 액트 1 보스 처치가 승리이고 출력 형식도 3액트 이전과 같다
 *   --verbose       런마다 한 줄씩 출력
 *
 * 정책(밸런스 확인용): 보드를 채우고 가장 싼 유닛을 구매, 인구가 차고 골드가 넉넉하면 경험치 구매, 카드 보상은 첫 장,
 * 이벤트는 선택 가능한 첫 선택지, 야영지는 HP 50% 미만이면 휴식 아니면 카드 강화.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCardPlan, type PlanEntry } from '../src/core/combat';
import { AutoRunner, loadRunDeps, RUN, RunController, type AutoRunSummary } from '../src/core/run';

interface Args {
  seed: number;
  n: number;
  path: 'first' | 'random';
  plan: string | null;
  commander: string;
  deck: 'starter' | 'test';
  acts: number;
  verbose: boolean;
  relics: boolean;
  ultimate: boolean;
}

/** 지휘관별 기본 카드 사용 계획 파일 (모르는 지휘관은 하르텐 계획) */
function defaultPlan(commander: string): string {
  const name = commander === 'cmd_isera' ? 'isera' : commander === 'cmd_nox' ? 'nox' : 'harten';
  return `tools/plans/${name}-basic.json`;
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(['verbose', 'no-cards', 'no-relics', 'no-ultimate']);
  const options = new Set(['seed', 'n', 'path', 'plan', 'commander', 'deck', 'acts']);
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
  const commander = values.get('commander') ?? 'cmd_harten';
  const acts = Number(values.get('acts') ?? '3');
  if (!Number.isInteger(acts) || acts < 1 || acts > 3) throw new Error('--acts는 1~3의 정수여야 함');
  return {
    seed, n, path, deck, acts, verbose: values.has('verbose'),
    plan: values.has('no-cards') ? null : (values.get('plan') ?? defaultPlan(commander)),
    commander,
    relics: !values.has('no-relics'),
    ultimate: !values.has('no-ultimate'),
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
    commanders: read('commanders.json'), encounters: read('encounters.json'), events: read('events.json'), relics: read('relics.json'),
  });
  const plan: PlanEntry[] | null = args.plan ? parseCardPlan(readJson(resolve(args.plan)), '계획') : null;

  const results: AutoRunSummary[] = [];
  for (let i = 0; i < args.n; i++) {
    const seed = args.seed + i;
    const controller = RunController.create(deps, { seed, commanderId: args.commander, deckPreset: args.deck, acts: args.acts });
    const summary = new AutoRunner(controller, deps.cards, deps.units, { pathMode: args.path, policySeed: seed, plan, relics: args.relics, ultimate: args.ultimate }).run();
    results.push(summary);
    if (args.verbose) {
      const where = summary.diedAt ? ` 사망 ${summary.diedAt.nodeId}(${summary.diedAt.type})` : '';
      const reached = args.acts > 1 ? `액트 ${summary.act} ${summary.floorReached}층` : `${summary.floorReached}층`;
      console.log(
        `시드 ${seed}: ${summary.outcome === 'victory' ? '승리' : '사망'} 도달 ${reached} ` +
          `HP ${summary.hp}/${summary.maxHp} 골드 ${summary.gold} 전투 ${summary.battles}회(승 ${summary.wins}/패 ${summary.losses + summary.draws}) ` +
          `평균 ${summary.averageBattleSeconds.toFixed(1)}초${where}`,
      );
    }
  }

  const victories = results.filter((r) => r.outcome === 'victory').length;
  const avg = (pick: (r: AutoRunSummary) => number): number => results.reduce((sum, r) => sum + pick(r), 0) / results.length;
  const battles = results.reduce((sum, r) => sum + r.battles, 0);
  const battleSeconds = results.reduce((sum, r) => sum + r.averageBattleSeconds * r.battles, 0);
  console.log(`지휘관 ${args.commander}, ${args.deck === 'test' ? '확장 테스트' : '기본'} 덱, 경로 ${args.path}, 카드 ${plan ? args.plan : '사용 안 함'}${args.acts > 1 ? `, 액트 ${args.acts}` : ''}`);
  if (args.relics || args.ultimate) {
    const relicCount = results.reduce((sum, r) => sum + r.relics, 0) / results.length;
    console.log(`정책: 유물 ${args.relics ? '사용' : '끔'}, 궁극기 ${args.ultimate ? '사용' : '끔'}` +
      ` (평균 유물 ${relicCount.toFixed(1)}개, 궁극기 사용 ${(results.reduce((sum, r) => sum + r.ultimatesUsed, 0) / results.length).toFixed(1)}회/런)`);
  }
  console.log(`런 ${args.n}회, 시드 ${args.seed}~${args.seed + args.n - 1}`);
  console.log(`승리 ${victories} (${((victories / args.n) * 100).toFixed(1)}%), 사망 ${args.n - victories}`);
  if (args.acts > 1) {
    const perAct = Array.from({ length: args.acts }, (_, i) => results.filter((r) => r.act >= i + 1).length);
    console.log(`액트별 도달: ${perAct.map((count, i) => `액트${i + 1} ${count}`).join(' / ')} / 클리어 ${victories}`);
    console.log(`평균 도달 액트 ${avg((r) => r.act).toFixed(1)}, 평균 도달 층(전체 기준) ${avg((r) => r.totalFloorReached).toFixed(1)}, 평균 남은 HP ${avg((r) => r.hp).toFixed(1)}, 평균 전투 ${avg((r) => r.battles).toFixed(1)}회`);
  } else console.log(`평균 도달 층 ${avg((r) => r.floorReached).toFixed(1)}, 평균 남은 HP ${avg((r) => r.hp).toFixed(1)}, 평균 전투 ${avg((r) => r.battles).toFixed(1)}회`);
  console.log(`전투 평균 시간 ${(battles === 0 ? 0 : battleSeconds / battles).toFixed(1)}초`);
  const deaths = new Map<number, number>();
  const deathKey = (act: number, floor: number): number => (act - 1) * RUN.MAP.FLOORS + floor;
  for (const r of results) if (r.diedAt) deaths.set(deathKey(r.diedAt.act, r.diedAt.floor), (deaths.get(deathKey(r.diedAt.act, r.diedAt.floor)) ?? 0) + 1);
  if (deaths.size > 0) {
    const label = (key: number): string => (args.acts > 1 ? `${Math.ceil(key / RUN.MAP.FLOORS)}액트 ${(key - 1) % RUN.MAP.FLOORS + 1}층` : `${key}층`);
    console.log(`사망 층 분포: ${[...deaths].sort((a, b) => a[0] - b[0]).map(([key, count]) => `${label(key)} ${count}`).join(', ')}`);
  }
}

try {
  main();
} catch (e) {
  console.error(`오류: ${(e as Error).message}`);
  process.exitCode = 1;
}
