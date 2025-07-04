import { BleManager, Device, Subscription } from "react-native-ble-plx";
import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Alert,
  PermissionsAndroid,
  Platform,
  AppState,
  AppStateStatus,
  Linking,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import base64 from "react-native-base64";

// Initialize BleManager once
const bleManager = new BleManager();

// Constants - Updated to match Arduino code
const STORAGE_KEYS = {
  USER_LOCATION: "user_location",
  CONNECTED_DEVICE_NAME: "connected_device_name",
  LAST_CONNECTED_DEVICE_ID: "last_connected_device_id",
  SCAN_TIMESTAMP: "last_scan_timestamp",
} as const;

// Arduino service and characteristic UUIDs
const SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
const CHARACTERISTIC_UUID = "abcd1234-1234-1234-1234-abcdef123456";

const MIN_RSSI = -80;
const SCAN_DURATION_MS = 10000;
const PING_INTERVAL_MS = 30000;
const PING_TIMEOUT_MS = 5000;
const MAX_RECONNECTION_ATTEMPTS = 3;
const INITIAL_RECONNECT_DELAY_MS = 2000;
const COMMAND_TIMEOUT_MS = 5000;
const SCAN_COOLDOWN_MS = 5000;
const MAX_RETRIES_PER_MINUTE = 5;
const CIRCUIT_BREAKER_TIMEOUT_MS = 60000;

// Command interface for the queue
interface Command {
  angle1: number;
  angle2: number;
  resolve: (value: boolean) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

interface StorageOperation {
  key: string;
  value?: string;
  type: 'set' | 'get' | 'delete';
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface BLEContextType {
  allDevices: Device[];
  connectedDevice: Device | null;
  isScanning: boolean;
  isConnecting: boolean;
  scanForPeripherals: () => Promise<void>;
  connectToDevice: (device: Device) => Promise<boolean>;
  disconnectDevice: () => Promise<void>;
  writeData: (angle1: number, angle2: number) => Promise<boolean>;
  checkConnection: (device: Device | null) => Promise<boolean>;
  storeData: (key: string, value: string) => Promise<void>;
  getData: (key: string) => Promise<string | null>;
  deleteData: (key: string) => Promise<void>;
  getUserLocation: () => Promise<string>;
  setUserLocation: (location: string) => Promise<void>;
  getConnectedDeviceName: () => Promise<string>;
  setConnectedDeviceName: (name: string) => Promise<void>;
  stopScan: () => Promise<void>;
  getRSSI: () => Promise<number | null>;
}

const BLEContext = createContext<BLEContextType | undefined>(undefined);

export const BLEProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // State Hooks
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  // Refs to prevent recreations and track state
  const reconnectionAttempts = useRef<number>(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scanLockRef = useRef<boolean>(false);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY_MS);
  const bluetoothStateSub = useRef<Subscription | null>(null);
  const disconnectListenerRef = useRef<Subscription | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const commandQueueRef = useRef<Command[]>([]);
  const storageQueueRef = useRef<StorageOperation[]>([]);
  const processingLockRef = useRef<boolean>(false);
  const lastPingTimeRef = useRef<number>(0);
  const retryCountRef = useRef<number>(0);
  const circuitBreakerRef = useRef<boolean>(false);
  const lastScanTimeRef = useRef<number>(0);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const appStateRef = useRef<AppStateStatus>('active');

  // Storage queue processing
  const processStorageQueue = useCallback(async () => {
    if (storageQueueRef.current.length === 0) return;

    const operation = storageQueueRef.current.shift();
    if (!operation) return;

    try {
      switch (operation.type) {
        case 'set':
          await AsyncStorage.setItem(operation.key, operation.value!);
          operation.resolve(null);
          break;
        case 'get':
          const value = await AsyncStorage.getItem(operation.key);
          operation.resolve(value);
          break;
        case 'delete':
          await AsyncStorage.removeItem(operation.key);
          operation.resolve(null);
          break;
      }
    } catch (error) {
      console.error(`❌ Storage operation failed for ${operation.key}:`, error);
      operation.reject(error);
    } finally {
      setTimeout(processStorageQueue, 50);
    }
  }, []);

  const storeData = useCallback(async (key: string, value: string, retries = 3) => {
    if (!key || !value) {
      console.warn('StoreData: Invalid key or value');
      return;
    }

    return new Promise<void>((resolve, reject) => {
      storageQueueRef.current.push({ key, value, type: 'set', resolve, reject });
      processStorageQueue();
    });
  }, [processStorageQueue]);

  const getData = useCallback(async (key: string, retries = 3): Promise<string | null> => {
    if (!key) {
      console.warn('GetData: Invalid key');
      return null;
    }

    return new Promise<string | null>((resolve, reject) => {
      storageQueueRef.current.push({ key, type: 'get', resolve, reject });
      processStorageQueue();
    });
  }, [processStorageQueue]);

  const deleteData = useCallback(async (key: string, retries = 3) => {
    if (!key) {
      console.warn('DeleteData: Invalid key');
      return;
    }

    return new Promise<void>((resolve, reject) => {
      storageQueueRef.current.push({ key, type: 'delete', resolve, reject });
      processStorageQueue();
    });
  }, [processStorageQueue]);

  // Memoized location functions
  const setUserLocation = useCallback(async (location: string) => {
    if (!location?.trim()) {
      console.warn('SetUserLocation: Invalid location');
      return;
    }
    await storeData(STORAGE_KEYS.USER_LOCATION, location.trim());
  }, [storeData]);

  const getUserLocation = useCallback(async () => {
    const location = await getData(STORAGE_KEYS.USER_LOCATION);
    return location || "Unknown";
  }, [getData]);

  const setConnectedDeviceName = useCallback(async (name: string) => {
    if (!name?.trim()) {
      console.warn('SetConnectedDeviceName: Invalid name');
      return;
    }
    await storeData(STORAGE_KEYS.CONNECTED_DEVICE_NAME, name.trim());
  }, [storeData]);

  const getConnectedDeviceName = useCallback(async () => {
    const name = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
    return name || "Unknown Device";
  }, [getData]);

  // Memoized permission function
  const requestPermissions = useCallback(async () => {
    if (Platform.OS !== "android") return true;

    try {
      const apiLevel = Platform.Version;
      const permissions =
        apiLevel < 31
          ? [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
          : [
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ];

      for (const perm of permissions) {
        const result = await PermissionsAndroid.request(perm, {
          title: `${perm.split(".").pop()} Permission`,
          message: `This app needs ${perm.split(".").pop()} permission to work properly.`,
          buttonPositive: "OK",
        });

        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            Alert.alert(
              "Permission Required",
              "Please enable permissions in settings.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Settings", onPress: () => Linking.openSettings() },
              ]
            );
          } else {
            Alert.alert("Permission Denied", "Bluetooth permissions are required.");
          }
          return false;
        }
      }
      console.log("✅ All permissions granted");
      return true;
    } catch (error) {
      console.error("❌ Permission request error:", error);
      return false;
    }
  }, []);

  // Memoized Bluetooth state check
  const checkBluetoothState = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (bluetoothStateSub.current) {
        bluetoothStateSub.current.remove();
        bluetoothStateSub.current = null;
      }

      const timeout = setTimeout(() => {
        if (bluetoothStateSub.current) {
          bluetoothStateSub.current.remove();
          bluetoothStateSub.current = null;
        }
        console.log("⏰ Bluetooth state check timed out");
        resolve(false);
      }, 5000);

      bluetoothStateSub.current = bleManager.onStateChange((state) => {
        clearTimeout(timeout);
        if (bluetoothStateSub.current) {
          bluetoothStateSub.current.remove();
          bluetoothStateSub.current = null;
        }

        if (state === "PoweredOn") {
          console.log("✅ Bluetooth is powered on");
          resolve(true);
        } else {
          Alert.alert("Bluetooth Required", "Please turn on Bluetooth.");
          console.log("❌ Bluetooth is off");
          resolve(false);
        }
      }, true);
    });
  }, []);

  const checkConnection = useCallback(async (device: Device | null): Promise<boolean> => {
    if (!device) return false;

    try {
      const isConnected = await bleManager.isDeviceConnected(device.id);
      if (!isConnected && isMountedRef.current) {
        console.log(`❌ Device ${device.id} is not connected`);
        setConnectedDevice(null);
        setConnectionState('disconnected');
        await deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        await deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
      }
      return isConnected;
    } catch (error) {
      console.error("❌ Connection check error:", error);
      return false;
    }
  }, [deleteData]);

  const cleanupConnection = useCallback(() => {
    console.log("🧹 Starting connection cleanup");
    
    subscriptionsRef.current.forEach(sub => sub.remove());
    subscriptionsRef.current = [];
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setConnectedDevice(null);
    setConnectionState('disconnected');
    reconnectionAttempts.current = 0;
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    isReconnectingRef.current = false;
    setIsProcessingCommand(false);
    commandQueueRef.current = [];
    processingLockRef.current = false;
    console.log("✅ Connection cleaned up");
  }, []);

  const setupDisconnectListener = useCallback((device: Device) => {
    if (disconnectListenerRef.current) {
      disconnectListenerRef.current.remove();
      disconnectListenerRef.current = null;
    }

    disconnectListenerRef.current = device.onDisconnected(async (error, disconnectedDevice) => {
      console.log(`🔌 Device ${disconnectedDevice.id} disconnected`, error ? `with error: ${error}` : '');
      await cleanupConnection();
      
      if (!error && !isReconnectingRef.current && reconnectionAttempts.current < MAX_RECONNECTION_ATTEMPTS) {
        const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        const deviceName = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        if (deviceId && deviceName) {
          console.log("🔄 Initiating reconnection after disconnect");
          attemptReconnection(deviceId, deviceName);
        }
      }
    });

    subscriptionsRef.current.push(disconnectListenerRef.current);
  }, [cleanupConnection, getData]);

  const attemptReconnection = useCallback(async (deviceId: string, deviceName: string) => {
    if (isReconnectingRef.current || circuitBreakerRef.current || reconnectionAttempts.current >= MAX_RECONNECTION_ATTEMPTS) {
      console.log("🚫 Reconnection aborted: already reconnecting, circuit breaker active, or max attempts reached");
      cleanupConnection();
      return;
    }

    isReconnectingRef.current = true;
    reconnectionAttempts.current += 1;
    const delay = reconnectDelayRef.current * Math.pow(2, reconnectionAttempts.current - 1);

    console.log(`🔄 Attempting reconnection ${reconnectionAttempts.current}/${MAX_RECONNECTION_ATTEMPTS} after ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const device = await bleManager.connectToDevice(deviceId, { timeout: 10000 });
      await device.discoverAllServicesAndCharacteristics();
      await device.requestMTU(512);

      if (!isMountedRef.current) {
        await device.cancelConnection();
        return;
      }

      setConnectedDevice(device);
      setConnectionState('connected');
      await setConnectedDeviceName(deviceName);
      await storeData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID, deviceId);
      setupDisconnectListener(device);
      setupPingInterval();
      reconnectionAttempts.current = 0;
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
      isReconnectingRef.current = false;
      console.log(`✅ Reconnected to ${deviceName}`);
      Alert.alert("Reconnected", `Reconnected to ${deviceName}`);
    } catch (error) {
      console.error(`❌ Reconnection attempt ${reconnectionAttempts.current} failed:`, error);
      if (reconnectionAttempts.current >= MAX_RECONNECTION_ATTEMPTS) {
        circuitBreakerRef.current = true;
        setTimeout(() => {
          circuitBreakerRef.current = false;
          reconnectionAttempts.current = 0;
        }, CIRCUIT_BREAKER_TIMEOUT_MS);
        cleanupConnection();
      } else {
        attemptReconnection(deviceId, deviceName);
      }
    } finally {
      isReconnectingRef.current = false;
    }
  }, [cleanupConnection, setConnectedDeviceName, storeData, setupDisconnectListener]);

  const setupPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    pingIntervalRef.current = setInterval(async () => {
      if (!connectedDevice || lastPingTimeRef.current + PING_TIMEOUT_MS > Date.now()) {
        return;
      }

      lastPingTimeRef.current = Date.now();
      try {
        await connectedDevice.readRSSI();
        console.log("🏓 Ping successful");
      } catch (error) {
        console.error("❌ Ping failed:", error);
        const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        const deviceName = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        if (deviceId && deviceName && !isReconnectingRef.current) {
          console.log("🔄 Initiating reconnection due to ping failure");
          await cleanupConnection();
          attemptReconnection(deviceId, deviceName);
        }
      }
    }, PING_INTERVAL_MS);

    subscriptionsRef.current.push({
      remove: () => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      }
    });
  }, [connectedDevice, getData, cleanupConnection, attemptReconnection]);

  const processNextCommand = useCallback(async () => {
    if (processingLockRef.current || isProcessingCommand || commandQueueRef.current.length === 0) {
      return;
    }

    processingLockRef.current = true;
    setIsProcessingCommand(true);

    const command = commandQueueRef.current.shift();
    if (!command) {
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      return;
    }

    const { angle1, angle2, resolve, reject, timestamp } = command;

    // Check for duplicate commands
    const lastCommand = commandQueueRef.current[commandQueueRef.current.length - 1];
    if (lastCommand && 
        lastCommand.angle1 === angle1 && 
        lastCommand.angle2 === angle2 && 
        timestamp - lastCommand.timestamp < 100) {
      console.log("🚫 Duplicate command detected, skipping");
      resolve(true);
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      processNextCommand();
      return;
    }

    if (!connectedDevice) {
      console.log("❌ Command rejected: no device connected");
      reject(new Error("No device connected"));
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      processNextCommand();
      return;
    }

    if (circuitBreakerRef.current) {
      console.log("❌ Command rejected: circuit breaker active");
      reject(new Error("Circuit breaker active"));
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      processNextCommand();
      return;
    }

    const isConnected = await checkConnection(connectedDevice);
    if (!isConnected) {
      console.log("❌ Command rejected: device disconnected");
      reject(new Error("Device disconnected"));
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      processNextCommand();
      return;
    }

    const timeout = setTimeout(() => {
      console.log("⏰ Command timed out");
      reject(new Error("Command timeout"));
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      processNextCommand();
    }, COMMAND_TIMEOUT_MS);

    try {
      const jsonData = JSON.stringify({ a1: angle1, a2: angle2 });
      const encodedData = base64.encode(jsonData);
      console.log(`📤 Sending data: ${jsonData}`);

      // Use the specific UUIDs that match the Arduino code
      await connectedDevice.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        CHARACTERISTIC_UUID,
        encodedData
      );

      clearTimeout(timeout);
      resolve(true);
      retryCountRef.current = 0;
      console.log(`✅ Wrote to service ${SERVICE_UUID}, characteristic ${CHARACTERISTIC_UUID}`);
    } catch (error) {
      clearTimeout(timeout);
      console.error("❌ Write error:", error);
      retryCountRef.current += 1;

      if (retryCountRef.current >= MAX_RETRIES_PER_MINUTE) {
        circuitBreakerRef.current = true;
        setTimeout(() => {
          circuitBreakerRef.current = false;
          retryCountRef.current = 0;
        }, CIRCUIT_BREAKER_TIMEOUT_MS);
      }

      reject(error);

      const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
      const deviceName = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
      if (deviceId && deviceName && !isReconnectingRef.current && !circuitBreakerRef.current) {
        console.log("🔄 Attempting reconnection due to write error");
        await cleanupConnection();
        attemptReconnection(deviceId, deviceName);
      }
    } finally {
      processingLockRef.current = false;
      setIsProcessingCommand(false);
      setTimeout(processNextCommand, 50);
    }
  }, [connectedDevice, checkConnection, getData, cleanupConnection, attemptReconnection, isProcessingCommand]);

  const writeData = useCallback(async (angle1: number, angle2: number): Promise<boolean> => {
    if (
      typeof angle1 !== "number" ||
      typeof angle2 !== "number" ||
      angle1 < 0 ||
      angle1 > 360 ||
      angle2 < 0 ||
      angle2 > 360
    ) {
      console.error("❌ Invalid angle data: angles must be between 0 and 360");
      Alert.alert("Error", "Angles must be between 0 and 360 degrees");
      return false;
    }

    if (circuitBreakerRef.current) {
      console.log("❌ Write rejected: circuit breaker active");
      return false;
    }

    const timestamp = Date.now();
    const lastCommand = commandQueueRef.current[commandQueueRef.current.length - 1];
    if (lastCommand && 
        lastCommand.angle1 === angle1 && 
        lastCommand.angle2 === angle2 && 
        timestamp - lastCommand.timestamp < 100) {
      console.log("🚫 Duplicate writeData call detected, ignoring");
      return true;
    }

    return new Promise<boolean>((resolve, reject) => {
      const command: Command = { angle1, angle2, resolve, reject, timestamp };
      commandQueueRef.current.push(command);
      console.log(`📝 Queued command: a1=${angle1}, a2=${angle2}, queue length=${commandQueueRef.current.length}`);
      processNextCommand();
    });
  }, [processNextCommand]);

  const scanForPeripherals = useCallback(async () => {
    if (isScanning || scanLockRef.current || connectionState === 'connected' || (Date.now() - lastScanTimeRef.current < SCAN_COOLDOWN_MS)) {
      console.warn("⚠️ Scan aborted: already scanning, connected, or in cooldown");
      return;
    }

    scanLockRef.current = true;
    lastScanTimeRef.current = Date.now();
    console.log("🔍 Starting device scan");

    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        scanLockRef.current = false;
        console.log("❌ Scan aborted: permissions denied");
        return;
      }

      const isBluetoothEnabled = await checkBluetoothState();
      if (!isBluetoothEnabled || !isMountedRef.current) {
        scanLockRef.current = false;
        console.log("❌ Scan aborted: Bluetooth disabled or unmounted");
        return;
      }

      setIsScanning(true);
      setAllDevices([]);

      await storeData(STORAGE_KEYS.SCAN_TIMESTAMP, new Date().toISOString());

      const deviceMap = new Map<string, Device>();

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (!isMountedRef.current) {
          bleManager.stopDeviceScan();
          console.log("🛑 Scan stopped: component unmounted");
          return;
        }

        if (error) {
          console.error("❌ Scan error:", error);
          setIsScanning(false);
          bleManager.stopDeviceScan();
          scanLockRef.current = false;
          return;
        }

        if (
          device &&
          (device.name || device.localName) &&
          device.rssi &&
          device.rssi >= MIN_RSSI &&
          !deviceMap.has(device.id)
        ) {
          deviceMap.set(device.id, device);
          setAllDevices(Array.from(deviceMap.values()));
          console.log(`📱 Found device: ${device.name || device.id} (RSSI: ${device.rssi})`);
        }
      });

      // No subscription object to push for startDeviceScan

      setTimeout(() => {
        if (isMountedRef.current) {
          bleManager.stopDeviceScan();
          setIsScanning(false);
          scanLockRef.current = false;
          console.log("✅ Scan completed");
        }
      }, SCAN_DURATION_MS);
    } catch (error) {
      console.error("❌ Scan failed:", error);
      Alert.alert("Scan Error", "Failed to scan for devices.");
      setIsScanning(false);
      scanLockRef.current = false;
    }
  }, [requestPermissions, checkBluetoothState, storeData, isScanning, connectionState]);

  const stopScan = useCallback(async () => {
    try {
      bleManager.stopDeviceScan();
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
      console.log("🛑 Scan stopped successfully");
    } catch (error) {
      console.error("❌ Failed to stop scan:", error);
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
    }
  }, []);

  const disconnectDevice = useCallback(async () => {
    console.log("🔌 Disconnecting device");
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        console.log("✅ Device disconnected successfully");
      } catch (error) {
        console.warn("⚠️ Disconnect error:", error);
      }
    }
    await cleanupConnection();
    await deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
    await deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
  }, [connectedDevice, cleanupConnection, deleteData]);

  const connectToDevice = useCallback(async (device: Device): Promise<boolean> => {
    if (isConnecting || connectionState === 'connecting') {
      console.warn("⚠️ Connection already in progress");
      return false;
    }

    if (!device?.id) {
      console.error("❌ Invalid device");
      return false;
    }

    console.log(`🔗 Connecting to device: ${device.name || device.id}`);
    setIsConnecting(true);
    setConnectionState('connecting');

    try {
      bleManager.stopDeviceScan();
      setIsScanning(false);
      scanLockRef.current = false;

      if (connectedDevice) {
        await disconnectDevice();
      }

      const deviceConnection = await bleManager.connectToDevice(device.id, {
        timeout: 10000,
      });
      await deviceConnection.discoverAllServicesAndCharacteristics();
      await deviceConnection.requestMTU(512);

      if (!isMountedRef.current) {
        await deviceConnection.cancelConnection();
        console.log("❌ Connection aborted: component unmounted");
        return false;
      }

      setConnectedDevice(deviceConnection);
      setConnectionState('connected');
      const deviceName = device.name || device.localName || device.id;
      await setConnectedDeviceName(deviceName);
      await storeData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID, device.id);
      setupDisconnectListener(deviceConnection);
      setupPingInterval();

      console.log(`✅ Connected to ${deviceName}`);
      Alert.alert("Connected", `Connected to ${deviceName}`);

      const lastDeviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
      const isFirstConnection = !lastDeviceId || lastDeviceId !== device.id;
      const pathname = isFirstConnection ? "/connected" : "/dashboard";
      
      router.push({
        pathname,
        params: { deviceName },
      });
      
      console.log(`🧭 Navigating to ${pathname}`);
      return true;
    } catch (error) {
      console.error("❌ Connection error:", error);
      Alert.alert(
        "Connection Failed",
        `Failed to connect to ${device.name || device.localName || device.id}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsConnecting(false);
        setConnectionState(connectedDevice ? 'connected' : 'disconnected');
      }
    }
  }, [isConnecting, connectedDevice, disconnectDevice, setConnectedDeviceName, storeData, getData, setupDisconnectListener, connectionState]);

  const getRSSI = useCallback(async (): Promise<number | null> => {
    if (!connectedDevice) return null;
    try {
      const updatedDevice = await connectedDevice.readRSSI();
      console.log(`📶 RSSI: ${updatedDevice.rssi}`);
      return updatedDevice.rssi ?? null;
    } catch (error) {
      console.error("❌ RSSI read error:", error);
      return null;
    }
  }, [connectedDevice]);

  const contextValue = useMemo(
    () => ({
      allDevices,
      connectedDevice,
      isScanning,
      isConnecting,
      scanForPeripherals,
      stopScan,
      connectToDevice,
      disconnectDevice,
      writeData,
      checkConnection,
      storeData,
      getData,
      deleteData,
      getUserLocation,
      setUserLocation,
      getConnectedDeviceName,
      setConnectedDeviceName,
      getRSSI,
    }),
    [
      allDevices,
      connectedDevice,
      isScanning,
      isConnecting,
      scanForPeripherals,
      stopScan,
      connectToDevice,
      disconnectDevice,
      writeData,
      checkConnection,
      storeData,
      getData,
      deleteData,
      getUserLocation,
      setUserLocation,
      getConnectedDeviceName,
      setConnectedDeviceName,
      getRSSI,
    ]
  );

  useEffect(() => {
    isMountedRef.current = true;
    console.log("🚀 BLE Provider mounted");

    return () => {
      console.log("🧹 BLE Provider unmounting, cleaning up");
      isMountedRef.current = false;
      subscriptionsRef.current.forEach(sub => sub.remove());
      subscriptionsRef.current = [];
      bleManager.stopDeviceScan();
      processingLockRef.current = false;
      storageQueueRef.current = [];
      console.log("✅ BLE Provider cleanup completed");
    };
  }, []);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (!isMountedRef.current || appStateRef.current === nextAppState) return;

      console.log(`📱 App state changed from ${appStateRef.current} to ${nextAppState}`);
      appStateRef.current = nextAppState;

      if (nextAppState === "active") {
        const isBluetoothEnabled = await checkBluetoothState();
        if (!isBluetoothEnabled) return;

        if (connectedDevice && !isReconnectingRef.current && connectionState === 'connected') {
          const isConnected = await checkConnection(connectedDevice);
          if (!isConnected && !isReconnectingRef.current) {
            const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
            const deviceName = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
            if (deviceId && deviceName) {
              console.log("🔄 App became active, attempting reconnection");
              Alert.alert("Reconnecting...", `Trying to reconnect to ${deviceName}.`);
              attemptReconnection(deviceId, deviceName);
            }
          }
        }
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        bleManager.stopDeviceScan();
        setIsScanning(false);
        scanLockRef.current = false;
        console.log("📱 App in background, stopped scanning");
      }
    };

    const appStateSub = AppState.addEventListener("change", handleAppStateChange);
    subscriptionsRef.current.push(appStateSub);

    return () => {
      appStateSub.remove();
      console.log("🗑️ App state listener removed");
    };
  }, [connectedDevice, checkBluetoothState, checkConnection, getData, attemptReconnection, connectionState]);

  return (
    <BLEContext.Provider value={contextValue}>
      {children}
    </BLEContext.Provider>
  );
};

export const useBLE = () => {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error("useBLE must be used within a BLEProvider");
  }
  return context;
};