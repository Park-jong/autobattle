/** 데이터 검증 실패. 메시지에 위치(경로)와 원인이 들어간다. */
export class DataValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string,
  ) {
    super(path === '' ? reason : `${path}: ${reason}`);
    this.name = 'DataValidationError';
  }
}
