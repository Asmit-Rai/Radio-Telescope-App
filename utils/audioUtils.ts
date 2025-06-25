export const createWavBuffer = (samples: Int16Array, sampleRate: number) => {
    const bufferLength = samples.length * 2;
    const wavLength = 44 + bufferLength;
    const buffer = new ArrayBuffer(wavLength);
    const view = new DataView(buffer);
  
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, bufferLength, true);
  
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true);
    }
  
    return buffer;
  };
  
  export const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  };