import { describe, expect, it } from 'vitest';
import { fileNameOf } from './openWith';

describe('fileNameOf', () => {
  it.each([
    ['content://com.android.providers.downloads.documents/document/Toccata%20v2.mscz', 'Toccata v2.mscz'],
    ['content://com.android.externalstorage.documents/document/primary%3ADownload%2Fmedley.mscz', 'medley.mscz'],
    ['file:///storage/emulated/0/Download/unity.mscz', 'unity.mscz'],
    ['content://media/external/file/1234', '1234'],
  ])('%s → %s', (url, name) => expect(fileNameOf(url)).toBe(name));
});
