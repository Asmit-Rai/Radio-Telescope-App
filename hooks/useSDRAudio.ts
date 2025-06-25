import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { UsbSerialManager, Parity } from 'react-native-usb-serialport-for-android';
import { Alert } from 'react-native';
import { createWavBuffer, arrayBufferToBase64 } from '../utils/audioUtils';
import { SAMPLE_RATE } from '../utils/constants';

export const useSDRAudio = () => {
  const [isSdrConnected, setIsSdrConnected] = useState<boolean>(false);
  const [sdrDeviceId, setSdrDeviceId] = useState<number | null>(null);
  const [sound, setSound] = useState<Audio.Sound | undefined>();
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(100).fill(0));
  const recordedAudioRef = useRef<string | null>(null);

  const initializeSDR = async () => {
    try {
      const devices = await UsbSerialManager.list();
      if (!devices || devices.length === 0) {
        setIsSdrConnected(false);
        Alert.alert('Error', 'No USB devices found. Please connect the SDR.');
        return;
      }

      const device = devices.find((d) => d.deviceId === 2004) || devices[0];
      await UsbSerialManager.tryRequestPermission(device.deviceId);
      const usbSerialport = await UsbSerialManager.open(device.deviceId, {
        baudRate: 115200,
        parity: Parity.None,
        dataBits: 8,
        stopBits: 1,
      });

      setSdrDeviceId(device.deviceId);
      setIsSdrConnected(true);
      console.log('SDR connected via USB OTG:', device);
      await tuneSDR(10.0, usbSerialport);
      startDataFetching(usbSerialport);
    } catch (error) {
      console.error('SDR Connection Error:', error);
      setIsSdrConnected(false);
      Alert.alert('Error', 'Failed to connect to SDR via USB OTG.');
    }
  };

  const startDataFetching = (usbSerialport: any) => {
    const interval = setInterval(() => {
      fetchSDRData(usbSerialport);
    }, 100);
    return interval;
  };

  const fetchSDRData = async (usbSerialport: any) => {
    if (!isSdrConnected || !sdrDeviceId) return;

    try {
      const sub = usbSerialport.onReceived((event: any) => {
        if (!event.data) return;
        const rawData = new TextEncoder().encode(event.data);
        const iqSamples = new Uint8Array(rawData);
        const newData = new Array(100).fill(0).map((_, i) => {
          const index = Math.floor((i / 100) * iqSamples.length);
          const iSample = iqSamples[index] || 0;
          const qSample = iqSamples[index + 1] || 0;
          return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
        });

        setWaveformData(newData);
        if (isPlaying && isRecording) {
          playRealTimeAudio(newData, true);
        } else {
          playRealTimeAudio(newData, false);
        }
      });

      return () => sub.remove();
    } catch (error) {
      console.error('SDR Read Error:', error);
    }
  };

  const tuneSDR = async (freq: number, usbSerialport?: any) => {
    if (!isSdrConnected || !sdrDeviceId) return;

    try {
      const freqHz = freq * 1e6;
      const command = `f${freqHz}\n`;
      if (usbSerialport) {
        await usbSerialport.send(command);
      } else {
        const devices = await UsbSerialManager.list();
        const device = devices.find((d) => d.deviceId === sdrDeviceId);
        if (device) {
          const serialPort = await UsbSerialManager.open(device.deviceId, {
            baudRate: 115200,
            parity: Parity.None,
            dataBits: 8,
            stopBits: 1,
          });
          await serialPort.send(command);
          await serialPort.close();
        }
      }
      console.log(`Tuned SDR to ${freq} MHz`);
    } catch (error) {
      console.error('SDR Tune Error:', error);
      Alert.alert('Error', `Failed to tune SDR to ${freq} MHz.`);
    }
  };

  const playRealTimeAudio = async (data: number[], record: boolean) => {
    if (!data.length || !isSdrConnected) return;

    try {
      if (sound) await sound.unloadAsync();

      const buffer = new Int16Array(data.length * 2);
      data.forEach((val, i) => {
        const sample = Math.floor(val * 32767);
        buffer[i * 2] = sample;
        buffer[i * 2 + 1] = sample;
      });

      const wavBuffer = createWavBuffer(buffer, SAMPLE_RATE);
      const base64 = arrayBufferToBase64(wavBuffer);
      const uri = `data:audio/wav;base64,${base64}`;

      if (record) recordedAudioRef.current = base64;

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: isPlaying, isLooping: true }
      );
      setSound(newSound);
    } catch (error) {
      console.error('Audio Error:', error);
      Alert.alert('Error', 'Failed to play audio from SDR data.');
    }
  };

  const handlePlayPause = async () => {
    if (!sound || !isSdrConnected) {
      Alert.alert('Error', 'No audio available. Ensure the SDR is connected.');
      return;
    }

    try {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        setIsRecording(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
        setIsRecording(true);
      }
    } catch (error) {
      console.error('Play/Pause Error:', error);
      Alert.alert('Error', 'Failed to play/pause audio.');
    }
  };

  const handleStop = async () => {
    if (sound && isPlaying) {
      try {
        await sound.stopAsync();
        setIsPlaying(false);
        setIsRecording(false);
        Alert.alert('Playback Stopped');
      } catch (error) {
        console.error('Stop Error:', error);
      }
    }
  };

  useEffect(() => {
    let dataInterval: NodeJS.Timeout;
    let usbSerialport: any;

    const setupSDR = async () => {
      try {
        const devices = await UsbSerialManager.list();
        if (!devices || devices.length === 0) return;

        const device = devices.find((d: any) => d.deviceId === 2004) || devices[0];
        await UsbSerialManager.tryRequestPermission(device.deviceId);
        usbSerialport = await UsbSerialManager.open(device.deviceId, {
          baudRate: 115200,
          parity: Parity.None,
          dataBits: 8,
          stopBits: 1,
        });

        setSdrDeviceId(device.deviceId);
        setIsSdrConnected(true);
        await tuneSDR(10.0, usbSerialport);
        dataInterval = startDataFetching(usbSerialport);
      } catch (error) {
        console.error('SDR Setup Error:', error);
      }
    };

    setupSDR();

    return () => {
      if (dataInterval) clearInterval(dataInterval);
      if (usbSerialport) usbSerialport.close().catch(console.error);
      if (sound) sound.unloadAsync().catch(console.error);
    };
  }, []);

  return {
    isSdrConnected,
    sdrDeviceId,
    sound,
    isPlaying,
    isRecording,
    waveformData,
    recordedAudioRef,
    handlePlayPause,
    handleStop,
    playRealTimeAudio,
    initializeSDR,
    tuneSDR,
  };
};