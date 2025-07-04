import React, { useState, useEffect, useRef, useCallback } from "react";
import { Text, StyleSheet, NativeModules, DeviceEventEmitter, Platform } from "react-native";

const { RTLSDRModule } = NativeModules;

interface RTLSDRComponentProps {
  frequency: number; // in MHz
  sampleRate?: number; // in samples/sec, default 2048000 (2.048 MSPS)
  gain?: number; // in tenths of dB, default is auto gain (0)
  bufferSize?: number; // samples to read at once, default 16384
  onDataReceived: (samples: number[]) => void;
  onError?: (error: string) => void;
  onDeviceInfo?: (info: any) => void;
}

const RTLSDRComponent: React.FC<RTLSDRComponentProps> = ({
  frequency,
  sampleRate = 2048000,
  gain = 0,
  bufferSize = 16384,
  onDataReceived,
  onError,
  onDeviceInfo
}) => {
  const [handle, setHandle] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isReadingRef = useRef<boolean>(false);
  const currentHandleRef = useRef<number | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const readErrorCountRef = useRef<number>(0);

  // Clean up resources
  const cleanup = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    isReadingRef.current = false;
    
    if (currentHandleRef.current !== null) {
      try {
        await RTLSDRModule.closeDevice(currentHandleRef.current);
        console.log(`Closed RTL-SDR device with handle ${currentHandleRef.current}`);
      } catch (err) {
        console.error("Error closing RTL-SDR device:", err);
      }
      currentHandleRef.current = null;
    }
    
    setHandle(null);
    setIsInitialized(false);
  }, []);

  // Start reading samples
  const startReading = useCallback((h: number) => {
    if (isReadingRef.current || intervalRef.current) return;
    
    isReadingRef.current = true;
    readErrorCountRef.current = 0;
    
    console.log(`Starting to read samples from device handle ${h}, buffer size: ${bufferSize}`);
    
    intervalRef.current = setInterval(async () => {
      if (!isMountedRef.current || !isReadingRef.current) {
        return;
      }
      
      try {
        const samples: number[] = await RTLSDRModule.readSamples(h, bufferSize);
        
        if (isMountedRef.current && samples && samples.length > 0) {
          onDataReceived(samples);
          // Reset error counter on successful read
          if (readErrorCountRef.current > 0) {
            readErrorCountRef.current = 0;
          }
        }
      } catch (err: any) {
        console.error("Error reading samples:", err);
        readErrorCountRef.current++;
        
        // Only show error if we get repeated failures
        if (readErrorCountRef.current >= 3) {
          const errorMsg = "Failed to read samples from device";
          if (isMountedRef.current) {
            setError(errorMsg);
            if (onError) onError(errorMsg);
          }
          
          // If we've had too many consecutive errors, try to recover
          if (readErrorCountRef.current >= 10) {
            console.log("Too many read errors, resetting connection...");
            cleanup().then(() => {
              setRetryCount(prev => prev + 1);
            });
          }
        }
      }
    }, 100);
  }, [onDataReceived, cleanup, bufferSize, onError]);

  // Check if device is present and module is loaded
  const checkModuleAvailable = useCallback(async () => {
    try {
      const isLoaded = await RTLSDRModule.isNativeLibraryLoaded();
      if (!isLoaded) {
        throw new Error("RTL-SDR native library not loaded");
      }
      return true;
    } catch (err) {
      console.error("RTL-SDR module not available:", err);
      return false;
    }
  }, []);

  // Initialize SDR and start reading
  useEffect(() => {
    isMountedRef.current = true;

    // Listen for USB device events
    const usbListener = DeviceEventEmitter.addListener('usbDeviceEvent', (event) => {
      if (event.event === 'usbDeviceReady') {
        console.log("USB device ready event received, retrying connection");
        if (!isInitialized) {
          setRetryCount(prev => prev + 1);
        }
      }
    });

    const initializeSDR = async () => {
      if (isInitialized || !RTLSDRModule) {
        return;
      }

      try {
        setError(null);
        lastErrorRef.current = null;
        
        // First check if module is available
        const moduleAvailable = await checkModuleAvailable();
        if (!moduleAvailable) {
          const errorMsg = "RTL-SDR module not available";
          setError(errorMsg);
          if (onError) onError(errorMsg);
          return;
        }
        
        // Initialize the SDR with current USB file descriptor
        await RTLSDRModule.initializeSDR();
        
        // Get device count
        const deviceCount = await RTLSDRModule.getDeviceCount();
        if (deviceCount <= 0) {
          const errorMsg = "No RTL-SDR devices found";
          setError(errorMsg);
          if (onError) onError(errorMsg);
          return;
        }

        // Get device info if callback is provided
        if (onDeviceInfo) {
          try {
            const deviceName = await RTLSDRModule.getDeviceName(0);
            onDeviceInfo({ 
              deviceName,
              deviceCount, 
              platform: Platform.OS
            });
          } catch (infoErr) {
            console.log("Non-critical error getting device info:", infoErr);
          }
        }

        // Open the first device
        const h = await RTLSDRModule.openDevice(0);
        if (!isMountedRef.current) {
          await RTLSDRModule.closeDevice(h);
          return;
        }

        currentHandleRef.current = h;
        setHandle(h);
        
        // Configure the device
        await RTLSDRModule.setSampleRate(h, sampleRate);
        await RTLSDRModule.setFrequency(h, Math.floor(frequency * 1e6));
        
        // Set gain if provided, otherwise use auto gain
        if (gain > 0) {
          await RTLSDRModule.setGain(h, gain);
        }
        
        await RTLSDRModule.resetBuffer(h);
        
        if (isMountedRef.current) {
          setIsInitialized(true);
          startReading(h);
        }
      } catch (err: any) {
        const errorMsg = `Failed to initialize RTL-SDR: ${err?.message || 'Unknown error'}`;
        console.error("RTL-SDR Initialization Error:", err);
        
        if (isMountedRef.current) {
          setError(errorMsg);
          lastErrorRef.current = errorMsg;
          if (onError) onError(errorMsg);
        }
        
        await cleanup();
      }
    };

    initializeSDR();

    // Clean up on unmount
    return () => {
      isMountedRef.current = false;
      usbListener.remove();
      cleanup();
    };
  }, [cleanup, startReading, checkModuleAvailable, frequency, sampleRate, 
      gain, isInitialized, retryCount, onDeviceInfo, onError]);

  // Update frequency when it changes
  useEffect(() => {
    if (handle && isInitialized && isMountedRef.current) {
      const setFreq = async () => {
        try {
          await RTLSDRModule.setFrequency(handle, Math.floor(frequency * 1e6));
        } catch (err) {
          console.error("Error setting frequency:", err);
          if (isMountedRef.current) {
            const errorMsg = "Failed to set frequency";
            setError(errorMsg);
            if (onError) onError(errorMsg);
          }
        }
      };
      
      setFreq();
    }
  }, [frequency, handle, isInitialized, onError]);

  // Only render error if not handled by parent
  if (error && !onError) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  return null;
};

const styles = StyleSheet.create({
  errorText: {
    color: "red",
    fontSize: 16,
    textAlign: "center",
    marginTop: 10,
  },
});

export default RTLSDRComponent;