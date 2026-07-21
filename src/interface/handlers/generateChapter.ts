import { container } from '../composition/container';
import { GenerateChapterInput } from '../../application/use-cases/GenerateChapterUseCase';

/**
 * Step FunctionsのMap（章生成/改訂ループ）タスク: 指定された1章の本文を生成する。
 */
export const handler = async (event: GenerateChapterInput): Promise<void> => {
  await container.generateChapterUseCase().execute(event);
};
