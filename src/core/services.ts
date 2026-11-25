// Application-wide singletons.
import { CapacitorFileStore } from './storage/fileStore';
import { LibraryRepository } from './storage/libraryRepository';
import { ViewStateRepository } from './storage/viewStateRepository';
import { SetlistRepository } from './storage/setlistRepository';

const fileStore = new CapacitorFileStore();
export const libraryRepository = new LibraryRepository(fileStore);
export const viewStateRepository = new ViewStateRepository(fileStore);
export const setlistRepository = new SetlistRepository(fileStore);
