package com.asmitrai.RadioTelescope;
import android.util.Log;
import android.content.Context;
import android.hardware.usb.UsbManager;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;

import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;

public class RTLSDRModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RTLSDRModule";
    private static final String MODULE_NAME = "RTLSDRModule";
    
    // Error constants
    private static final String E_DEVICE_COUNT = "E_DEVICE_COUNT";
    private static final String E_DEVICE_NAME = "E_DEVICE_NAME";
    private static final String E_OPEN_DEVICE = "E_OPEN_DEVICE";
    private static final String E_CLOSE_DEVICE = "E_CLOSE_DEVICE";
    private static final String E_SET_FREQUENCY = "E_SET_FREQUENCY";
    private static final String E_GET_FREQUENCY = "E_GET_FREQUENCY";
    private static final String E_SET_SAMPLE_RATE = "E_SET_SAMPLE_RATE";
    private static final String E_GET_SAMPLE_RATE = "E_GET_SAMPLE_RATE";
    private static final String E_SET_GAIN = "E_SET_GAIN";
    private static final String E_RESET_BUFFER = "E_RESET_BUFFER";
    private static final String E_READ_SAMPLES = "E_READ_SAMPLES";
    private static final String E_USB_ENUMERATE = "E_USB_ENUMERATE";
    private static final String E_USB_FD = "E_USB_FD";
    private static final String E_INITIALIZE = "E_INITIALIZE";
    private static final String E_NO_PERMISSION = "E_NO_PERMISSION";
    private static final String E_INVALID_PARAMS = "E_INVALID_PARAMS";

   static {
    try {
        Log.d(TAG, "Loading native libraries...");
        try {
            System.loadLibrary("usb1.0");
            Log.d(TAG, "✅ libusb1.0 loaded successfully");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "❌ Failed to load libusb1.0: " + e.getMessage());
            throw e;
        }
        try {
            System.loadLibrary("rtlsdr");
            Log.d(TAG, "✅ librtlsdr loaded successfully");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "❌ Failed to load librtlsdr: " + e.getMessage());
            throw e;
        }
        try {
            System.loadLibrary("RTLSDRModule");
            Log.d(TAG, "✅ libRTLSDRModule loaded successfully");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "❌ Failed to load libRTLSDRModule: " + e.getMessage());
            throw e;
        }
    } catch (UnsatisfiedLinkError e) {
        Log.e(TAG, "Library path: " + System.getProperty("java.library.path"));
        Log.e(TAG, "Make sure .so files are in src/main/jniLibs/{abi}/ directories");
        throw e;
    }
}

    public RTLSDRModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    // ADD THE DEBUG METHOD HERE - AFTER THE isNativeLibraryLoaded METHOD
 @ReactMethod
public void debugNativeLibrary(Promise promise) {
    WritableMap result = Arguments.createMap();
    result.putString("library_path", System.getProperty("java.library.path"));
    
    try {
        // Test basic native method availability
        int count = getDeviceCountNative();
        result.putBoolean("getDeviceCountNative_available", true);
        result.putInt("device_count", count);
        Log.d(TAG, "✅ getDeviceCountNative works");
    } catch (UnsatisfiedLinkError e) {
        result.putBoolean("getDeviceCountNative_available", false);
        result.putString("getDeviceCountNative_error", e.toString());
        Log.e(TAG, "❌ getDeviceCountNative missing", e);
    }

    try {
        // Test initializeSDRNative specifically
        boolean initTest = initializeSDRNative(-1);
        result.putBoolean("initializeSDRNative_available", true);
        result.putBoolean("initializeSDRNative_test_result", initTest);
        Log.d(TAG, "✅ initializeSDRNative works");
    } catch (UnsatisfiedLinkError e) {
        result.putBoolean("initializeSDRNative_available", false);
        result.putString("initializeSDRNative_error", e.toString());
        Log.e(TAG, "❌ initializeSDRNative missing", e);
    } catch (Exception e) {
        result.putBoolean("initializeSDRNative_available", true);
        result.putString("initializeSDRNative_error", e.toString());
        Log.e(TAG, "⚠️ initializeSDRNative exists but threw", e);
    }

    promise.resolve(result);
}

    @ReactMethod
    public void isNativeLibraryLoaded(Promise promise) {
        try {
            // Try to call a simple native method to test if library is loaded
            int count = getDeviceCountNative();
            Log.d(TAG, "Native library test successful, device count: " + count);
            promise.resolve(true);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded: " + e.getMessage());
            Log.e(TAG, "Detailed error: ", e);
            promise.resolve(false);
        } catch (Exception e) {
            Log.e(TAG, "Error checking native library: " + e.getMessage());
            promise.resolve(false);
        }
    }

    @ReactMethod
    public void getDeviceCount(Promise promise) {
        try {
            int count = getDeviceCountNative();
            Log.d(TAG, "Device count: " + count);
            promise.resolve(count);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for getDeviceCount: " + e.getMessage());
            promise.reject(E_DEVICE_COUNT, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error getting device count: " + e.getMessage());
            promise.reject(E_DEVICE_COUNT, e.getMessage());
        }
    }

    @ReactMethod
    public void getDeviceName(int index, Promise promise) {
        try {
            if (index < 0) {
                promise.reject(E_INVALID_PARAMS, "Device index must be non-negative");
                return;
            }
            String name = getDeviceNameNative(index);
            Log.d(TAG, "Device " + index + " name: " + name);
            promise.resolve(name != null ? name : "Unknown Device");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for getDeviceName: " + e.getMessage());
            promise.reject(E_DEVICE_NAME, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error getting device name: " + e.getMessage());
            promise.reject(E_DEVICE_NAME, e.getMessage());
        }
    }

    @ReactMethod
    public void openDevice(int index, Promise promise) {
        try {
            if (index < 0) {
                promise.reject(E_INVALID_PARAMS, "Device index must be non-negative");
                return;
            }

            // Check USB permissions first
            if (!checkUsbPermissionsForIndex(index)) {
                promise.reject(E_NO_PERMISSION, "No USB permission for device at index " + index);
                return;
            }

            int handle = openDeviceNative(index);
            if (handle >= 0) {
                Log.d(TAG, "Successfully opened device " + index + " with handle " + handle);
                promise.resolve(handle);
            } else {
                Log.e(TAG, "Failed to open device " + index + ", returned handle: " + handle);
                promise.reject(E_OPEN_DEVICE, "Failed to open device, native returned: " + handle);
            }
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for openDevice: " + e.getMessage());
            promise.reject(E_OPEN_DEVICE, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error opening device: " + e.getMessage());
            promise.reject(E_OPEN_DEVICE, e.getMessage());
        }
    }

    @ReactMethod
    public void closeDevice(int handle, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            int result = closeDeviceNative(handle);
            Log.d(TAG, "Close device handle " + handle + " result: " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for closeDevice: " + e.getMessage());
            promise.reject(E_CLOSE_DEVICE, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error closing device: " + e.getMessage());
            promise.reject(E_CLOSE_DEVICE, e.getMessage());
        }
    }

    @ReactMethod
    public void setFrequency(int handle, double frequency, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            
            // Frequency validation for RTL-SDR (24 MHz to 1.766 GHz)
            long freqLong = (long) frequency;
            if (freqLong < 24_000_000L || freqLong > 1_766_000_000L) {
                promise.reject(E_INVALID_PARAMS, "Frequency out of valid range (24 MHz to 1.766 GHz)");
                return;
            }
            
            int result = setFrequencyNative(handle, freqLong);
            Log.d(TAG, "Set frequency " + freqLong + " Hz on handle " + handle + ", result: " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for setFrequency: " + e.getMessage());
            promise.reject(E_SET_FREQUENCY, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error setting frequency: " + e.getMessage());
            promise.reject(E_SET_FREQUENCY, e.getMessage());
        }
    }

    @ReactMethod
    public void getFrequency(int handle, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            long frequency = getFrequencyNative(handle);
            Log.d(TAG, "Current frequency on handle " + handle + ": " + frequency + " Hz");
            promise.resolve((double) frequency);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for getFrequency: " + e.getMessage());
            promise.reject(E_GET_FREQUENCY, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error getting frequency: " + e.getMessage());
            promise.reject(E_GET_FREQUENCY, e.getMessage());
        }
    }

    @ReactMethod
    public void setSampleRate(int handle, int rate, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            if (rate <= 0) {
                promise.reject(E_INVALID_PARAMS, "Sample rate must be positive");
                return;
            }
            
            int result = setSampleRateNative(handle, rate);
            Log.d(TAG, "Set sample rate " + rate + " S/s on handle " + handle + ", result: " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for setSampleRate: " + e.getMessage());
            promise.reject(E_SET_SAMPLE_RATE, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error setting sample rate: " + e.getMessage());
            promise.reject(E_SET_SAMPLE_RATE, e.getMessage());
        }
    }

    @ReactMethod
    public void getSampleRate(int handle, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            int rate = getSampleRateNative(handle);
            Log.d(TAG, "Current sample rate on handle " + handle + ": " + rate + " S/s");
            promise.resolve(rate);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for getSampleRate: " + e.getMessage());
            promise.reject(E_GET_SAMPLE_RATE, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error getting sample rate: " + e.getMessage());
            promise.reject(E_GET_SAMPLE_RATE, e.getMessage());
        }
    }

    @ReactMethod
    public void setGain(int handle, int gain, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            int result = setGainNative(handle, gain);
            Log.d(TAG, "Set gain " + gain + " on handle " + handle + ", result: " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for setGain: " + e.getMessage());
            promise.reject(E_SET_GAIN, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error setting gain: " + e.getMessage());
            promise.reject(E_SET_GAIN, e.getMessage());
        }
    }

    @ReactMethod
    public void resetBuffer(int handle, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            int result = resetBufferNative(handle);
            Log.d(TAG, "Reset buffer on handle " + handle + ", result: " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for resetBuffer: " + e.getMessage());
            promise.reject(E_RESET_BUFFER, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error resetting buffer: " + e.getMessage());
            promise.reject(E_RESET_BUFFER, e.getMessage());
        }
    }

    @ReactMethod
    public void readSamples(int handle, int bufferSize, Promise promise) {
        try {
            if (handle < 0) {
                promise.reject(E_INVALID_PARAMS, "Device handle must be non-negative");
                return;
            }
            if (bufferSize <= 0) {
                promise.reject(E_INVALID_PARAMS, "Buffer size must be positive");
                return;
            }
            
            byte[] samples = readSamplesNative(handle, bufferSize);
            if (samples != null) {
                Log.d(TAG, "Read " + samples.length + " bytes on handle " + handle);
                
                // Convert byte array to WritableArray for React Native
                WritableArray sampleArray = Arguments.createArray();
                for (byte sample : samples) {
                    sampleArray.pushInt(sample & 0xFF); // Convert to unsigned
                }
                promise.resolve(sampleArray);
            } else {
                Log.e(TAG, "Failed to read samples: null response from native layer");
                promise.reject(E_READ_SAMPLES, "Failed to read samples: null response from native layer");
            }
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for readSamples: " + e.getMessage());
            promise.reject(E_READ_SAMPLES, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error reading samples: " + e.getMessage());
            promise.reject(E_READ_SAMPLES, e.getMessage());
        }
    }

    @ReactMethod
    public void enumerateUsbDevices(Promise promise) {
        try {
            UsbManager usbManager = (UsbManager) getReactApplicationContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) {
                promise.reject(E_USB_ENUMERATE, "Unable to get USB manager");
                return;
            }

            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            WritableArray devices = Arguments.createArray();
            
            for (UsbDevice device : deviceList.values()) {
                WritableMap deviceInfo = Arguments.createMap();
                deviceInfo.putString("deviceName", device.getDeviceName());
                deviceInfo.putInt("vendorId", device.getVendorId());
                deviceInfo.putInt("productId", device.getProductId());
                deviceInfo.putString("vendorIdHex", String.format("0x%04X", device.getVendorId()));
                deviceInfo.putString("productIdHex", String.format("0x%04X", device.getProductId()));
                deviceInfo.putBoolean("isSDRDevice", isSDRDevice(device));
                deviceInfo.putBoolean("hasPermission", usbManager.hasPermission(device));
                devices.pushMap(deviceInfo);
            }
            
            Log.d(TAG, "Enumerated " + devices.size() + " USB devices");
            promise.resolve(devices);
        } catch (Exception e) {
            Log.e(TAG, "Error enumerating USB devices: " + e.getMessage());
            promise.reject(E_USB_ENUMERATE, e.getMessage());
        }
    }

    @ReactMethod
    public void getUsbFileDescriptor(Promise promise) {
        try {
            // Get the current USB device connection from MainActivity
            UsbDeviceConnection connection = MainActivity.getUsbDeviceConnection();
            if (connection != null) {
                int fd = connection.getFileDescriptor();
                Log.d(TAG, "USB file descriptor: " + fd);
                promise.resolve(fd);
            } else {
                Log.w(TAG, "No USB device connection available");
                promise.reject(E_USB_FD, "No USB device connection available");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error getting USB file descriptor: " + e.getMessage());
            promise.reject(E_USB_FD, e.getMessage());
        }
    }

    @Override
    public void invalidate() {
        try {
            Log.d(TAG, "Cleaning up RTL-SDR native resources");
            cleanupNative();
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to call cleanup method: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error during cleanup: " + e.getMessage());
        }
        super.invalidate();
    }

     @ReactMethod
    public void initializeSDR(Promise promise) {
        try {
            // Get file descriptor from MainActivity's USB connection
            UsbDeviceConnection connection = MainActivity.getUsbDeviceConnection();
            int fd = (connection != null) ? connection.getFileDescriptor() : -1;
            
            // Fixed typo: initializeSDRNative (not initilaizeSDRNative)
            boolean result = initializeSDRNative(fd);
            Log.d(TAG, "Initialize SDR with fd " + fd + ": " + result);
            promise.resolve(result);
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Native library not loaded for initializeSDR: " + e.getMessage());
            promise.reject(E_INITIALIZE, "Native library not loaded: " + e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Error initializing SDR: " + e.getMessage());
            promise.reject(E_INITIALIZE, e.getMessage());
        }
    }

    private boolean checkUsbPermissionsForIndex(int index) {
        try {
            UsbManager usbManager = (UsbManager) getReactApplicationContext().getSystemService(Context.USB_SERVICE);
            if (usbManager == null) return false;

            HashMap<String, UsbDevice> deviceList = usbManager.getDeviceList();
            List<UsbDevice> sdrDevices = new ArrayList<>();
            
            // Collect SDR devices
            for (UsbDevice device : deviceList.values()) {
                if (isSDRDevice(device)) {
                    sdrDevices.add(device);
                }
            }
            
            // Check if index is valid and has permission
            if (index >= 0 && index < sdrDevices.size()) {
                UsbDevice device = sdrDevices.get(index);
                return usbManager.hasPermission(device);
            }
            
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Error checking USB permissions: " + e.getMessage());
            return false;
        }
    }

    private boolean isSDRDevice(UsbDevice device) {
        int vendorId = device.getVendorId();
        int productId = device.getProductId();
        
        // RTL-SDR dongles (Realtek)
        if (vendorId == 0x0bda) {
            return productId == 0x2838 || productId == 0x2832 || productId == 0x2839 || productId == 0x283a;
        }
        // HackRF, Airspy, SDRplay
        if (vendorId == 0x1d50) {
            return productId == 0x6089 || productId == 0x60a1 || productId == 0x6108 || 
                   productId == 0x6109 || productId == 0x610a || productId == 0x222a || 
                   productId == 0x222b || productId == 0x222c || productId == 0x222d;
        }
        // BladeRF
        if (vendorId == 0x2206) {
            return productId == 0x0004 || productId == 0x0010;
        }
        // Add other SDR device checks as needed
        
        return false;
    }

    // Native method declarations
     private native boolean initializeSDRNative(int fd);  // Fixed spelling
    private native void cleanupNative();
    private native int getDeviceCountNative();
    private native String getDeviceNameNative(int index);
    private native int openDeviceNative(int index);
    private native int closeDeviceNative(int handle);
    private native int setFrequencyNative(int handle, long freq);
    private native long getFrequencyNative(int handle);
    private native int setSampleRateNative(int handle, int rate);
    private native int getSampleRateNative(int handle);
    private native int setGainNative(int handle, int gain);
    private native int resetBufferNative(int handle);
    private native byte[] readSamplesNative(int handle, int bufferSize);
}