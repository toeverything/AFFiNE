import { DataCenter } from '@affine/datacenter';
import { toast } from '@/ui/toast';
import { useModal } from '@/providers/GlobalModalProvider';

const getErrorResponseBody = (
  response: Response
): Promise<{ message: string }> => {
  return new Promise(resolve => {
    response.json().then(data => {
      resolve(data);
    });
  });
};
export const useErrorHandler = (dataCenter: DataCenter) => {
  const { triggerLoginModal } = useModal();

  if (!dataCenter) return;

  dataCenter.on('error', async error => {
    const { response } = error;
    const { status } = response;
    const data = await getErrorResponseBody(response);

    switch (status) {
      case 401:
        // TODO: popup login modal
        triggerLoginModal();
        break;
      default:
        toast(`${status}: ${data.message}`);
    }
  });
};
