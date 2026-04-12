import * as FileSystem from 'expo-file-system/legacy';
import { installDownloadedLevel } from '../store/appStore';

export interface DownloadProgress {
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  progress?: number;
  error?: string;
}

export async function downloadAndInstallLevel(
  url: string,
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  const zipPath = FileSystem.cacheDirectory + 'level_download.zip';

  try {
    // 1. Download ZIP
    onProgress({ stage: 'downloading', progress: 0 });
    const download = FileSystem.createDownloadResumable(
      url,
      zipPath,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        const progress = totalBytesExpectedToWrite > 0
          ? totalBytesWritten / totalBytesExpectedToWrite
          : 0;
        onProgress({ stage: 'downloading', progress });
      }
    );
    await download.downloadAsync();
    onProgress({ stage: 'downloading', progress: 1 });

    // 2. Extract ZIP and scan new level into store
    onProgress({ stage: 'extracting' });
    await installDownloadedLevel(zipPath);

    onProgress({ stage: 'done' });
  } catch (e: any) {
    onProgress({ stage: 'error', error: e?.message ?? 'Error desconocido' });
  } finally {
    await FileSystem.deleteAsync(zipPath, { idempotent: true });
  }
}
