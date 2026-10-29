/**
 * 헤드리스 전투 시뮬 도구: 편성 A vs 편성 B를 N회 돌려 승률과 평균 전투 시간을 출력한다.
 *
 *   npm run sim -- --a tools/formations/a.json --b tools/formations/b.json --n 1000 --seed 1
 *   npm run sim -- --a ... --b ... --commander cmd_harten
 *   npm run sim -- --a ... --b ... --commander cmd_harten --plan tools/plans/harten-basic.json
 *
 * A는 아군(side 0, 열 0~3), B는 적(side 1, 열 4~7). i번째 판의 시드는 (seed + i).
 *
 * --commander: 지휘관 id (data/commanders.json). 패시브가 적용되고, 시작 덱을 시드로 섞어 5장을 뽑은 상태로 시작한다.
 *              카드를 쓰지 않는 "기준" 결과가 함께 출력된다.
 * --plan: 카드 사용 계획 JSON (형식은 src/core/combat/cardPlan.ts). --commander가 필요하다.
 *         같은 시드·덱으로 기준(카드 없음)과 계획 적용 결과를 나란히 비교한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Deck, assertCardUnitReferences, startingDeckSpecs, type DeckPreset } from '../src/core/cards';
import {
  CardPlanRunner,
  CombatSimulator,
  parseCardPlan,
  parseFormation,
  type CombatResult,
  type Formation,
  type PlanEntry,
  type PlanStats,
} from '../src/core/combat';
import {
  loadCards,
  loadCommanders,
  loadTraits,
  loadUnits,
  type CardCatalog,
  type CommanderDef,
  type TraitCatalog,
  type UnitCatalog,
} from '../src/core/data';
import { Rng } from '../src/core/rng';

interface Args {
  a: string;
  b: string;
  n: number;
  seed: number;
  commander?: string;
  plan?: string;
  deckPreset: DeckPreset;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) {
      throw new Error(
        `인자 형식 오류: ${key ?? ''} (예: --a a.json --b b.json --n 1000 --seed 1 [--commander cmd_harten] [--plan plan.json])`,
      );
    }
    values.set(key.slice(2), value);
  }
  const a = values.get('a');
  const b = values.get('b');
  if (!a || !b) throw new Error('--a 와 --b 편성 파일이 필요함');
  const n = Number(values.get('n') ?? '100');
  const seed = Number(values.get('seed') ?? '1');
  if (!Number.isInteger(n) || n < 1) throw new Error(`--n은 1 이상의 정수여야 함 (실제: ${values.get('n')})`);
  if (!Number.isInteger(seed)) throw new Error(`--seed는 정수여야 함 (실제: ${values.get('seed')})`);
  const commander = values.get('commander');
  const plan = values.get('plan');
  const deckPreset = values.get('deck') ?? 'starter';
  if (deckPreset !== 'starter' && deckPreset !== 'test') throw new Error('--deck은 starter 또는 test여야 함');
  if (deckPreset === 'test' && !commander) throw new Error('--deck test를 쓰려면 --commander도 필요함');
  if (plan && !commander) throw new Error('--plan을 쓰려면 --commander도 필요함 (카드 덱은 지휘관의 시작 덱)');
  return { a, b, n, seed, deckPreset, ...(commander ? { commander } : {}), ...(plan ? { plan } : {}) };
}

function loadFormation(path: string, label: string): Formation {
  return parseFormation(readJson(resolve(path)), label);
}

function percent(count: number, total: number): string {
  return `${((count / total) * 100).toFixed(1)}%`;
}

/** 여러 판의 승패·시간 집계 */
class Tally {
  winsA = 0;
  winsB = 0;
  draws = 0;
  totalTime = 0;
  games = 0;

  add(result: CombatResult): void {
    if (result.winner === 0) this.winsA++;
    else if (result.winner === 1) this.winsB++;
    else this.draws++;
    this.totalTime += result.endTime;
    this.games++;
  }

  print(indent = ''): void {
    console.log(`${indent}A 승 ${this.winsA} (${percent(this.winsA, this.games)})`);
    console.log(`${indent}B 승 ${this.winsB} (${percent(this.winsB, this.games)})`);
    console.log(`${indent}무승부 ${this.draws} (${percent(this.draws, this.games)})`);
    console.log(`${indent}평균 전투 시간 ${(this.totalTime / this.games).toFixed(1)}초`);
  }
}

/** 데이터 파일을 읽어 검증한 결과 */
interface GameData {
  traits: TraitCatalog;
  units: UnitCatalog;
  cards: CardCatalog;
  commanders: ReturnType<typeof loadCommanders>;
}

function loadGameData(): GameData {
  const dataDir = new URL('../data/', import.meta.url);
  const read = (name: string) => readJson(fileURLToPath(new URL(name, dataDir)));
  const traits = loadTraits(read('traits.json'));
  const units = loadUnits(read('units.json'), traits);
  const cards = loadCards(read('cards.json'), traits);
  assertCardUnitReferences(cards, units);
  const commanders = loadCommanders(read('commanders.json'), cards, units);
  return { traits, units, cards, commanders };
}

/** 카드 없는 기존 방식 (M1 호환 출력) */
function runLegacy(args: Args, data: GameData, a: Formation, b: Formation): void {
  const tally = new Tally();
  for (let i = 0; i < args.n; i++) {
    tally.add(new CombatSimulator({ seed: args.seed + i, formations: [a, b] }, data.units, data.traits).run());
  }
  console.log(`A: ${args.a} (${a.length}기)  vs  B: ${args.b} (${b.length}기)`);
  console.log(`판 수 ${args.n}, 시드 ${args.seed}~${args.seed + args.n - 1}`);
  tally.print();
}

/** 지휘관 + (선택) 카드 계획. 같은 시드·덱으로 기준(카드 없음)과 계획 적용을 비교 */
function runWithCommander(args: Args, data: GameData, a: Formation, b: Formation, commander: CommanderDef): void {
  const plan: PlanEntry[] | null = args.plan ? parseCardPlan(readJson(resolve(args.plan)), '계획') : null;
  const baseline = new Tally();
  const planned = new Tally();
  let played = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};

  const makeSim = (i: number): CombatSimulator => {
    const seed = args.seed + i;
    const deck = Deck.create(startingDeckSpecs(commander, args.deckPreset), data.cards, new Rng(seed));
    deck.drawOpeningHand();
    return new CombatSimulator(
      { seed, formations: [a, b], cards: { commander, deck: deck.serialize() } },
      data.units,
      data.traits,
      data.cards,
    );
  };

  for (let i = 0; i < args.n; i++) {
    baseline.add(makeSim(i).run());
    if (plan) {
      const { result, stats } = new CardPlanRunner(makeSim(i), data.cards, plan).run();
      planned.add(result);
      accumulate(stats);
    }
  }

  function accumulate(stats: PlanStats): void {
    played += stats.played;
    failed += stats.failed;
    for (const [reason, count] of Object.entries(stats.failureReasons)) reasons[reason] = (reasons[reason] ?? 0) + count;
  }

  console.log(`A: ${args.a} (${a.length}기)  vs  B: ${args.b} (${b.length}기)`);
  console.log(`지휘관 ${commander.id} (${commander.passive.name}), ${args.deckPreset === 'test' ? '확장 카드 테스트' : '시작'} 덱 ${startingDeckSpecs(commander, args.deckPreset).length}장`);
  console.log(`판 수 ${args.n}, 시드 ${args.seed}~${args.seed + args.n - 1}`);
  console.log('[기준] 지휘관 패시브만, 카드 사용 없음');
  baseline.print('  ');
  if (!plan) return;

  console.log(`[계획] ${args.plan}`);
  planned.print('  ');
  console.log(`  카드 사용 성공 ${played}회 (판당 ${(played / args.n).toFixed(2)}), 실패 ${failed}회 (판당 ${(failed / args.n).toFixed(2)})`);
  for (const [reason, count] of Object.entries(reasons).sort((x, y) => y[1] - x[1])) {
    console.log(`    실패 사유: ${reason} x${count}`);
  }
  const diff = (planned.winsA - baseline.winsA) / args.n;
  console.log(`[비교] A 승률 ${percent(baseline.winsA, args.n)} -> ${percent(planned.winsA, args.n)} (${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%p)`);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const data = loadGameData();
  const a = loadFormation(args.a, 'A');
  const b = loadFormation(args.b, 'B');

  if (!args.commander) return runLegacy(args, data, a, b);
  const commander = data.commanders.get(args.commander);
  if (!commander) {
    throw new Error(`알 수 없는 지휘관 "${args.commander}" (있는 지휘관: ${data.commanders.commanders.map((c) => c.id).join(', ')})`);
  }
  runWithCommander(args, data, a, b, commander);
}

try {
  main();
} catch (e) {
  console.error(`오류: ${(e as Error).message}`);
  process.exitCode = 1;
}
