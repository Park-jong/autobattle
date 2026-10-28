import { RunController, type RunDeps } from '../../core/run';
import type { RunStorage } from './RunStorage';

/** 이어하기 버튼에 보여줄 저장본 요약 */
export interface SaveSummary {
  seed: number;
  /** 지금 액트와 그 액트에서 도달한 최고 층 */
  act: number;
  floor: number;
  hp: number;
  maxHp: number;
  gold: number;
  commanderName: string;
  /** 테스트 런 저장본이면 true */
  test: boolean;
}

export type SaveStatus =
  | { kind: 'none' }
  | { kind: 'ok'; summary: SaveSummary }
  /** 손상되었거나 형식·버전이 맞지 않는 저장본. message는 사용자에게 보여줄 한국어 */
  | { kind: 'broken'; message: string };

export type LoadResult = { ok: true; controller: RunController } | { ok: false; message: string };

/**
 * 런 자동 저장/이어하기. 저장 문자열의 읽기·쓰기는 RunStorage에 맡기고, 이 클래스는 RunController 직렬화(serialize)와
 * 복원(restore) 검증, 같은 내용이면 다시 쓰지 않기를 맡는다. 런이 끝나면 저장을 지운다 (끝난 런은 이어하기 대상이 아니다).
 */
export class RunSaveStore {
  private lastWritten: string | null = null;

  constructor(
    private readonly storage: RunStorage,
    private readonly deps: RunDeps,
  ) {}

  /** 저장본이 있는지, 온전한지 확인한다 (복원까지 시험해 보므로 이어하기가 실패하는 일이 없다) */
  status(): SaveStatus {
    const loaded = this.load();
    if (loaded === null) return { kind: 'none' };
    if (!loaded.ok) return { kind: 'broken', message: loaded.message };
    const c = loaded.controller;
    return {
      kind: 'ok',
      summary: { seed: c.seed, act: c.act, floor: c.floorReached, hp: c.hp, maxHp: c.maxHp, gold: c.gold, commanderName: c.commander.name, test: c.testInfo !== null },
    };
  }

  /** 저장본을 복원한다. 저장본이 없으면 null */
  load(): LoadResult | null {
    const text = this.storage.read();
    if (text === null) return null;
    try {
      const controller = RunController.restore(this.deps, JSON.parse(text) as unknown);
      this.lastWritten = text;
      return { ok: true, controller };
    } catch (e) {
      const detail = e instanceof SyntaxError ? '저장 데이터가 올바른 JSON이 아닙니다.' : e instanceof Error ? e.message : String(e);
      return { ok: false, message: `저장 데이터를 불러올 수 없습니다: ${detail}` };
    }
  }

  /** 현재 상태를 저장한다. 끝난 런이면 저장을 지운다. 실패 사유(없으면 null) 반환 */
  save(controller: RunController): string | null {
    if (controller.phase === 'ended') {
      this.clear();
      return null;
    }
    const text = JSON.stringify(controller.serialize());
    if (text === this.lastWritten) return null;
    const error = this.storage.write(text);
    if (error === null) this.lastWritten = text;
    return error;
  }

  clear(): void {
    this.storage.remove();
    this.lastWritten = null;
  }
}
