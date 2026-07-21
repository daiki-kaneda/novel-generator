import { container } from '../composition/container';
import {
  CreateRevisionPlanInput,
  CreateRevisionPlanOutput,
} from '../../application/use-cases/CreateRevisionPlanUseCase';

/**
 * Step Functionsタスク: 最終承認拒否のフィードバックから改訂対象の章を決定する。
 */
export const handler = async (
  event: CreateRevisionPlanInput,
): Promise<CreateRevisionPlanOutput> => {
  return container.createRevisionPlanUseCase().execute(event);
};
