#include <jni.h>
#include <libusb.h>
#include <rtl-sdr.h>
#include <android/log.h>
#include <map>
#include <pthread.h>

#define LOG_TAG "RTLSDRModule"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static std::map<int, rtlsdr_dev_t*> devices;
static int device_counter = 0;
static pthread_mutex_t devices_mutex = PTHREAD_MUTEX_INITIALIZER;
static libusb_context* usb_context = nullptr;

// RAII wrapper for pthread_mutex
class MutexLock {
private:
    pthread_mutex_t* mutex;
public:
    explicit MutexLock(pthread_mutex_t* m) : mutex(m) {
        pthread_mutex_lock(mutex);
    }
    ~MutexLock() {
        pthread_mutex_unlock(mutex);
    }
};

extern "C" {

JNIEXPORT jboolean JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_initializeSDRNative   (JNIEnv *env, jobject thiz, jint fd) {
    if (usb_context == nullptr) {
        int result = libusb_init(&usb_context);
        if (result < 0) {
            LOGE("Failed to initialize libusb: %d", result);
            return JNI_FALSE;
        }
        
        // Set debug level for development
        #ifdef DEBUG
        libusb_set_debug(usb_context, LIBUSB_LOG_LEVEL_INFO);
        #endif
    }
    
    if (fd > 0) {
        LOGI("Using Android USB fd: %d", fd);
        // For Android, we can't directly use the file descriptor with standard libusb
        // RTL-SDR library handles the device detection through libusb
    }
    
    uint32_t device_count = rtlsdr_get_device_count();
    LOGD("Found %d RTL-SDR devices", device_count);
    
    return device_count > 0 ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_getDeviceCountNative(JNIEnv* env, jobject) {
    int count = rtlsdr_get_device_count();
    LOGI("Found %d devices", count);
    return count;
}

JNIEXPORT jstring JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_getDeviceNameNative(JNIEnv* env, jobject, jint idx) {
    const char* name = rtlsdr_get_device_name(idx);
    return env->NewStringUTF(name ? name : "Unknown");
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_openDeviceNative(JNIEnv* env, jobject, jint index) {
    MutexLock lock(&devices_mutex);
    rtlsdr_dev_t* dev = nullptr;
    int result = rtlsdr_open(&dev, index);
    if (result == 0 && dev != nullptr) {
        int handle = device_counter++;
        devices[handle] = dev;
        LOGI("Successfully opened device %d with handle %d", index, handle);
        return handle;
    } else {
        LOGE("Failed to open device %d, error: %d", index, result);
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Failed to open device");
        return -1;
    }
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_closeDeviceNative(JNIEnv* env, jobject, jint handle) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        int result = rtlsdr_close(it->second);
        devices.erase(it);
        LOGI("Closed device handle %d", handle);
        return result;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_setFrequencyNative(JNIEnv* env, jobject, jint handle, jlong freq) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        int result = rtlsdr_set_center_freq(it->second, (uint32_t)freq);
        LOGI("Set frequency to %ld Hz on handle %d, result: %d", (long)freq, handle, result);
        return result;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jlong JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_getFrequencyNative(JNIEnv* env, jobject, jint handle) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        uint32_t freq = rtlsdr_get_center_freq(it->second);
        LOGI("Current frequency: %u Hz on handle %d", freq, handle);
        return (jlong)freq;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_setSampleRateNative(JNIEnv* env, jobject, jint handle, jint rate) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        int result = rtlsdr_set_sample_rate(it->second, (uint32_t)rate);
        LOGI("Set sample rate to %d S/s on handle %d, result: %d", rate, handle, result);
        return result;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_getSampleRateNative(JNIEnv* env, jobject, jint handle) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        uint32_t rate = rtlsdr_get_sample_rate(it->second);
        LOGI("Current sample rate: %u S/s on handle %d", rate, handle);
        return (jint)rate;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_setGainNative(JNIEnv* env, jobject, jint handle, jint gain) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        int result = rtlsdr_set_tuner_gain(it->second, gain);
        LOGI("Set gain to %d on handle %d, result: %d", gain, handle, result);
        return result;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jint JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_resetBufferNative(JNIEnv* env, jobject, jint handle) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it != devices.end()) {
        int result = rtlsdr_reset_buffer(it->second);
        LOGI("Reset buffer on handle %d, result: %d", handle, result);
        return result;
    }
    LOGE("Device handle %d not found", handle);
    env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
    return -1;
}

JNIEXPORT jbyteArray JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_readSamplesNative(JNIEnv* env, jobject, jint handle, jint bufferSize) {
    MutexLock lock(&devices_mutex);
    auto it = devices.find(handle);
    if (it == devices.end()) {
        LOGE("Device handle %d not found", handle);
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Device handle not found");
        return nullptr;
    }

    unsigned char* buffer = new unsigned char[bufferSize];
    if (!buffer) {
        LOGE("Failed to allocate buffer of size %d", bufferSize);
        env->ThrowNew(env->FindClass("java/lang/OutOfMemoryError"), "Failed to allocate buffer");
        return nullptr;
    }

    int n_read;
    int result = rtlsdr_read_sync(it->second, buffer, bufferSize, &n_read);
    if (result != 0) {
        LOGE("Failed to read samples on handle %d, error: %d", handle, result);
        delete[] buffer;
        env->ThrowNew(env->FindClass("java/lang/RuntimeException"), "Failed to read samples");
        return nullptr;
    }

    jbyteArray jBuffer = env->NewByteArray(n_read);
    if (!jBuffer) {
        LOGE("Failed to allocate JNI byte array");
        delete[] buffer;
        env->ThrowNew(env->FindClass("java/lang/OutOfMemoryError"), "Failed to allocate JNI byte array");
        return nullptr;
    }

    env->SetByteArrayRegion(jBuffer, 0, n_read, (jbyte*)buffer);
    delete[] buffer;
    LOGI("Read %d bytes on handle %d", n_read, handle);
    return jBuffer;
}

JNIEXPORT void JNICALL
Java_com_asmitrai_RadioTelescope_RTLSDRModule_cleanupNative(JNIEnv* env, jobject) {
    MutexLock lock(&devices_mutex);
    
    // Close all open devices
    for (auto& pair : devices) {
        LOGI("Cleaning up device handle %d", pair.first);
        rtlsdr_close(pair.second);
    }
    devices.clear();
    
    // Clean up libusb context
    if (usb_context != nullptr) {
        libusb_exit(usb_context);
        usb_context = nullptr;
        LOGI("LibUSB context cleaned up");
    }
}
}