import { container } from '../composition/container';
import { RequestApprovalInput } from '../../application/use-cases/RequestApprovalUseCase';

/**
 * Step Functionsタスク（waitForTaskToken）: taskTokenを永続化して承認待ち状態に入る。
 * このLambda自体はすぐに完了するが、Step Functions側は`SendTaskSuccess`が
 * 呼ばれるまでこのステートで待機し続ける。
 */
export const handler = async (event: RequestApprovalInput): Promise<void> => {
  await container.requestApprovalUseCase().execute(event);
};
