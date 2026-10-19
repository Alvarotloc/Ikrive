import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { clientConfigQuery } from '@/lib/client-config';
import { exceedsUploadLimit, uploadErrorKey, uploadSequentially } from './attachments';
import { useUploadAttachment } from './queries';

/**
 * Invoice uploads shared by the attachments dialog and the create form: drops files over the
 * server limit as they are chosen and uploads the rest one by one, with a toast per failure and
 * one for the batch. If the limit is unknown (`/config` loading or failed) nothing is filtered.
 */
export function useAttachmentUpload(vehicleId: string) {
  const { t } = useTranslation();
  const { data: config } = useQuery(clientConfigQuery);
  const upload = useUploadAttachment(vehicleId);
  const maxUploadMb = config?.maxUploadMb;

  const acceptFiles = (files: File[]) =>
    files.filter((file) => {
      if (maxUploadMb === undefined || !exceedsUploadLimit(file, maxUploadMb)) return true;
      toast.error(t('maintenance.attachments.errors.size', { name: file.name, max: maxUploadMb }));
      return false;
    });

  /** Never throws: every failure has already been reported with a toast. */
  const uploadFiles = async (recordId: string, files: File[]) => {
    const { uploaded, failures } = await uploadSequentially(files, (file) =>
      upload.mutateAsync({ recordId, file }),
    );
    for (const { file, error } of failures) {
      toast.error(t(uploadErrorKey(error, maxUploadMb), { name: file.name, max: maxUploadMb }));
    }
    if (uploaded > 0) toast.success(t('maintenance.attachments.uploaded', { count: uploaded }));
    return { uploaded, failed: failures.length };
  };

  return { maxUploadMb, acceptFiles, uploadFiles };
}
