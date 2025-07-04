APP_ABI := armeabi-v7a arm64-v8a
APP_PLATFORM := android-21
APP_STL := c++_shared
APP_CPPFLAGS := -frtti -fexceptions -std=c++11 -pthread
APP_CFLAGS := -DANDROID=1
NDK_TOOLCHAIN_VERSION := clang