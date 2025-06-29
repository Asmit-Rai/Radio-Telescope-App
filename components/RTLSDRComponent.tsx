import React, { useState, useEffect, useRef, useCallback } from "react";
import { Text, StyleSheet, NativeModules } from "react-native";

const { RTLSDRModule } = NativeModules;

interface RTLSDRComponentProps {
  frequency: number;
  onDataReceived: (samples: number[]) => void;
}

const RTLSDRComponent: React.FC<RTLSDRComponentProps> = ({ frequency, onDataReceived }) => {
  const [handle, setHandle] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isReadingRef = useRef<boolean>(false);
  const currentHandleRef = useRef<number | null>(null);

  const cleanup = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    isReadingRef.current = false;
    
    if (currentHandleRef.current !== null) {
      try {
        await RTLSDRModule.closeDevice(currentHandleRef.current);
      } catch (err) {
        console.error("Error closing RTL-SDR device:", err);
      }
      currentHandleRef.current = null;
    }
    
    setHandle(null);
    setIsInitialized(false);
  }, []);

  const startReading = useCallback((h: number) => {
    if (isReadingRef.current || intervalRef.current) return;
    
    isReadingRef.current = true;
    intervalRef.current = setInterval(async () => {
      if (!isMountedRef.current || !isReadingRef.current) {
        return;
      }
      
      try {
        const samples: number[] = await RTLSDRModule.readSamples(h, 16384);
        if (isMountedRef.current && samples && samples.length > 0) {
          onDataReceived(samples);
        }
      } catch (err) {
        console.error("Error reading samples:", err);
        if (isMountedRef.current) {
          setError("Failed to read samples from device");
        }
      }
    }, 100);
  }, [onDataReceived]);

  useEffect(() => {
    isMountedRef.current = true;

    const initializeSDR = async () => {
      if (isInitialized || !RTLSDRModule) {
        return;
      }

      try {
        setError(null);
        
        const deviceCount = await RTLSDRModule.getDeviceCount();
        if (deviceCount <= 0) {
          setError("No RTL-SDR devices found");
          return;
        }

        const h = await RTLSDRModule.openDevice(0);
        if (!isMountedRef.current) {
          await RTLSDRModule.closeDevice(h);
          return;
        }

        currentHandleRef.current = h;
        setHandle(h);
        
        await RTLSDRModule.setSampleRate(h, 2048000);
        await RTLSDRModule.setFrequency(h, Math.floor(frequency * 1e6));
        await RTLSDRModule.resetBuffer(h);
        
        if (isMountedRef.current) {
          setIsInitialized(true);
          startReading(h);
        }
      } catch (err) {
        console.error("RTL-SDR Initialization Error:", err);
        if (isMountedRef.current) {
          setError("Failed to initialize RTL-SDR device");
        }
        await cleanup();
      }
    };

    initializeSDR();

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [cleanup, startReading, frequency, isInitialized]);

  useEffect(() => {
    if (handle && isInitialized && isMountedRef.current) {
      const setFreq = async () => {
        try {
          await RTLSDRModule.setFrequency(handle, Math.floor(frequency * 1e6));
        } catch (err) {
          console.error("Error setting frequency:", err);
          if (isMountedRef.current) {
            setError("Failed to set frequency");
          }
        }
      };
      
      setFreq();
    }
  }, [frequency, handle, isInitialized]);

  if (error) {
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