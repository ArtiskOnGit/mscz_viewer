import { describe, expect, it } from 'vitest';
import { fileNameOf, sharedFileName, sharedFileUrl } from './openWith';

describe('fileNameOf', () => {
  it.each([
    ['content://com.android.providers.downloads.documents/document/Toccata%20v2.mscz', 'Toccata v2.mscz'],
    ['content://com.android.externalstorage.documents/document/primary%3ADownload%2Fmedley.mscz', 'medley.mscz'],
    ['file:///storage/emulated/0/Download/unity.mscz', 'unity.mscz'],
    ['content://media/external/file/1234', '1234'],
  ])('%s → %s', (url, name) => expect(fileNameOf(url)).toBe(name));
});

describe('shared files ("Share to")', () => {
  it('turns the cache path given by the plugin into a file:// URL', () => {
    expect(sharedFileUrl('/data/user/0/io.github.artiskongit.pupitre/cache/shared_files/share-123.tmp')).toBe(
      'file:///data/user/0/io.github.artiskongit.pupitre/cache/shared_files/share-123.tmp',
    );
    expect(sharedFileUrl('/cache/a b#.tmp')).toBe('file:///cache/a%20b%23.tmp');
    expect(sharedFileUrl('content://com.google.android.gm/x/1')).toBe('content://com.google.android.gm/x/1');
  });

  it('uses the display name given by the sending app, else the URL', () => {
    expect(sharedFileName({ name: 'Toccata v2.mscz', uri: '/cache/shared_files/share-1.tmp' })).toBe('Toccata v2.mscz');
    expect(sharedFileName({ name: 'unknown', uri: '/cache/shared_files/share-1.tmp' })).toBe('share-1.tmp');
  });
});
