import { useState, useEffect } from 'react';
import { useBLE } from '../context/BLEContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { router } from 'expo-router';

export const useBLEControls = () => {
  const { connectedDevice, checkConnection, getRSSI } = useBLE();
  const [status, setStatus] = useState<string>('Disconnected');
  const [signal, setSignal] = useState<string>('Excellent');
  const [battery, setBattery] = useState<number>(100);
  const [deviceName, setDeviceName] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);

  useEffect(() => {
    if (!connectedDevice) {
      Alert.alert('No Device Connected', 'Please connect to a device.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    }

    setStatus(connectedDevice ? 'Connected' : 'Disconnected');

    const getDeviceName = async () => {
      try {
        const name = await AsyncStorage.getItem('connected_device_name');
        if (name) setDeviceName(name);
      } catch (error) {
        console.error('Error getting device name:', error);
      }
    };

    getDeviceName();

    const checkStatusAndSignal = async () => {
      const connection = await checkConnection(connectedDevice);
      setIsConnected(connection);
      if (connection) {
        const rssi = await getRSSI();
        setSignalStrength(rssi);
      } else {
        setSignalStrength(null);
      }
    };

    checkStatusAndSignal();
    const interval = setInterval(checkStatusAndSignal, 10000);

    const updateBattery = () => {
      const batteryLevel = connectedDevice ? Math.floor(Math.random() * 20 + 80) : 100;
      setBattery(batteryLevel);
    };

    const batteryInterval = setInterval(updateBattery, 5000);

    return () => {
      clearInterval(interval);
      clearInterval(batteryInterval);
    };
  }, [connectedDevice, checkConnection, getRSSI]);

  return { connectedDevice, deviceName, status, signal, battery, isConnected, signalStrength };
};
