// Mock for expo-asset

export const Asset = {
  fromModule: jest.fn((_module: any) => ({
    localUri: 'file:///mock-document/mock-asset.zip',
    downloadAsync: jest.fn(async () => {}),
  })),
};
