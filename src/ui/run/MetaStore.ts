import type { MetaCatalog } from '../../core/data';
import { MetaProgress } from '../../core/meta';
import type { RunStorage } from './RunStorage';

export type MetaStatus =
  | { kind: 'ok'; progress: MetaProgress }
  /** 손상되었거나 형식·버전이 맞지 않는 저장본. message는 사용자에게 보여줄 한국어 */
  | { kind: 'broken'; message: string };

/**
 * 메타 진행(전공 포인트·해금) 저장소. 런 저장(RunSaveStore)과 별개의 키를 쓰며, 문자열 읽기·쓰기는 RunStorage에 맡긴다.
 * 생성할 때 한 번 읽어 MetaProgress를 메모리에 들고 있고, 구매·정산 뒤에 호출자가 save()로 저장한다.
 * 저장본이 손상되었으면 덮어쓰지 않고 broken으로 두며, reset()으로만 새 기록을 시작할 수 있다.
 */
export class MetaStore {
  private current: MetaStatus;

  constructor(
    private readonly storage: RunStorage,
    readonly catalog: MetaCatalog,
  ) {
    this.current = this.load();
  }

  status(): MetaStatus {
    return this.current;
  }

  /** 정상일 때의 진행 상태 (손상이면 null) */
  get progress(): MetaProgress | null {
    return this.current.kind === 'ok' ? this.current.progress : null;
  }

  /** 현재 상태를 저장한다. 실패 사유(없으면 null) 반환. 손상 상태에서는 아무것도 쓰지 않는다 */
  save(): string | null {
    if (this.current.kind !== 'ok') return '전공 기록이 손상되어 저장하지 않았습니다.';
    return this.storage.write(JSON.stringify(this.current.progress.serialize()));
  }

  /** 전공 기록을 지우고 처음 상태로 되돌린다 (런 저장본은 건드리지 않는다) */
  reset(): void {
    this.storage.remove();
    this.current = { kind: 'ok', progress: new MetaProgress(this.catalog) };
  }

  private load(): MetaStatus {
    const text = this.storage.read();
    if (text === null) return { kind: 'ok', progress: new MetaProgress(this.catalog) };
    try {
      return { kind: 'ok', progress: MetaProgress.restore(this.catalog, JSON.parse(text) as unknown) };
    } catch (e) {
      const detail = e instanceof SyntaxError ? '저장 데이터가 올바른 JSON이 아닙니다.' : e instanceof Error ? e.message : String(e);
      return { kind: 'broken', message: `전공 기록을 불러올 수 없습니다: ${detail}` };
    }
  }
}
