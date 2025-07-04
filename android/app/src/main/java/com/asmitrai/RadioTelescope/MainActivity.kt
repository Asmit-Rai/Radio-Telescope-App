package com.asmitrai.RadioTelescope
import expo.modules.splashscreen.SplashScreenManager

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.os.Handler
import android.os.Looper

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() 
{
    companion object {
        private const val ACTION_USB_PERMISSION = "com.asmitrai.RadioTelescope.USB_PERMISSION"
        var sdrDevice: UsbDevice? = null
        private var instance: MainActivity? = null

        @JvmStatic
        fun getUsbDeviceConnection(): UsbDeviceConnection? {
            return instance?.let { activity ->
                sdrDevice?.let { device ->
                    activity.usbManager.openDevice(device)
                }
            }
        }
    }

    public lateinit var usbManager: UsbManager // made public for companion object access
    private lateinit var permissionIntent: PendingIntent
    private val handler = Handler(Looper.getMainLooper())

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val action = intent.action
            if (ACTION_USB_PERMISSION == action) {
                synchronized(this) {
                    val device: UsbDevice? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                    }
                    if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                        device?.let {
                            if (validateSDRConnection(it)) {
                                Log.d("MainActivity", "RTL-SDR initialized successfully")
                                sdrDevice = it
                            } else {
                                Log.e("MainActivity", "RTL-SDR validation failed")
                            }
                        }
                    }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // setTheme(R.style.AppTheme)
        SplashScreenManager.registerOnActivity(this)
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
        super.onCreate(null)

        instance = this

        usbManager = getSystemService(Context.USB_SERVICE) as UsbManager
        permissionIntent = PendingIntent.getBroadcast(
            this, 
            0, 
            Intent(ACTION_USB_PERMISSION), 
            PendingIntent.FLAG_IMMUTABLE
        )

        val filter = IntentFilter(ACTION_USB_PERMISSION)
        registerReceiver(usbReceiver, filter)

        // Delay USB initialization to prevent splash screen freeze
        handler.postDelayed({
            checkAndRequestUSBPermission()
        }, 3000)
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        try {
            unregisterReceiver(usbReceiver)
        } catch (e: IllegalArgumentException) {
            // Receiver was not registered, ignore
        }
    }

    override fun getMainComponentName(): String = "main"

    override fun createReactActivityDelegate(): ReactActivityDelegate {
        return ReactActivityDelegateWrapper(
            this,
            BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
            object : DefaultReactActivityDelegate(
                this,
                mainComponentName,
                fabricEnabled
            ){})
    }

    override fun invokeDefaultOnBackPressed() {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
            if (!moveTaskToBack(false)) {
                super.invokeDefaultOnBackPressed()
            }
            return
        }
        super.invokeDefaultOnBackPressed()
    }

    private fun checkAndRequestUSBPermission() {
        try {
            val deviceList = usbManager.deviceList
            if (deviceList.isEmpty()) {
                Log.d("MainActivity", "No USB devices found")
                return
            }
            var sdrFound = false
            for (device in deviceList.values) {
                if (isSDRDevice(device)) {
                    sdrFound = true
                    if (!usbManager.hasPermission(device)) {
                        usbManager.requestPermission(device, permissionIntent)
                    } else {
                        sdrDevice = device
                    }
                }
            }
            if (!sdrFound) {
                Log.d("MainActivity", "No SDR devices found among connected USB devices")
            }
        } catch (e: Exception) {
            Log.e("MainActivity", "Error checking USB permissions: ${e.message}")
        }
    }

    private fun validateSDRConnection(device: UsbDevice): Boolean {
        return try {
            val connection = usbManager.openDevice(device)
            if (connection == null) {
                Log.e("MainActivity", "Failed to open USB connection")
                return false
            }

            // Claim interface 0 (required for RTL-SDR)
            val intf = device.getInterface(0)
            if (!connection.claimInterface(intf, true)) {
                Log.e("MainActivity", "Failed to claim USB interface")
                connection.close()
                return false
            }

            connection.releaseInterface(intf)
            connection.close()
            true
        } catch (e: Exception) {
            Log.e("MainActivity", "USB validation failed: ${e.message}")
            false
        }
    }

    private fun isSDRDevice(device: UsbDevice): Boolean {
        val vendorId = device.vendorId
        val productId = device.productId

        return when (vendorId) {
            0x0bda -> productId in listOf(0x2838, 0x2832, 0x2839, 0x283a)
            0x1d50 -> productId in listOf(0x6089, 0x60a1, 0x6108, 0x6109, 0x610a, 0x222a, 0x222b, 0x222c, 0x222d)
            0x2206 -> productId in listOf(0x0004, 0x0010)
            0x2500 -> productId in listOf(0x0002, 0x00b1, 0x00b2, 0x00b3, 0x00b4, 0x00b5, 0x00b6, 0x00b7)
            0x04d8 -> productId in listOf(0xfb56, 0xfb31)
            0x04b4 -> productId in listOf(0x8613, 0x8614)
            0x0456 -> productId in listOf(0xb673)
            0x04e6 -> productId in listOf(0x9802, 0x0002)
            0x0403 -> productId in listOf(0x6001, 0x6010, 0x6011, 0x6014, 0x6015)
            else -> false
        }
    }
}
// ...end of file, removed extra closing brace...