import { container } from '../composition/container';
import { FinalizeNovelInput, FinalizeNovelOutput } from '../../application/use-cases/FinalizeNovelUseCase';

/**
 * Step Functionsタスク: 全章を結合して最終テキストを保存し、署名付きURLをメール通知する。
 */
export const handler = async (event: FinalizeNovelInput): Promise<FinalizeNovelOutput> => {
  return container.finalizeNovelUseCase().execute(event);
};
