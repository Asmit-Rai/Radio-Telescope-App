import { useBLE } from 'context/BLEContext';
import { useFonts } from 'expo-font';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  BackHandler,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Device } from 'react-native-ble-plx';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

const SpaceConnectScreen = () => {
  const [fontsLoaded] = useFonts({
    Doto: require('../assets/fonts/Doto/static/Doto-Regular.ttf'),
    Shantell: require('../assets/fonts/Shantell_Sans/static/ShantellSans-Regular.ttf'),
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [helpModalVisible, setHelpModalVisible] = useState(false);
  const [isConnectingToDevice, setIsConnectingToDevice] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  // Refs to track component state
  const isMountedRef = useRef(true);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    allDevices,
    isScanning,
    isConnecting,
    scanForPeripherals,
    connectToDevice,
    connectedDevice,
    stopScan,
  } = useBLE();

  // Memoized cleanup function
  const cleanup = useCallback(() => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  // Memoized callbacks
  const startScan = useCallback(async () => {
    try {
      setModalVisible(true);
      await scanForPeripherals();
    } catch (error) {
      console.error('Failed to start scan:', error);
      if (isMountedRef.current) {
        Alert.alert('Scan Error', 'Failed to start scanning for devices. Please try again.');
        setModalVisible(false);
      }
    }
  }, [scanForPeripherals]);

  const handleDeviceConnect = useCallback(
    async (device: Device) => {
      if (isConnectingToDevice || !device?.id || !isMountedRef.current) {
        return;
      }

      setIsConnectingToDevice(true);
      setSelectedDeviceId(device.id);
      setModalVisible(false);

      try {
        const success = await connectToDevice(device);
        if (!success && isMountedRef.current) {
          Alert.alert(
            'Connection Failed',
            `Unable to connect to ${device.name || 'the device'}. Please try again.`,
            [
              {
                text: 'Retry',
                onPress: () => handleDeviceConnect(device),
              },
              {
                text: 'Cancel',
                style: 'cancel',
                onPress: () => {
                  if (isMountedRef.current) {
                    setIsConnectingToDevice(false);
                    setSelectedDeviceId(null);
                  }
                },
              },
            ],
          );
        }
      } catch (error) {
        console.error('Connection error:', error);
        if (isMountedRef.current) {
          Alert.alert('Connection Error', 'An unexpected error occurred while connecting.');
          setIsConnectingToDevice(false);
          setSelectedDeviceId(null);
        }
      }
    },
    [isConnectingToDevice, connectToDevice],
  );

   const cancelOperation = useCallback(async () => {
    if (isMountedRef.current) {
      // Stop scanning if in progress
      await stopScan(); // Now this will work properly
      
      // Reset all states
      setModalVisible(false);
      setIsConnectingToDevice(false);
      setSelectedDeviceId(null);
      
      // Clear any timeouts
      cleanup();
    }
  }, [stopScan, cleanup]); // Add stopScan to dependencies

  const closeModal = useCallback(() => {
    if (!isScanning && !isConnectingToDevice && isMountedRef.current) {
      setModalVisible(false);
    }
  }, [isScanning, isConnectingToDevice]);

  const renderDevice = useCallback(
    ({ item }: { item: Device }) => {
      const isSelected = selectedDeviceId === item.id;
      const deviceName = item.name || item.localName || 'Unknown Device';

      return (
        <TouchableOpacity
          style={[
            styles.deviceItem,
            isSelected && styles.selectedDeviceItem,
            isConnectingToDevice && !isSelected && styles.disabledDeviceItem,
          ]}
          onPress={() => handleDeviceConnect(item)}
          disabled={isConnectingToDevice}
        >
          <View style={styles.deviceContent}>
            <Text
              style={[styles.deviceName, isSelected && styles.selectedDeviceText]}
            >
              {deviceName}
            </Text>
            <Text
              style={[styles.deviceInfo, isSelected && styles.selectedDeviceText]}
            >
              Signal: {item.rssi ? `${item.rssi} dBm` : 'Unknown'}
            </Text>
            <Text
              style={[styles.deviceInfo, isSelected && styles.selectedDeviceText]}
            >
              ID: {item.id.substring(0, 8)}...
            </Text>
          </View>
          {isSelected && isConnectingToDevice && (
            <ActivityIndicator size="small" color="#FF833A" />
          )}
        </TouchableOpacity>
      );
    },
    [selectedDeviceId, isConnectingToDevice, handleDeviceConnect],
  );

  const keyExtractor = useCallback((item: Device) => item.id, []);

  const ListEmptyComponent = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        {isScanning ? (
          <>
            <ActivityIndicator size="large" color="#FF833A" />
            <Text style={styles.scanningText}>Scanning for devices...</Text>
          </>
        ) : (
          <Text style={styles.noDevicesText}>
            No devices found.
          </Text>
        )}
      </View>
    ),
    [isScanning],
  );

  // Handle component unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  // Handle app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (modalVisible) {
          setModalVisible(false);
        }
        if (helpModalVisible) {
          setHelpModalVisible(false);
        }
        setIsConnectingToDevice(false);
        setSelectedDeviceId(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [modalVisible, helpModalVisible]);

  // Handle back button on Android
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (helpModalVisible) {
          setHelpModalVisible(false);
          return true;
        }
        if (modalVisible) {
          setModalVisible(false);
          return true;
        }
        if (isConnectingToDevice) {
          Alert.alert(
            'Connection in Progress',
            'Please wait while connecting to the device.',
            [{ text: 'OK' }],
          );
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [helpModalVisible, modalVisible, isConnectingToDevice]),
  );

  // Auto-close scan modal after timeout if no devices found
  useEffect(() => {
    if (isScanning && modalVisible) {
      scanTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current && allDevices.length === 0) {
          Alert.alert(
            'No Devices Found',
            'No compatible devices were found. Make sure your telescope is powered on and in pairing mode.',
            [
              {
                text: 'Try Again',
                onPress: () => {
                  if (isMountedRef.current) {
                    scanForPeripherals();
                  }
                },
              },
              {
                text: 'Cancel',
                onPress: () => {
                  if (isMountedRef.current) {
                    setModalVisible(false);
                  }
                },
              },
            ],
          );
        }
      }, 15000); // 15 seconds timeout
    }
    return cleanup;
  }, [isScanning, modalVisible, allDevices.length, scanForPeripherals, cleanup]);

  // Reset states when scan or connection completes
  useEffect(() => {
    if (!isScanning && !isConnecting && isMountedRef.current) {
      setIsConnectingToDevice(false);
      setSelectedDeviceId(null);
    }
  }, [isScanning, isConnecting]);

  // Redirect if already connected
  useEffect(() => {
    if (connectedDevice && !isConnectingToDevice && isMountedRef.current) {
      console.log('Device already connected, redirecting...');
      // TODO: Implement navigation (e.g., router.push('/home'))
      router.push('/dashboard');
    }
  }, [connectedDevice, isConnectingToDevice]);

  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF833A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Image
        source={require('../assets/background/stars.png')}
        style={styles.starImage}
        resizeMode="cover"
      />
      <View style={styles.container}>
        <View style={styles.content}>
          <Image
            source={require('../assets/background/solar-system-img.png')}
            style={styles.solarSystemImage}
            resizeMode="contain"
          />
          <Text style={styles.title}>Connect to</Text>
          <Text style={[styles.title, styles.titleMargin]}>Radio Telescope</Text>

          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonMargin,
              (isScanning || isConnecting || isConnectingToDevice) && styles.disabledButton,
            ]}
            onPress={startScan}
            disabled={isScanning || isConnecting || isConnectingToDevice}
          >
            {isScanning || isConnecting || isConnectingToDevice ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="#FFF" />
                <Text style={styles.buttonText}>
                  {isConnecting || isConnectingToDevice ? 'Connecting...' : 'Scanning...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Scan Device</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, (isConnectingToDevice || isConnecting) && styles.disabledButton]}
            onPress={() => setHelpModalVisible(true)}
            disabled={isConnectingToDevice || isConnecting}
          >
            <Text style={styles.buttonText}>Help</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Image
        source={require('../assets/background/connect-page-bottom-image.png')}
        style={styles.planetImage}
        resizeMode="cover"
      />

      {/* Help Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={helpModalVisible}
        onRequestClose={() => {
          if (isMountedRef.current && !isConnectingToDevice) {
            setHelpModalVisible(false);
          }
        }}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>How to Connect</Text>
            <Text style={styles.helpText}>
              1. Make sure your radio telescope is powered on and in pairing mode.{"\n\n"}
              2. Tap &quot;Scan Device&quot; to start scanning for available devices.{"\n\n"}
              3. Select your telescope from the list (look for ESP32_BLE_TEST).{"\n\n"}
              4. Wait for the connection to complete.{"\n\n"}
              5. If connection fails, ensure you&apos;re close to the device and try again.
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#FF3333' }]}
              onPress={() => {
                if (isMountedRef.current) {
                  setHelpModalVisible(false);
                }
              }}
              disabled={isConnectingToDevice || isConnecting}
            >
              <Text style={styles.buttonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Device List Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Available Devices</Text>

            <FlatList
              data={allDevices}
              renderItem={renderDevice}
              keyExtractor={keyExtractor}
              style={styles.deviceList}
              ListEmptyComponent={ListEmptyComponent}
              extraData={`${allDevices.length}-${selectedDeviceId}-${isConnectingToDevice}`}
              showsVerticalScrollIndicator={false}
            />

<TouchableOpacity
  style={[
    styles.button,
    { backgroundColor: '#FF3333' },
    // Remove the disabled conditions - button should always be active
  ]}
  onPress={cancelOperation} // Use the cancel function instead of closeModal
  disabled={false} // Always keep button active
>
  <Text style={styles.buttonText}>
    {isConnectingToDevice || isConnecting ? 'Cancel Connection' : 'Cancel'}
  </Text>
</TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 100,
    paddingBottom: 10,
  },
  solarSystemImage: {
    width: 300,
    height: 300,
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 36,
    color: '#FF833A',
    fontFamily: 'Shantell',
  },
  titleMargin: {
    marginBottom: 30,
  },
  button: {
    width: '80%',
    maxWidth: 360,
    paddingVertical: 12,
    borderRadius: 50,
    alignItems: 'center',
    backgroundColor: '#FF833A',
    marginBottom: 15,
  },
  disabledButton: {
    backgroundColor: '#666',
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Shantell',
  },
  helpText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Shantell',
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'left',
  },
  buttonMargin: {
    marginBottom: 20,
  },
  planetImage: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 200,
  },
  starImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  deviceList: {
    width: '100%',
    maxHeight: 360,
    paddingHorizontal: 10,
  },
  deviceItem: {
    backgroundColor: '#121212',
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedDeviceItem: {
    backgroundColor: '#2A1810',
    borderColor: '#FF833A',
  },
  disabledDeviceItem: {
    opacity: 0.5,
  },
  deviceContent: {
    flex: 1,
  },
  deviceName: {
    color: '#FF833A',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Shantell',
    marginBottom: 4,
  },
  deviceInfo: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Shantell',
    marginBottom: 2,
  },
  selectedDeviceText: {
    color: '#FFAA5A',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    backgroundColor: '#111',
    borderWidth: 2,
    borderColor: '#FF833A',
    borderStyle: 'dashed',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FF833A',
    fontSize: 20,
    fontWeight: '600',
    fontFamily: 'Shantell',
    marginBottom: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  scanningText: {
    color: '#FF833A',
    fontSize: 16,
    fontFamily: 'Shantell',
    marginTop: 10,
    textAlign: 'center',
  },
  noDevicesText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Shantell',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default SpaceConnectScreen;