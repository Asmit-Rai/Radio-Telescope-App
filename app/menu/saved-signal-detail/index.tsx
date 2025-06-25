import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, useWindowDimensions, FlatList, ImageBackground, Alert } from 'react-native';
import { AntDesign, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useBLE } from 'context/BLEContext';
import { UsbSerialManager, Parity, UsbSerial } from 'react-native-usb-serialport-for-android';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SavedSignal = {
  name: string;
  frequency: number;
  altitude: number;
  azimuth: number;
  audioBase64?: string;
};

interface UsbSerialPort {
  send: (data: string) => Promise<null>;
  close: () => Promise<null>;
}

const SavedSignalDetail: React.FC = () => {
  const { name, frequency, altitude, azimuth } = useLocalSearchParams<{ name: string; frequency: string; altitude: string; azimuth: string }>();
  const { connectedDevice, writeData, checkConnection } = useBLE();
  const [isSdrConnected, setIsSdrConnected] = useState(false);
  const [usbSerialport, setUsbSerialport] = useState<UsbSerialPort | null>(null);
  const [status, setStatus] = useState<string>('Checking...');
  const [battery, setBattery] = useState(100);
  const [isTracking, setIsTracking] = useState(true);
  const [hasSentAngles, setHasSentAngles] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [allSignals, setAllSignals] = useState<SavedSignal[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const isMountedRef = useRef(true);
  const lastAnglesRef = useRef<{ alt: number; az: number } | null>(null);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const barCount = Math.floor(SCREEN_WIDTH / 4);
  const waveformData = new Array(barCount).fill(0).map(() => Math.random() * 100 + 10);

  const signal = useRef<SavedSignal>({
    name: decodeURIComponent(name || 'Unknown'),
    frequency: parseFloat(frequency || '0'),
    altitude: parseFloat(altitude || '90'), // Default to 90
    azimuth: parseFloat(azimuth || '90'),   // Default to 90
    audioBase64: undefined,
  });

  const Waveform = React.memo(() => {
    return (
      <FlatList
        data={waveformData}
        keyExtractor={(_, index) => index.toString()}
        horizontal
        style={styles.visualizerContainer}
        renderItem={({ item }) => <View style={[styles.visualizerBar, { height: item }]} />}
      />
    );
  });
  Waveform.displayName = 'Waveform';

  useEffect(() => {
    const loadAllSignals = async () => {
      try {
        const saved = await AsyncStorage.getItem('savedSignals');
        if (saved) {
          const signals = JSON.parse(saved);
          setAllSignals(signals);
          const currentFreq = parseFloat(frequency || '0');
          const index = signals.findIndex((s: SavedSignal) => s.frequency === currentFreq);
          setCurrentIndex(index >= 0 ? index : 0);
        }
      } catch (error) {
        console.error('Error loading signals:', error);
        Alert.alert('Error', 'Failed to load saved signals.');
      }
    };
    loadAllSignals();
  }, [frequency]);

  const initializeSDR = useCallback(async (freq: number) => {
    try {
      const devices = await UsbSerialManager.list();
      if (!devices.length) {
        console.log('No SDR device found');
        return null;
      }
      const device = devices[0];
      await UsbSerialManager.tryRequestPermission(device.deviceId);
      const port: UsbSerial = await UsbSerialManager.open(device.deviceId, {
        baudRate: 115200,
        parity: Parity.None,
        dataBits: 8,
        stopBits: 1,
      });
      if (isMountedRef.current) {
        setUsbSerialport(port as unknown as UsbSerialPort);
        setIsSdrConnected(true);
        await tuneSDR(freq);
        console.log(`SDR initialized: deviceId=${device.deviceId}, freq=${freq} MHz`);
      }
      return port;
    } catch (error) {
      console.error('SDR init error:', error);
      return null;
    }
  }, []);

  const tuneSDR = useCallback(async (freq: number) => {
    if (!isSdrConnected || !usbSerialport || !isMountedRef.current) {
      console.log('SDR not connected or component unmounted');
      return;
    }
    try {
      const freqHz = freq * 1e6;
      await usbSerialport.send(`f${freqHz}\n`);
      console.log(`Tuned SDR to ${freq} MHz`);
    } catch (error) {
      console.error('SDR tuning error:', error);
      if (isMountedRef.current) {
        setIsSdrConnected(false);
        setUsbSerialport(null);
      }
    }
  }, [isSdrConnected, usbSerialport]);

  const sendAngles = useCallback(async (alt: number, az: number) => {
    if (!connectedDevice || !writeData || !isMountedRef.current || !isTracking) {
      console.log('BLE not ready or tracking stopped');
      return;
    }
    const constrainedAlt = Math.max(0, Math.min(180, Math.round(alt)));
    const constrainedAz = Math.max(0, Math.min(360, Math.round(az)));
    if (
      lastAnglesRef.current &&
      lastAnglesRef.current.alt === constrainedAlt &&
      lastAnglesRef.current.az === constrainedAz
    ) {
      console.log('Angles unchanged, skipping write');
      return;
    }
    try {
      const success = await writeData(constrainedAlt, constrainedAz);
      if (!success) {
        throw new Error('Write failed');
      }
      if (isMountedRef.current) {
        lastAnglesRef.current = { alt: constrainedAlt, az: constrainedAz };
        console.log(`Sent angles: Alt=${constrainedAlt}, Az=${constrainedAz}`);
      }
    } catch (error) {
      console.error('BLE error:', error);
      Alert.alert('Error', 'Failed to send angles');
      if (isMountedRef.current) {
        setStatus('Disconnected');
      }
    }
  }, [connectedDevice, writeData, isTracking]);

  const stopTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsTracking(false);
    setIsPlaying(false);
    await sendAngles(90, 90); // Reset to default position
    if (usbSerialport && isSdrConnected) {
      try {
        await usbSerialport.close();
        console.log('SDR port closed on stop');
      } catch (error) {
        console.error('SDR close error:', error);
      }
      setUsbSerialport(null);
      setIsSdrConnected(false);
    }
    console.log('Tracking stopped');
  }, [sendAngles, usbSerialport, isSdrConnected]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const checkStatus = async () => {
      if (!isMountedRef.current || !connectedDevice) {
        if (isMountedRef.current) {
          setStatus('Disconnected');
        }
        return;
      }
      try {
        const connection = await checkConnection(connectedDevice);
        if (isMountedRef.current) {
          setStatus(connection ? 'Connected' : 'Disconnected');
          console.log(`Connection check: connected=${connection}`);
        }
      } catch (error) {
        console.error('Connection check error:', error);
        if (isMountedRef.current) {
          setStatus('Disconnected');
        }
      }
    };
    checkStatus();
    interval = setInterval(checkStatus, 30000);
    return () => {
      clearInterval(interval);
      console.log('Connection check interval cleared');
    };
  }, [connectedDevice, checkConnection]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!connectedDevice) {
      Alert.alert('Error', 'No BLE device connected', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
      console.log('No BLE device connected');
      return;
    }
    if (hasSentAngles) return;

    const initialize = async () => {
      if (!isMountedRef.current || !isTracking) return;
      await sendAngles(signal.current.altitude, signal.current.azimuth);
      if (isMountedRef.current) {
        setHasSentAngles(true);
      }
      const port = await initializeSDR(signal.current.frequency);
      return async () => {
        if (port) {
          try {
            await port.close();
            console.log('SDR port closed');
          } catch (error) {
            console.error('SDR close error:', error);
          }
        }
      };
    };

    let cleanup: (() => Promise<void>) | undefined;
    initialize().then((clean) => {
      cleanup = clean;
    });

    const batteryInterval = setInterval(() => {
      setBattery((prev) => Math.max(80, Math.min(100, prev - 1)));
    }, 5000);

    return () => {
      isMountedRef.current = false;
      clearInterval(batteryInterval);
      if (cleanup) {
        cleanup().catch((error) => console.error('Cleanup error:', error));
      }
      console.log('SavedSignalDetail unmounted, cleaned up resources');
    };
  }, [connectedDevice, sendAngles, initializeSDR]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
    console.log(`Recording ${isPlaying ? 'paused' : 'started'}`);
  }, [isPlaying]);

  const handleNextSignal = () => {
    if (allSignals.length > 0) {
      const nextIndex = (currentIndex + 1) % allSignals.length;
      setCurrentIndex(nextIndex);
      const nextSignal = allSignals[nextIndex];
      router.replace(`/menu/saved-signal-detail?name=${encodeURIComponent(nextSignal.name)}&frequency=${nextSignal.frequency}&altitude=${nextSignal.altitude}&azimuth=${nextSignal.azimuth}`);
    } else {
      Alert.alert('Info', 'No other signals available.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require("../../../assets/background/target-tracking-bg.png")}
        style={styles.backgroundImage}
        onError={(error) => console.error('Image load error:', error)}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Feather name="arrow-left" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{signal.current.name}</Text>
          </View>

          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <View style={styles.statusIconCircle}>
                <View style={styles.statusIconInnerCircle} />
              </View>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={styles.statusValueGreen}>{status}</Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="wifi" size={24} color="white" />
              <Text style={styles.statusLabel}>SIGNAL</Text>
              <Text style={styles.statusValueGreen}>{status === 'Connected' ? 'Excellent' : 'N/A'}</Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="battery" size={24} color="#34C759" />
              <Text style={styles.statusLabel}>BATTERY</Text>
              <Text style={styles.statusValueGreen}>{battery}%</Text>
            </View>
          </View>

          <View style={styles.planetContainer}>
            {isSdrConnected ? <Waveform /> : <Text style={styles.placeholderText}>SDR Disconnected</Text>}
          </View>

          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>DETAILS</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>RIGHT ASCENSION (RA):</Text>
              <Text style={styles.detailValue}>N/A</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DECLINATION (DEC):</Text>
              <Text style={styles.detailValue}>N/A</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ALTITUDE (Alt):</Text>
              <Text style={styles.detailValue}>{signal.current.altitude.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AZIMUTH (Az):</Text>
              <Text style={styles.detailValue}>{signal.current.azimuth.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>FREQUENCY:</Text>
              <Text style={styles.detailValue}>{signal.current.frequency} MHz</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.footer}>
            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.smallButton} onPress={handleNextSignal}>
                <Text style={styles.smallButtonText}>NEXT{"\n"}SIGNAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={stopTracking}>
                <View style={styles.stopIconOuter}>
                  <View style={styles.stopIconInner} />
                </View>
                <Text style={styles.iconButtonText}>STOP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recButton} onPress={handlePlayPause}>
                <MaterialCommunityIcons name={isPlaying ? "pause" : "record"} size={32} color="white" />
                <Text style={styles.recButtonText}>{isPlaying ? "PAUSE" : "REC"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  backButton: {
    backgroundColor: '#121212',
    padding: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'white',
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginLeft: 15,
    lineHeight: 26,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 10,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF8C2B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconInnerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C2B',
  },
  statusLabel: {
    color: 'white',
    fontFamily: 'Shantell',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  statusValueGreen: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginTop: 2,
  },
  planetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  placeholderText: {
    color: '#FF8C2B',
    fontFamily: 'Shantell',
    fontSize: 16,
  },
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 150,
  },
  visualizerBar: {
    width: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    marginHorizontal: 3,
  },
  detailsContainer: {
    marginTop: 40,
    borderRadius: 20,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: '#FF833A',
    borderStyle: 'dashed',
  },
  detailsTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    alignSelf: 'center',
    marginBottom: 40,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  detailLabel: {
    color: '#FF8C2B',
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    fontSize: 15,
  },
  detailValue: {
    color: 'white',
    fontFamily: 'Shantell',
    fontSize: 15,
  },
  footer: {
    paddingBottom: 10,
    borderTopColor: '#FF833A',
    borderTopWidth: 2,
    paddingTop: 15,
    borderStyle: 'dashed',
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    position: 'relative',
    paddingBottom: 55,
  },
  smallButton: {
    width: 120,
    height: 65,
    borderRadius: 32,
    backgroundColor: '#FF833A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  smallButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
  },
  iconButton: {
    alignItems: 'center',
  },
  iconButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginTop: 5,
  },
  stopIconOuter: {
    width: 40,
    height: 40,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FF6464',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIconInner: {
    width: 10,
    height: 10,
    backgroundColor: '#FF6464',
  },
  recButton: {
    backgroundColor: '#FF833A',
    borderRadius: 30,
    paddingVertical: 15,
    paddingHorizontal: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  recButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginLeft: 8,
  },
});

export default SavedSignalDetail;