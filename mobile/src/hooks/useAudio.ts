import { useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

export function useAudio() {
  const soundRef = useRef<Audio.Sound | null>(null);

  const stopAudio = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
  }, []);

  const playAudio = useCallback(async (audioPath: string) => {
    await stopAudio();
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

    const info = await FileSystem.getInfoAsync(audioPath);
    if (!info.exists) {
      console.warn('[useAudio] Archivo no encontrado:', audioPath);
      return;
    }

    const { sound } = await Audio.Sound.createAsync({ uri: audioPath });
    soundRef.current = sound;
    await sound.playAsync();
  }, [stopAudio]);

  return { playAudio, stopAudio };
}
