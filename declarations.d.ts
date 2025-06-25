// declarations.d.ts
declare module '*.mp3' {
    import { AVPlaybackSource } from 'expo-av';
    const value: AVPlaybackSource;
    export default value;
  }
  
  declare module '*.png';
  declare module '*.jpg';