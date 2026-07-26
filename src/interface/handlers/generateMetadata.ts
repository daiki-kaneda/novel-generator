import { container } from '../composition/container';
import {
  GenerateMetadataInput,
  GenerateMetadataOutput,
} from '../../application/use-cases/GenerateMetadataUseCase';

/**
 * Step Functionsタスク: 物語設定書（メタデータ）を生成（またはフィードバックに基づき再生成）する。
 */
export const handler = async (event: GenerateMetadataInput): Promise<GenerateMetadataOutput> => {
  return container.generateMetadataUseCase().execute(event);
};
