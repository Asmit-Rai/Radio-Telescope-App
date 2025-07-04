LOCAL_PATH := $(call my-dir)

# libusb
include $(CLEAR_VARS)
LOCAL_MODULE := usb1.0
LOCAL_SRC_FILES := ../jniLibs/$(TARGET_ARCH_ABI)/libusb1.0.so
LOCAL_EXPORT_C_INCLUDES := $(LOCAL_PATH)/libusb/include
include $(PREBUILT_SHARED_LIBRARY)

# librtlsdr
include $(CLEAR_VARS)
LOCAL_MODULE := rtlsdr
LOCAL_SRC_FILES := ../jniLibs/$(TARGET_ARCH_ABI)/librtlsdr.so
LOCAL_EXPORT_C_INCLUDES := $(LOCAL_PATH)/librtlsdr/include
LOCAL_SHARED_LIBRARIES := usb1.0
include $(PREBUILT_SHARED_LIBRARY)

include $(CLEAR_VARS)
LOCAL_MODULE := RTLSDRModule
LOCAL_SRC_FILES := RTLSDRModule.cpp
LOCAL_C_INCLUDES := $(LOCAL_PATH)/libusb/include $(LOCAL_PATH)/librtlsdr/include
LOCAL_SHARED_LIBRARIES := usb1.0 rtlsdr
LOCAL_LDLIBS := -llog -landroid
LOCAL_CPP_FEATURES := exceptions rtti
LOCAL_CPPFLAGS := -frtti -fexceptions -std=c++11
include $(BUILD_SHARED_LIBRARY)
