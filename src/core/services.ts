// Application-wide singletons.
import { CapacitorFileStore } from './storage/fileStore';
import { LibraryRepository } from './storage/libraryRepository';
import { ViewStateRepository } from './storage/viewStateRepository';

const fileStore = new CapacitorFileStore();
export const libraryRepository = new LibraryRepository(fileStore);
export const viewStateRepository = new ViewStateRepository(fileStore);
