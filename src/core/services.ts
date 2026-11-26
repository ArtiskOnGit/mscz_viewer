// Application-wide singletons.
import { Directory } from '@capacitor/filesystem';
import { CapacitorFileStore } from './storage/fileStore';
import { RenderCache } from './render/renderCache';
import { LibraryRepository } from './storage/libraryRepository';
import { ViewStateRepository } from './storage/viewStateRepository';
import { SetlistRepository } from './storage/setlistRepository';

const fileStore = new CapacitorFileStore();
export const libraryRepository = new LibraryRepository(fileStore);
export const viewStateRepository = new ViewStateRepository(fileStore);
export const setlistRepository = new SetlistRepository(fileStore);

/** Rendered pages kept on disk (ADR-025), in the app cache directory. */
export const renderCache = new RenderCache(new CapacitorFileStore(Directory.Cache));
if (typeof document !== 'undefined') {
  // Save the cache index when the app goes to the background (Android may kill it there).
  document.addEventListener('visibilitychange', () => document.hidden && void renderCache.flush().catch(() => undefined));
}
