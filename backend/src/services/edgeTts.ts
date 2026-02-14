// Edge TTS Service
// Stub implementation for development

export interface TTSOptions {
  voice?: string;
  rate?: string;
  pitch?: string;
}

export interface TTSResult {
  success: boolean;
  outputPath?: string;
  error?: string;
}

export async function generateSpeech(
  text: string,
  options: TTSOptions
): Promise<TTSResult> {
  return {
    success: true,
    outputPath: ''
  };
}

export async function getVoices(): Promise<string[]> {
  return [];
}
