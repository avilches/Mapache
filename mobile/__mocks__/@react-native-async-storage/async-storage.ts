// In-memory AsyncStorage mock
// Store data in a global so it survives jest.resetModules() calls
const GLOBAL_KEY = '__MOCK_ASYNC_STORAGE__';
if (!(global as any)[GLOBAL_KEY]) (global as any)[GLOBAL_KEY] = {};
const store: Record<string, string> = (global as any)[GLOBAL_KEY];

const AsyncStorage = {
  getItem: jest.fn(async (key: string): Promise<string | null> => {
    return store[key] ?? null;
  }),
  setItem: jest.fn(async (key: string, value: string): Promise<void> => {
    store[key] = value;
  }),
  removeItem: jest.fn(async (key: string): Promise<void> => {
    delete store[key];
  }),
  clear: jest.fn(async (): Promise<void> => {
    Object.keys(store).forEach(k => delete store[k]);
  }),
  getAllKeys: jest.fn(async (): Promise<string[]> => Object.keys(store)),
  _store: store,
};

export default AsyncStorage;
