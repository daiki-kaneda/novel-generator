import { container } from '../composition/container';
import { GeneratePlanInput, GeneratePlanOutput } from '../../application/use-cases/GeneratePlanUseCase';

/**
 * Step Functionsタスク: プランを生成（またはフィードバックに基づき再生成）する。
 */
export const handler = async (event: GeneratePlanInput): Promise<GeneratePlanOutput> => {
  return container.generatePlanUseCase().execute(event);
};
