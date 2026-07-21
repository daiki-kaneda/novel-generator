/** 指定されたリソース（物語・プラン・章など）が存在しない場合のエラー。 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** 入力値やワークフロー状態が不正なため処理を継続できない場合のエラー。 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
