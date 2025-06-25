import { BleManager, Device, Subscription } from "react-native-ble-plx";
import { createContext, useContext, useEffect, useRef, useState } from "react";
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

// Constants
const STORAGE_KEYS = {
  USER_LOCATION: "user_location",
  CONNECTED_DEVICE_NAME: "connected_device_name",
  LAST_CONNECTED_DEVICE_ID: "last_connected_device_id",
  SCAN_TIMESTAMP: "last_scan_timestamp",
};

const MIN_RSSI = -80;
const SCAN_DURATION_MS = 10000;
const PING_INTERVAL_MS = 30000;
const MAX_RECONNECTION_ATTEMPTS = 3;
const INITIAL_RECONNECT_DELAY_MS = 2000;
const COMMAND_TIMEOUT_MS = 5000;

// Command interface for the queue
interface Command {
  angle1: number;
  angle2: number;
  resolve: (value: boolean) => void;
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
  // State Hooks (always called in the same order)
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isProcessingCommand, setIsProcessingCommand] = useState(false);

  // Ref Hooks (always initialized)
  const reconnectionAttempts = useRef<number>(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scanLockRef = useRef<boolean>(false);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY_MS);
  const bluetoothStateSub = useRef<Subscription | null>(null);
  const disconnectListenerRef = useRef<Subscription | null>(null);
  const isReconnectingRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);
  const commandQueueRef = useRef<Command[]>([]);

  // Utility Functions
  const storeData = async (key: string, value: string, retries = 3) => {
    if (!key || !value) return;

    let attempt = 0;
    while (attempt < retries) {
      try {
        await AsyncStorage.setItem(key, value);
        console.log(`Stored ${key} successfully`);
        return;
      } catch (error) {
        attempt++;
        console.error(`Storage attempt ${attempt} failed for ${key}:`, error);
        if (attempt === retries) {
          Alert.alert("Storage Error", "Failed to save data.");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  const getData = async (key: string, retries = 3) => {
    if (!key) return null;

    let attempt = 0;
    while (attempt < retries) {
      try {
        const value = await AsyncStorage.getItem(key);
        console.log(`Retrieved ${key}: ${value}`);
        return value;
      } catch (error) {
        attempt++;
        console.error(`Retrieval attempt ${attempt} failed for ${key}:`, error);
        if (attempt === retries) {
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    return null;
  };

  const deleteData = async (key: string, retries = 3) => {
    if (!key) return;

    let attempt = 0;
    while (attempt < retries) {
      try {
        await AsyncStorage.removeItem(key);
        console.log(`Deleted ${key} successfully`);
        return;
      } catch (error) {
        attempt++;
        console.error(`Delete attempt ${attempt} failed for ${key}:`, error);
        if (attempt === retries) {
          Alert.alert("Storage Error", "Failed to delete data.");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  };

  const setUserLocation = async (location: string) => {
    if (!location?.trim()) return;
    await storeData(STORAGE_KEYS.USER_LOCATION, location.trim());
  };

  const getUserLocation = async () => {
    const location = await getData(STORAGE_KEYS.USER_LOCATION);
    return location || "Unknown";
  };

  const setConnectedDeviceName = async (name: string) => {
    if (!name?.trim()) return;
    await storeData(STORAGE_KEYS.CONNECTED_DEVICE_NAME, name.trim());
  };

  const getConnectedDeviceName = async () => {
    const name = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
    return name || "Unknown Device";
  };

  const requestPermissions = async () => {
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
      console.log("All permissions granted");
      return true;
    } catch (error) {
      console.error("Permission request error:", error);
      return false;
    }
  };

  const checkBluetoothState = () => {
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
        console.log("Bluetooth state check timed out");
        resolve(false);
      }, 5000);

      bluetoothStateSub.current = bleManager.onStateChange((state) => {
        clearTimeout(timeout);
        if (bluetoothStateSub.current) {
          bluetoothStateSub.current.remove();
          bluetoothStateSub.current = null;
        }

        if (state === "PoweredOn") {
          console.log("Bluetooth is powered on");
          resolve(true);
        } else {
          Alert.alert("Bluetooth Required", "Please turn on Bluetooth.");
          console.log("Bluetooth is off");
          resolve(false);
        }
      }, true);
    });
  };

  const checkConnection = async (device: Device | null) => {
    if (!device) return false;

    try {
      const isConnected = await bleManager.isDeviceConnected(device.id);
      if (!isConnected && isMountedRef.current) {
        setConnectedDevice(null);
        await deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        await deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        console.log(`Device ${device.id} is not connected`);
      }
      return isConnected;
    } catch (error) {
      console.error("Connection check error:", error);
      return false;
    }
  };

  const cleanupConnection = () => {
    if (disconnectListenerRef.current) {
      disconnectListenerRef.current.remove();
      disconnectListenerRef.current = null;
    }

    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    setConnectedDevice(null);
    reconnectionAttempts.current = 0;
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
    isReconnectingRef.current = false;
    setIsProcessingCommand(false);
    commandQueueRef.current = [];
    console.log("Connection cleaned up");
  };

  const attemptReconnection = async (deviceId: string, deviceName: string | null) => {
    if (isReconnectingRef.current || !isMountedRef.current) {
      console.log("Reconnection skipped: already reconnecting or unmounted");
      return false;
    }

    isReconnectingRef.current = true;
    const reconnectionTimeout = setTimeout(() => {
      if (isMountedRef.current) {
        Alert.alert("Connection Lost", `Cannot reconnect to ${deviceName || "device"}.`);
        cleanupConnection();
        deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        router.replace("/");
        isReconnectingRef.current = false;
        setIsConnecting(false);
        console.log("Reconnection timed out");
      }
    }, 30000);

    try {
      if (reconnectionAttempts.current >= MAX_RECONNECTION_ATTEMPTS) {
        clearTimeout(reconnectionTimeout);
        Alert.alert("Connection Lost", `Cannot reconnect to ${deviceName || "device"}.`);
        cleanupConnection();
        deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        router.replace("/");
        console.log("Max reconnection attempts reached");
        return false;
      }

      const isBluetoothEnabled = await checkBluetoothState();
      if (!isBluetoothEnabled || !isMountedRef.current) {
        clearTimeout(reconnectionTimeout);
        console.log("Reconnection failed: Bluetooth disabled or unmounted");
        return false;
      }

      setIsConnecting(true);

      const device = await bleManager.connectToDevice(deviceId, { timeout: 10000 });
      await device.discoverAllServicesAndCharacteristics();

      if (isMountedRef.current) {
        setConnectedDevice(device);
        reconnectionAttempts.current = 0;
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY_MS;
        setupDisconnectListener(device);
        setupPingInterval();
        Alert.alert("Reconnected", `Connected to ${deviceName || "device"}.`);
        router.push({
          pathname: "/dashboard",
          params: { deviceName: deviceName || "device" },
        });
        console.log(`Reconnected to ${deviceName || device.id}`);
      }

      clearTimeout(reconnectionTimeout);
      return true;
    } catch (error) {
      console.error(`Reconnection attempt ${reconnectionAttempts.current + 1}:`, error);
      reconnectionAttempts.current++;

      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 10000);

      if (isMountedRef.current) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return attemptReconnection(deviceId, deviceName);
      }

      clearTimeout(reconnectionTimeout);
      console.log("Reconnection aborted: component unmounted");
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsConnecting(false);
      }
      isReconnectingRef.current = false;
    }
  };

  const setupDisconnectListener = (device: Device) => {
    if (disconnectListenerRef.current) {
      disconnectListenerRef.current.remove();
    }

    disconnectListenerRef.current = device.onDisconnected(
      async (error, disconnectedDevice) => {
        if (!isMountedRef.current) return;

        console.log("Device disconnected:", disconnectedDevice?.id);
        if (error) {
          console.error("Disconnect error:", error);
        }

        cleanupConnection();
        await deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
        await deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);

        if (disconnectedDevice && !isReconnectingRef.current) {
          const deviceName =
            disconnectedDevice.name ||
            disconnectedDevice.localName ||
            "unknown";
          attemptReconnection(disconnectedDevice.id, deviceName);
        }
      }
    );
  };

  const setupPingInterval = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    let isPinging = false;
    pingIntervalRef.current = setInterval(async () => {
      if (connectedDevice && isMountedRef.current && !isPinging) {
        isPinging = true;
        try {
          const isConnected = await checkConnection(connectedDevice);
          if (isConnected) {
            await getRSSI();
            console.log("Ping successful");
          }
        } catch (error) {
          console.warn("Ping failed:", error);
        } finally {
          isPinging = false;
        }
      }
    }, PING_INTERVAL_MS);
  };

  const scanForPeripherals = async () => {
    if (isScanning || scanLockRef.current) {
      console.warn("Scan already in progress");
      return;
    }

    scanLockRef.current = true;

    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        scanLockRef.current = false;
        console.log("Scan aborted: permissions denied");
        return;
      }

      const isBluetoothEnabled = await checkBluetoothState();
      if (!isBluetoothEnabled || !isMountedRef.current) {
        scanLockRef.current = false;
        console.log("Scan aborted: Bluetooth disabled or unmounted");
        return;
      }

      setIsScanning(true);
      setAllDevices([]);

      await storeData(STORAGE_KEYS.SCAN_TIMESTAMP, new Date().toISOString());

      const deviceMap = new Map<string, Device>();

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (!isMountedRef.current) {
          bleManager.stopDeviceScan();
          console.log("Scan stopped: component unmounted");
          return;
        }

        if (error) {
          console.error("Scan error:", error);
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
          console.log(`Found device: ${device.name || device.id}`);
        }
      });

      setTimeout(() => {
        if (isMountedRef.current) {
          bleManager.stopDeviceScan();
          setIsScanning(false);
          scanLockRef.current = false;
          console.log("Scan completed");
        }
      }, SCAN_DURATION_MS);
    } catch (error) {
      console.error("Scan failed:", error);
      Alert.alert("Scan Error", "Failed to scan for devices.");
      setIsScanning(false);
      scanLockRef.current = false;
    }
  };

  const disconnectDevice = async () => {
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        console.log("Device disconnected successfully");
      } catch (error) {
        console.warn("Disconnect error:", error);
      }
    }
    cleanupConnection();
    await deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
    await deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
  };

  const connectToDevice = async (device: Device) => {
    if (isConnecting) {
      console.warn("Connection already in progress");
      return false;
    }

    if (!device?.id) {
      console.error("Invalid device");
      return false;
    }

    setIsConnecting(true);

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
        console.log("Connection aborted: component unmounted");
        return false;
      }

      setConnectedDevice(deviceConnection);
      const deviceName = device.name || device.localName || device.id;
      await setConnectedDeviceName(deviceName);
      await storeData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID, device.id);

      Alert.alert("Connected", `Connected to ${deviceName}`);
      setupDisconnectListener(deviceConnection);
      setupPingInterval();

      const lastDeviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
      const isFirstConnection = !lastDeviceId || lastDeviceId !== device.id;
      const pathname = isFirstConnection ? "/connected" : "/dashboard";
      router.push({
        pathname,
        params: { deviceName },
      });
      console.log(`Connected to ${deviceName}, navigating to ${pathname}`);

      return true;
    } catch (error) {
      console.error("Connection error:", error);
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
      }
    }
  };

  const getRSSI = async (): Promise<number | null> => {
    if (!connectedDevice) return null;
    try {
      const updatedDevice = await connectedDevice.readRSSI();
      console.log(`RSSI: ${updatedDevice.rssi}`);
      return updatedDevice.rssi ?? null;
    } catch (error) {
      console.error("RSSI read error:", error);
      return null;
    }
  };

  const stopScan = async () => {
    try {
      bleManager.stopDeviceScan();
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
      console.log("Scan stopped successfully");
    } catch (error) {
      console.error("Failed to stop scan:", error);
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
    }
  };

  const processNextCommand = async () => {
    if (isProcessingCommand || commandQueueRef.current.length === 0) return;

    setIsProcessingCommand(true);
    const { angle1, angle2, resolve, reject } = commandQueueRef.current.shift()!;

    if (!connectedDevice) {
      reject(new Error("No device connected"));
      setIsProcessingCommand(false);
      processNextCommand();
      console.log("Command rejected: no device connected");
      return;
    }

    const isConnected = await checkConnection(connectedDevice);
    if (!isConnected) {
      reject(new Error("Device disconnected"));
      setIsProcessingCommand(false);
      processNextCommand();
      console.log("Command rejected: device disconnected");
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error("Command timeout"));
      setIsProcessingCommand(false);
      processNextCommand();
      console.log("Command timed out");
    }, COMMAND_TIMEOUT_MS);

    try {
      const jsonData = JSON.stringify({ a1: angle1, a2: angle2 });
      const encodedData = base64.encode(jsonData);
      console.log(`Sending data: ${jsonData}`);

      const services = await connectedDevice.services();
      let characteristicFound = false;

      for (const service of services) {
        const characteristics = await service.characteristics();
        const writableChar = characteristics.find(c => c.isWritableWithoutResponse);
        if (writableChar) {
          await connectedDevice.writeCharacteristicWithoutResponseForService(
            service.uuid,
            writableChar.uuid,
            encodedData
          );
          characteristicFound = true;
          console.log(`Wrote to service ${service.uuid}, characteristic ${writableChar.uuid}`);
          break;
        }
      }

      if (!characteristicFound) {
        throw new Error("No writable characteristic found");
      }

      clearTimeout(timeout);
      resolve(true);
      console.log("Command executed successfully");
    } catch (error) {
      clearTimeout(timeout);
      console.error("Write error:", error);
      reject(error);

      const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
      const name = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
      if (deviceId && name && !isReconnectingRef.current) {
        attemptReconnection(deviceId, name);
      }
    } finally {
      setIsProcessingCommand(false);
      processNextCommand();
    }
  };

  const writeData = async (angle1: number, angle2: number) => {
    if (
      typeof angle1 !== "number" ||
      typeof angle2 !== "number" ||
      angle1 < 0 ||
      angle1 > 360 ||
      angle2 < 0 ||
      angle2 > 360
    ) {
      console.error("Invalid angle data: angles must be between 0 and 360");
      Alert.alert("Error", "Angles must be between 0 and 360 degrees");
      return false;
    }

    return new Promise<boolean>((resolve, reject) => {
      commandQueueRef.current.push({ angle1, angle2, resolve, reject });
      console.log(`Queued command: a1=${angle1}, a2=${angle2}`);
      processNextCommand();
    });
  };

  // Effect Hooks
  useEffect(() => {
    const handleAppStateChange = async (state: AppStateStatus) => {
      if (!isMountedRef.current) return;

      if (state === "active") {
        const isBluetoothEnabled = await checkBluetoothState();
        if (!isBluetoothEnabled) return;

        if (connectedDevice && !isReconnectingRef.current) {
          const isConnected = await checkConnection(connectedDevice);
          if (!isConnected && !isReconnectingRef.current) {
            const deviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
            const deviceName = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
            if (deviceId && deviceName) {
              Alert.alert("Reconnecting...", `Trying to reconnect to ${deviceName}.`);
              attemptReconnection(deviceId, deviceName);
            }
          }
        }
      } else if (state === "background" || state === "inactive") {
        bleManager.stopDeviceScan();
        setIsScanning(false);
        scanLockRef.current = false;
        console.log("App in background, stopped scanning");
      }
    };

    const appStateSub = AppState.addEventListener("change", handleAppStateChange);

    if (connectedDevice) {
      setupPingInterval();
    }

    return () => {
      appStateSub.remove();
      console.log("App state listener removed");
    };
  }, [connectedDevice]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (bluetoothStateSub.current) {
        bluetoothStateSub.current.remove();
        bluetoothStateSub.current = null;
      }
      if (disconnectListenerRef.current) {
        disconnectListenerRef.current.remove();
        disconnectListenerRef.current = null;
      }

      bleManager.stopDeviceScan();
      console.log("Component unmounted, cleaned up resources");
    };
  }, []);

  return (
    <BLEContext.Provider
      value={{
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
      }}
    >
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