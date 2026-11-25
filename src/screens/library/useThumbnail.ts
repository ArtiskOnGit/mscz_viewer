import { useEffect, useState } from 'react';
import { libraryRepository } from '../../core/services';

/** Object URL of the score's thumbnail (revoked on unmount). */
export function useThumbnail(scoreId: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    void libraryRepository.readThumbnail(scoreId).then((bytes) => {
      if (cancelled || !bytes) return;
      objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/png' }));
      setUrl(objectUrl);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scoreId]);
  return url;
}
