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

// === CONSTANTS ===
const STORAGE_KEYS = {
  USER_LOCATION: "user_location",
  CONNECTED_DEVICE_NAME: "connected_device_name",
  LAST_CONNECTED_DEVICE_ID: "last_connected_device_id",
  SCAN_TIMESTAMP: "last_scan_timestamp",
} as const;

const BLE_CONFIG = {
  SERVICE_UUID: "12345678-1234-1234-1234-1234567890ab",
  CHARACTERISTIC_UUID: "abcd1234-1234-1234-1234-abcdef123456",
  MIN_RSSI: -80,
  SCAN_DURATION_MS: 10000,
  PING_INTERVAL_MS: 30000,
  PING_TIMEOUT_MS: 5000,
  MAX_RECONNECTION_ATTEMPTS: 3,
  INITIAL_RECONNECT_DELAY_MS: 2000,
  COMMAND_TIMEOUT_MS: 5000,
  SCAN_COOLDOWN_MS: 5000,
  MAX_RETRIES_PER_MINUTE: 5,
  CIRCUIT_BREAKER_TIMEOUT_MS: 60000,
  MTU_SIZE: 512,
  CONNECTION_TIMEOUT_MS: 10000,
} as const;

// === TYPES ===
interface Command {
  angle1: number;
  angle2: number;
  resolve: (value: boolean) => void;
  reject: (reason: Error) => void;
  timestamp: number;
  id: string;
}

interface StorageOperation {
  key: string;
  value?: string;
  type: 'set' | 'get' | 'delete';
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  id: string;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface BLEContextType {
  allDevices: Device[];
  connectedDevice: Device | null;
  isScanning: boolean;
  isConnecting: boolean;
  connectionState: ConnectionState;
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

// === UTILITY CLASSES ===
class Logger {
  private static instance: Logger;
  
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const emoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    }[level];
    
    console.log(`${emoji} [${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void { this.log('debug', message, ...args); }
  info(message: string, ...args: any[]): void { this.log('info', message, ...args); }
  warn(message: string, ...args: any[]): void { this.log('warn', message, ...args); }
  error(message: string, ...args: any[]): void { this.log('error', message, ...args); }
}

class ValidationUtil {
  static validateAngle(angle: number): boolean {
    return typeof angle === 'number' && !isNaN(angle) && angle >= 0 && angle <= 360;
  }

  static validateDevice(device: Device): boolean {
    return !!(device?.id && (device.name || device.localName));
  }

  static validateString(str: string): boolean {
    return typeof str === 'string' && str.trim().length > 0;
  }

  static sanitizeString(str: string): string {
    return str?.trim() || '';
  }

  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

class StorageManager {
  private queue: StorageOperation[] = [];
  private processing = false;
  private logger = Logger.getInstance();

  async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    while (this.queue.length > 0) {
      const operation = this.queue.shift();
      if (!operation) continue;

      try {
        await this.executeOperation(operation);
      } catch (error) {
        this.logger.error(`Storage operation failed for ${operation.key}:`, error);
        operation.reject(error as Error);
      }
    }
    
    this.processing = false;
  }

  private async executeOperation(operation: StorageOperation): Promise<void> {
    const { key, value, type, resolve, reject } = operation;
    
    try {
      switch (type) {
        case 'set':
          if (!value) throw new Error('Value required for set operation');
          await AsyncStorage.setItem(key, value);
          resolve(null);
          break;
        case 'get':
          const result = await AsyncStorage.getItem(key);
          resolve(result);
          break;
        case 'delete':
          await AsyncStorage.removeItem(key);
          resolve(null);
          break;
        default:
          throw new Error(`Unknown operation type: ${type}`);
      }
    } catch (error) {
      reject(error as Error);
    }
  }

  enqueue(operation: Omit<StorageOperation, 'id'>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        ...operation,
        id: ValidationUtil.generateId(),
        resolve,
        reject
      });
      this.processQueue();
    });
  }

  clear(): void {
    this.queue.forEach(op => op.reject(new Error('Storage manager cleared')));
    this.queue = [];
    this.processing = false;
  }
}

class CommandQueue {
  private queue: Command[] = [];
  private processing = false;
  private logger = Logger.getInstance();

  enqueue(command: Omit<Command, 'id'>): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // Check for duplicate commands
      const lastCommand = this.queue[this.queue.length - 1];
      if (this.isDuplicate(command, lastCommand)) {
        this.logger.debug('Duplicate command detected, resolving immediately');
        resolve(true);
        return;
      }

      this.queue.push({
        ...command,
        id: ValidationUtil.generateId(),
        resolve,
        reject
      });
      
      this.logger.debug(`Command queued: a1=${command.angle1}, a2=${command.angle2}, queue length=${this.queue.length}`);
    });
  }

  dequeue(): Command | undefined {
    return this.queue.shift();
  }

  clear(): void {
    this.queue.forEach(cmd => cmd.reject(new Error('Command queue cleared')));
    this.queue = [];
    this.processing = false;
  }

  size(): number {
    return this.queue.length;
  }

  setProcessing(processing: boolean): void {
    this.processing = processing;
  }

  isProcessing(): boolean {
    return this.processing;
  }

  private isDuplicate(newCommand: Omit<Command, 'id'>, lastCommand?: Command): boolean {
    if (!lastCommand) return false;
    
    return lastCommand.angle1 === newCommand.angle1 && 
           lastCommand.angle2 === newCommand.angle2 && 
           newCommand.timestamp - lastCommand.timestamp < 100;
  }
}

class CircuitBreaker {
  private isOpen = false;
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly threshold: number;
  private readonly timeout: number;
  private logger = Logger.getInstance();

  constructor(threshold = BLE_CONFIG.MAX_RETRIES_PER_MINUTE, timeout = BLE_CONFIG.CIRCUIT_BREAKER_TIMEOUT_MS) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen) {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.reset();
        this.logger.info('Circuit breaker reset - attempting operation');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.isOpen = true;
      this.logger.warn(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  private reset(): void {
    this.isOpen = false;
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }

  getState(): { isOpen: boolean; failureCount: number } {
    return { isOpen: this.isOpen, failureCount: this.failureCount };
  }
}

// === MAIN CONTEXT ===
const BLEContext = createContext<BLEContextType | undefined>(undefined);

export const BLEProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // Refs and managers
  const isMountedRef = useRef(true);
  const bleManagerRef = useRef<BleManager>(new BleManager());
  const storageManager = useRef<StorageManager>(new StorageManager());
  const commandQueue = useRef<CommandQueue>(new CommandQueue());
  const circuitBreaker = useRef<CircuitBreaker>(new CircuitBreaker());
  const logger = useRef<Logger>(Logger.getInstance());
  
  // Connection management refs
  const reconnectionAttempts = useRef(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scanLockRef = useRef(false);
  const reconnectDelayRef = useRef(BLE_CONFIG.INITIAL_RECONNECT_DELAY_MS);
  const isReconnectingRef = useRef(false);
  const lastScanTimeRef = useRef(0);
  const lastPingTimeRef = useRef(0);
  const subscriptionsRef = useRef<Subscription[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // === STORAGE OPERATIONS ===
  const storeData = useCallback(async (key: string, value: string): Promise<void> => {
    if (!ValidationUtil.validateString(key) || !ValidationUtil.validateString(value)) {
      throw new Error('Invalid key or value for storage operation');
    }
    
    await storageManager.current.enqueue({
      key: key.trim(),
      value: value.trim(),
      type: 'set',
      resolve: () => {},
      reject: () => {}
    });
  }, []);

  const getData = useCallback(async (key: string): Promise<string | null> => {
    if (!ValidationUtil.validateString(key)) {
      logger.current.warn('Invalid key for getData operation');
      return null;
    }
    
    return storageManager.current.enqueue({
      key: key.trim(),
      type: 'get',
      resolve: () => {},
      reject: () => {}
    });
  }, []);

  const deleteData = useCallback(async (key: string): Promise<void> => {
    if (!ValidationUtil.validateString(key)) {
      throw new Error('Invalid key for delete operation');
    }
    
    await storageManager.current.enqueue({
      key: key.trim(),
      type: 'delete',
      resolve: () => {},
      reject: () => {}
    });
  }, []);

  // === LOCATION AND DEVICE NAME OPERATIONS ===
  const setUserLocation = useCallback(async (location: string): Promise<void> => {
    const sanitized = ValidationUtil.sanitizeString(location);
    if (!sanitized) {
      throw new Error('Invalid location provided');
    }
    await storeData(STORAGE_KEYS.USER_LOCATION, sanitized);
  }, [storeData]);

  const getUserLocation = useCallback(async (): Promise<string> => {
    const location = await getData(STORAGE_KEYS.USER_LOCATION);
    return location || "Unknown";
  }, [getData]);

  const setConnectedDeviceName = useCallback(async (name: string): Promise<void> => {
    const sanitized = ValidationUtil.sanitizeString(name);
    if (!sanitized) {
      throw new Error('Invalid device name provided');
    }
    await storeData(STORAGE_KEYS.CONNECTED_DEVICE_NAME, sanitized);
  }, [storeData]);

  const getConnectedDeviceName = useCallback(async (): Promise<string> => {
    const name = await getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME);
    return name || "Unknown Device";
  }, [getData]);

  // === PERMISSION MANAGEMENT ===
  const requestPermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== "android") return true;

    try {
      const apiLevel = Platform.Version as number;
      const permissions = apiLevel < 31
        ? [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
        : [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          ];

      const results = await Promise.all(
        permissions.map(permission => 
          PermissionsAndroid.request(permission, {
            title: `${permission.split(".").pop()} Permission`,
            message: `This app needs ${permission.split(".").pop()} permission to work properly.`,
            buttonPositive: "OK",
          })
        )
      );

      const allGranted = results.every(result => result === PermissionsAndroid.RESULTS.GRANTED);
      
      if (!allGranted) {
        const hasNeverAskAgain = results.some(result => result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
        
        if (hasNeverAskAgain) {
          Alert.alert(
            "Permission Required",
            "Please enable Bluetooth permissions in device settings to use this feature.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Settings", onPress: () => Linking.openSettings() },
            ]
          );
        } else {
          Alert.alert("Permission Denied", "Bluetooth permissions are required for device connection.");
        }
        return false;
      }

      logger.current.info('All permissions granted successfully');
      return true;
    } catch (error) {
      logger.current.error('Permission request failed:', error);
      return false;
    }
  }, []);

  // === BLUETOOTH STATE MANAGEMENT ===
  const checkBluetoothState = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      let subscription: Subscription | null = null;
      let resolved = false;

      const cleanup = () => {
        if (subscription && !resolved) {
          subscription.remove();
          subscription = null;
        }
      };

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          logger.current.warn('Bluetooth state check timed out');
          resolve(false);
        }
      }, 5000);

      try {
        subscription = bleManagerRef.current.onStateChange((state) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            cleanup();

            if (state === "PoweredOn") {
              logger.current.info('Bluetooth is powered on');
              resolve(true);
            } else {
              logger.current.warn(`Bluetooth state: ${state}`);
              Alert.alert("Bluetooth Required", "Please turn on Bluetooth to use this feature.");
              resolve(false);
            }
          }
        }, true);
      } catch (error) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          logger.current.error('Failed to check Bluetooth state:', error);
          resolve(false);
        }
      }
    });
  }, []);

  // === CONNECTION MANAGEMENT ===
  const checkConnection = useCallback(async (device: Device | null): Promise<boolean> => {
    if (!device?.id) return false;

    try {
      const isConnected = await bleManagerRef.current.isDeviceConnected(device.id);
      
      if (!isConnected && isMountedRef.current) {
        logger.current.warn(`Device ${device.id} is not connected`);
        setConnectedDevice(null);
        setConnectionState('disconnected');
        
        // Clean up stored connection data
        try {
          await Promise.all([
            deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME),
            deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID)
          ]);
        } catch (error) {
          logger.current.error('Failed to clean up connection data:', error);
        }
      }
      
      return isConnected;
    } catch (error) {
      logger.current.error('Connection check failed:', error);
      return false;
    }
  }, [deleteData]);

  const cleanupConnection = useCallback((): void => {
    logger.current.info('Starting connection cleanup');
    
    // Clear all subscriptions
    subscriptionsRef.current.forEach(sub => {
      try {
        sub.remove();
      } catch (error) {
        logger.current.warn('Failed to remove subscription:', error);
      }
    });
    subscriptionsRef.current = [];
    
    // Clear ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Clear command queue
    commandQueue.current.clear();
    
    // Reset connection state
    if (isMountedRef.current) {
      setConnectedDevice(null);
      setConnectionState('disconnected');
    }
    
    // Reset connection attempts
    reconnectionAttempts.current = 0;
    reconnectDelayRef.current = BLE_CONFIG.INITIAL_RECONNECT_DELAY_MS;
    isReconnectingRef.current = false;
    
    logger.current.info('Connection cleanup completed');
  }, []);

  // === RECONNECTION LOGIC ===
  const attemptReconnection = useCallback(async (deviceId: string, deviceName: string): Promise<void> => {
    if (isReconnectingRef.current || 
        reconnectionAttempts.current >= BLE_CONFIG.MAX_RECONNECTION_ATTEMPTS ||
        !isMountedRef.current) {
      logger.current.warn('Reconnection aborted: conditions not met');
      return;
    }

    isReconnectingRef.current = true;
    setConnectionState('reconnecting');
    reconnectionAttempts.current += 1;
    
    const delay = reconnectDelayRef.current * Math.pow(2, reconnectionAttempts.current - 1);
    logger.current.info(`Attempting reconnection ${reconnectionAttempts.current}/${BLE_CONFIG.MAX_RECONNECTION_ATTEMPTS} after ${delay}ms`);

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      const device = await circuitBreaker.current.execute(async () => {
        return bleManagerRef.current.connectToDevice(deviceId, { 
          timeout: BLE_CONFIG.CONNECTION_TIMEOUT_MS 
        });
      });

      await device.discoverAllServicesAndCharacteristics();
      await device.requestMTU(BLE_CONFIG.MTU_SIZE);

      if (!isMountedRef.current) {
        await device.cancelConnection();
        return;
      }

      // Update state
      setConnectedDevice(device);
      setConnectionState('connected');
      
      // Store connection info
      await Promise.all([
        setConnectedDeviceName(deviceName),
        storeData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID, deviceId)
      ]);
      
      // Setup monitoring
      setupDisconnectListener(device);
      setupPingInterval();
      
      // Reset counters
      reconnectionAttempts.current = 0;
      reconnectDelayRef.current = BLE_CONFIG.INITIAL_RECONNECT_DELAY_MS;
      
      logger.current.info(`Successfully reconnected to ${deviceName}`);
      Alert.alert("Reconnected", `Successfully reconnected to ${deviceName}`);
      
    } catch (error) {
      logger.current.error(`Reconnection attempt ${reconnectionAttempts.current} failed:`, error);
      
      if (reconnectionAttempts.current >= BLE_CONFIG.MAX_RECONNECTION_ATTEMPTS) {
        logger.current.error('Max reconnection attempts reached, giving up');
        cleanupConnection();
      } else {
        // Retry with exponential backoff
        setTimeout(() => attemptReconnection(deviceId, deviceName), 1000);
      }
    } finally {
      isReconnectingRef.current = false;
    }
  }, [setConnectedDeviceName, storeData, cleanupConnection]);

  // === DEVICE MONITORING ===
  const setupDisconnectListener = useCallback((device: Device): void => {
    try {
      const disconnectSub = device.onDisconnected(async (error, disconnectedDevice) => {
        logger.current.info(`Device ${disconnectedDevice?.id} disconnected`, error ? `with error: ${error}` : '');
        
        await cleanupConnection();
        
        // Attempt reconnection if it wasn't a manual disconnect
        if (!error && isMountedRef.current) {
          try {
            const [deviceId, deviceName] = await Promise.all([
              getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID),
              getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME)
            ]);
            
            if (deviceId && deviceName) {
              logger.current.info('Initiating automatic reconnection');
              attemptReconnection(deviceId, deviceName);
            }
          } catch (error) {
            logger.current.error('Failed to get reconnection data:', error);
          }
        }
      });

      subscriptionsRef.current.push(disconnectSub);
    } catch (error) {
      logger.current.error('Failed to setup disconnect listener:', error);
    }
  }, [cleanupConnection, getData, attemptReconnection]);

  const setupPingInterval = useCallback((): void => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }

    pingIntervalRef.current = setInterval(async () => {
      if (!connectedDevice || !isMountedRef.current) return;
      
      // Prevent overlapping pings
      if (Date.now() - lastPingTimeRef.current < BLE_CONFIG.PING_TIMEOUT_MS) return;
      
      lastPingTimeRef.current = Date.now();
      
      try {
        await connectedDevice.readRSSI();
        logger.current.debug('Ping successful');
      } catch (error) {
        logger.current.warn('Ping failed:', error);
        
        // Trigger reconnection on ping failure
        try {
          const [deviceId, deviceName] = await Promise.all([
            getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID),
            getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME)
          ]);
          
          if (deviceId && deviceName && !isReconnectingRef.current) {
            logger.current.info('Ping failure detected, initiating reconnection');
            cleanupConnection();
            attemptReconnection(deviceId, deviceName);
          }
        } catch (storageError) {
          logger.current.error('Failed to get reconnection data after ping failure:', storageError);
        }
      }
    }, BLE_CONFIG.PING_INTERVAL_MS);

    // Add cleanup to subscriptions
    subscriptionsRef.current.push({
      remove: () => {
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
      }
    });
  }, [connectedDevice, getData, cleanupConnection, attemptReconnection]);

  // === COMMAND PROCESSING ===
  const processNextCommand = useCallback(async (): Promise<void> => {
    if (commandQueue.current.isProcessing() || commandQueue.current.size() === 0) {
      return;
    }

    commandQueue.current.setProcessing(true);

    const command = commandQueue.current.dequeue();
    if (!command) {
      commandQueue.current.setProcessing(false);
      return;
    }

    const { angle1, angle2, resolve, reject } = command;

    try {
      // Validate connection
      if (!connectedDevice) {
        throw new Error("No device connected");
      }

      const isConnected = await checkConnection(connectedDevice);
      if (!isConnected) {
        throw new Error("Device disconnected");
      }

      // Execute command with circuit breaker
      await circuitBreaker.current.execute(async () => {
        const jsonData = JSON.stringify({ a1: angle1, a2: angle2 });
        const encodedData = base64.encode(jsonData);
        
        logger.current.debug(`Sending command: ${jsonData}`);
        
        await connectedDevice.writeCharacteristicWithoutResponseForService(
          BLE_CONFIG.SERVICE_UUID,
          BLE_CONFIG.CHARACTERISTIC_UUID,
          encodedData
        );
      });

      resolve(true);
      logger.current.debug(`Command executed successfully: a1=${angle1}, a2=${angle2}`);
      
    } catch (error) {
      logger.current.error('Command execution failed:', error);
      reject(error as Error);
      
      // Trigger reconnection on write failure
      if (error instanceof Error && error.message.includes('disconnected')) {
        try {
          const [deviceId, deviceName] = await Promise.all([
            getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID),
            getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME)
          ]);
          
          if (deviceId && deviceName && !isReconnectingRef.current) {
            cleanupConnection();
            attemptReconnection(deviceId, deviceName);
          }
        } catch (storageError) {
          logger.current.error('Failed to get reconnection data after write failure:', storageError);
        }
      }
    } finally {
      commandQueue.current.setProcessing(false);
      
      // Process next command after delay
      setTimeout(() => processNextCommand(), 50);
    }
  }, [connectedDevice, checkConnection, getData, cleanupConnection, attemptReconnection]);

  const writeData = useCallback(async (angle1: number, angle2: number): Promise<boolean> => {
    if (!ValidationUtil.validateAngle(angle1) || !ValidationUtil.validateAngle(angle2)) {
      const error = new Error("Angles must be valid numbers between 0 and 360 degrees");
      logger.current.error(error.message);
      Alert.alert("Invalid Input", error.message);
      return false;
    }

    if (circuitBreaker.current.getState().isOpen) {
      logger.current.warn('Command rejected: circuit breaker is open');
      return false;
    }

    try {
      const result = await commandQueue.current.enqueue({
        angle1,
        angle2,
        resolve: () => {},
        reject: () => {},
        timestamp: Date.now()
      });
      
      // Trigger processing
      processNextCommand();
      
      return result;
    } catch (error) {
      logger.current.error('Failed to queue command:', error);
      return false;
    }
  }, [processNextCommand]);

  // === SCANNING ===
  const scanForPeripherals = useCallback(async (): Promise<void> => {
    if (isScanning || 
        scanLockRef.current || 
        connectionState === 'connected' || 
        (Date.now() - lastScanTimeRef.current < BLE_CONFIG.SCAN_COOLDOWN_MS)) {
      logger.current.warn('Scan aborted: conditions not met');
      return;
    }

    scanLockRef.current = true;
    lastScanTimeRef.current = Date.now();
    
    try {
      logger.current.info('Starting device scan');
      
      const [hasPermissions, isBluetoothEnabled] = await Promise.all([
        requestPermissions(),
        checkBluetoothState()
      ]);

      if (!hasPermissions || !isBluetoothEnabled || !isMountedRef.current) {
        logger.current.warn('Scan prerequisites not met');
        return;
      }

      setIsScanning(true);
      setAllDevices([]);

      await storeData(STORAGE_KEYS.SCAN_TIMESTAMP, new Date().toISOString());

      const deviceMap = new Map<string, Device>();

      bleManagerRef.current.startDeviceScan(null, null, (error, device) => {
        if (!isMountedRef.current) {
          bleManagerRef.current.stopDeviceScan();
          return;
        }

        if (error) {
          logger.current.error('Scan error:', error);
          setIsScanning(false);
          bleManagerRef.current.stopDeviceScan();
          return;
        }

        if (device && 
            ValidationUtil.validateDevice(device) &&
            device.rssi && 
            device.rssi >= BLE_CONFIG.MIN_RSSI &&
            !deviceMap.has(device.id)) {
          
          deviceMap.set(device.id, device);
          setAllDevices(Array.from(deviceMap.values()));
          logger.current.debug(`Found device: ${device.name || device.id} (RSSI: ${device.rssi})`);
        }
      });

      // Auto-stop scan after duration
      setTimeout(() => {
        if (isMountedRef.current) {
          bleManagerRef.current.stopDeviceScan();
          setIsScanning(false);
          logger.current.info('Scan completed');
        }
      }, BLE_CONFIG.SCAN_DURATION_MS);

    } catch (error) {
      logger.current.error('Scan failed:', error);
      Alert.alert("Scan Error", "Failed to scan for devices. Please check Bluetooth settings.");
      setIsScanning(false);
    } finally {
      scanLockRef.current = false;
    }
  }, [requestPermissions, checkBluetoothState, storeData, isScanning, connectionState]);

  const stopScan = useCallback(async (): Promise<void> => {
    try {
      bleManagerRef.current.stopDeviceScan();
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
      logger.current.info('Scan stopped successfully');
    } catch (error) {
      logger.current.error('Failed to stop scan:', error);
      if (isMountedRef.current) {
        setIsScanning(false);
        scanLockRef.current = false;
      }
    }
  }, []);

  // === CONNECTION ===
  const disconnectDevice = useCallback(async (): Promise<void> => {
    logger.current.info('Disconnecting device');
    
    if (connectedDevice) {
      try {
        await connectedDevice.cancelConnection();
        logger.current.info('Device disconnected successfully');
      } catch (error) {
        logger.current.warn('Disconnect error:', error);
      }
    }
    
    cleanupConnection();
    
    // Clean up stored data
    try {
      await Promise.all([
        deleteData(STORAGE_KEYS.CONNECTED_DEVICE_NAME),
        deleteData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID)
      ]);
    } catch (error) {
      logger.current.error('Failed to clean up stored connection data:', error);
    }
  }, [connectedDevice, cleanupConnection, deleteData]);

  const connectToDevice = useCallback(async (device: Device): Promise<boolean> => {
    if (isConnecting || connectionState === 'connecting') {
      logger.current.warn('Connection already in progress');
      return false;
    }

    if (!ValidationUtil.validateDevice(device)) {
      logger.current.error('Invalid device provided for connection');
      return false;
    }

    logger.current.info(`Attempting to connect to device: ${device.name || device.id}`);
    setIsConnecting(true);
    setConnectionState('connecting');

    try {
      // Stop scanning
      await stopScan();

      // Disconnect current device if any
      if (connectedDevice) {
        await disconnectDevice();
      }

      // Connect with timeout and circuit breaker
      const deviceConnection = await circuitBreaker.current.execute(async () => {
        return bleManagerRef.current.connectToDevice(device.id, {
          timeout: BLE_CONFIG.CONNECTION_TIMEOUT_MS,
        });
      });

      await deviceConnection.discoverAllServicesAndCharacteristics();
      await deviceConnection.requestMTU(BLE_CONFIG.MTU_SIZE);

      if (!isMountedRef.current) {
        await deviceConnection.cancelConnection();
        logger.current.warn('Connection aborted: component unmounted');
        return false;
      }

      // Update state
      setConnectedDevice(deviceConnection);
      setConnectionState('connected');
      
      const deviceName = device.name || device.localName || device.id;
      
      // Store connection data
      await Promise.all([
        setConnectedDeviceName(deviceName),
        storeData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID, device.id)
      ]);
      
      // Setup monitoring
      setupDisconnectListener(deviceConnection);
      setupPingInterval();

      logger.current.info(`Successfully connected to ${deviceName}`);
      Alert.alert("Connected", `Successfully connected to ${deviceName}`);

      // Navigate to appropriate screen
      try {
        const lastDeviceId = await getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID);
        const isFirstConnection = !lastDeviceId || lastDeviceId !== device.id;
        const pathname = isFirstConnection ? "/connected" : "/dashboard";
        
        router.push({
          pathname,
          params: { deviceName },
        });
        
        logger.current.info(`Navigated to ${pathname}`);
      } catch (navError) {
        logger.current.error('Navigation failed:', navError);
      }
      
      return true;
      
    } catch (error) {
      logger.current.error('Connection failed:', error);
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
  }, [isConnecting, connectionState, connectedDevice, stopScan, disconnectDevice, setConnectedDeviceName, storeData, getData, setupDisconnectListener, setupPingInterval]);

  const getRSSI = useCallback(async (): Promise<number | null> => {
    if (!connectedDevice) return null;
    
    try {
      const updatedDevice = await connectedDevice.readRSSI();
      const rssi = updatedDevice.rssi ?? null;
      logger.current.debug(`RSSI: ${rssi}`);
      return rssi;
    } catch (error) {
      logger.current.error('RSSI read failed:', error);
      return null;
    }
  }, [connectedDevice]);

  // === CONTEXT VALUE ===
  const contextValue = useMemo(
    () => ({
      allDevices,
      connectedDevice,
      isScanning,
      isConnecting,
      connectionState,
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
      connectionState,
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

  // === EFFECTS ===
  useEffect(() => {
    isMountedRef.current = true;
    logger.current.info('BLE Provider mounted');

    return () => {
      logger.current.info('BLE Provider unmounting, performing cleanup');
      isMountedRef.current = false;
      
      // Cleanup subscriptions
      subscriptionsRef.current.forEach(sub => {
        try {
          sub.remove();
        } catch (error) {
          logger.current.warn('Failed to remove subscription during cleanup:', error);
        }
      });
      subscriptionsRef.current = [];
      
      // Stop scanning
      try {
        bleManagerRef.current.stopDeviceScan();
      } catch (error) {
        logger.current.warn('Failed to stop scan during cleanup:', error);
      }
      
      // Clear intervals
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      // Clear queues and managers
      commandQueue.current.clear();
      storageManager.current.clear();
      
      logger.current.info('BLE Provider cleanup completed');
    };
  }, []);

  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
      if (!isMountedRef.current || appStateRef.current === nextAppState) return;

      logger.current.info(`App state changed from ${appStateRef.current} to ${nextAppState}`);
      appStateRef.current = nextAppState;

      if (nextAppState === "active") {
        try {
          const isBluetoothEnabled = await checkBluetoothState();
          if (!isBluetoothEnabled) return;

          if (connectedDevice && 
              !isReconnectingRef.current && 
              connectionState === 'connected') {
            
            const isConnected = await checkConnection(connectedDevice);
            if (!isConnected && !isReconnectingRef.current) {
              const [deviceId, deviceName] = await Promise.all([
                getData(STORAGE_KEYS.LAST_CONNECTED_DEVICE_ID),
                getData(STORAGE_KEYS.CONNECTED_DEVICE_NAME)
              ]);
              
              if (deviceId && deviceName) {
                logger.current.info('App became active, attempting reconnection');
                Alert.alert("Reconnecting...", `Attempting to reconnect to ${deviceName}`);
                attemptReconnection(deviceId, deviceName);
              }
            }
          }
        } catch (error) {
          logger.current.error('App state change handling failed:', error);
        }
      } else if (nextAppState === "background" || nextAppState === "inactive") {
        // Stop scanning when app goes to background
        try {
          await stopScan();
          logger.current.info('Stopped scanning due to app backgrounding');
        } catch (error) {
          logger.current.error('Failed to stop scan on app background:', error);
        }
      }
    };

    const appStateSub = AppState.addEventListener("change", handleAppStateChange);
    subscriptionsRef.current.push(appStateSub);

    return () => {
      appStateSub.remove();
      logger.current.debug('App state listener removed');
    };
  }, [connectedDevice, checkBluetoothState, checkConnection, getData, attemptReconnection, connectionState, stopScan]);

  return (
    <BLEContext.Provider value={contextValue}>
      {children}
    </BLEContext.Provider>
  );
};

export const useBLE = (): BLEContextType => {
  const context = useContext(BLEContext);
  if (!context) {
    throw new Error("useBLE must be used within a BLEProvider");
  }
  return context;
};