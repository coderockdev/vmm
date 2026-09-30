import { MusicIntensity, MusicStyleId } from "./musicalDna";

export interface GeneratedMusic {
  filePath: string;
  durationSeconds: number;
  provider: string;
  style: MusicStyleId;
  /** Always true for VMM beds — no vocals. */
  instrumental: true;
  libraryEntryId?: string;
  attributionRequired?: boolean;
  attributionText?: string;
}

export interface GenerateMusicArgs {
  channelId: string;
  videoProjectId: string;
  durationSeconds: number;
  style: MusicStyleId;
  intensity: MusicIntensity;
  /** Free-text DNA / adapt-to-script notes (instrumental only). */
  instructions?: string | null;
  scriptText?: string;
  outDir: string;
  fileBaseName: string;
  /** Force a specific library track (from Audio tab picker). */
  libraryEntryId?: string | null;
}

export interface MusicProvider {
  readonly name: string;
  generate(args: GenerateMusicArgs): Promise<GeneratedMusic>;
}
