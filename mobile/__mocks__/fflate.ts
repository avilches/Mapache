// Mock for fflate — returns pre-seeded data when unzipSync is called

// Tests can override this via mockUnzipResult before calling the function
export let mockUnzipResult: Record<string, Uint8Array> = {};

export const unzipSync = jest.fn((_data: Uint8Array): Record<string, Uint8Array> => {
  return mockUnzipResult;
});

export const zipSync = jest.fn((_data: Record<string, Uint8Array>) => new Uint8Array());

export const strToU8 = jest.fn((str: string) => new TextEncoder().encode(str));
export const strFromU8 = jest.fn((data: Uint8Array) => new TextDecoder().decode(data));
