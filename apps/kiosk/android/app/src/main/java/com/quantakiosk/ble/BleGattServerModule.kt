package com.quantakiosk.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * BLE peripheral for the kiosk (spec §2):
 *  - advertises the fixed service UUID with the tablet's short id-hash as
 *    service data so phones can find the right tablet,
 *  - runs a GATT server with a write characteristic (challenge) and a read
 *    characteristic (response),
 *  - on challenge write computes response = HMAC-SHA256(tabletSecret,
 *    base64url(challenge) + "." + currentNonce) natively, so the subsequent
 *    read is served instantly without a JS round-trip.
 *
 * JS keeps the secret/nonce fresh via updateSecretAndNonce() on every QR
 * rotation (the nonce in the QR and the nonce used for the BLE response are
 * the same value).
 */
@SuppressLint("MissingPermission") // permissions are requested from the JS side
class BleGattServerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "BleGattServer"
        private const val B64_FLAGS = Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
    }

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null

    private var serviceUuid: UUID? = null
    private var challengeCharUuid: UUID? = null
    private var responseCharUuid: UUID? = null

    // Rotated from JS on every QR refresh.
    @Volatile private var tabletSecret: ByteArray? = null
    @Volatile private var currentNonceB64: String? = null

    // Last computed response, keyed per remote device address.
    private val responses = HashMap<String, ByteArray>()

    override fun getName(): String = "BleGattServer"

    @ReactMethod
    fun startServer(
        serviceUuidStr: String,
        challengeCharUuidStr: String,
        responseCharUuidStr: String,
        @Suppress("UNUSED_PARAMETER") tabletIdHashB64: String,
        promise: Promise,
    ) {
        try {
            val manager =
                reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
            val adapter = manager.adapter
            if (adapter == null || !adapter.isEnabled) {
                promise.resolve(false)
                return
            }

            serviceUuid = UUID.fromString(serviceUuidStr)
            challengeCharUuid = UUID.fromString(challengeCharUuidStr)
            responseCharUuid = UUID.fromString(responseCharUuidStr)

            // --- GATT server -------------------------------------------------
            gattServer = manager.openGattServer(reactContext, gattCallback)
            val service =
                BluetoothGattService(serviceUuid, BluetoothGattService.SERVICE_TYPE_PRIMARY)
            service.addCharacteristic(
                BluetoothGattCharacteristic(
                    challengeCharUuid,
                    BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE,
                ),
            )
            service.addCharacteristic(
                BluetoothGattCharacteristic(
                    responseCharUuid,
                    BluetoothGattCharacteristic.PROPERTY_READ,
                    BluetoothGattCharacteristic.PERMISSION_READ,
                ),
            )
            gattServer?.addService(service)

            // --- Advertising -------------------------------------------------
            advertiser = adapter.bluetoothLeAdvertiser
            if (advertiser == null) {
                promise.resolve(false)
                return
            }
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(true)
                .build()
            // Legacy BLE advertisements are capped at 31 bytes: flags (3) +
            // 128-bit service UUID (18) already fills the packet, so the
            // tabletId-hash service data MUST ride in the scan response
            // (its own 31-byte budget) or advertising fails DATA_TOO_LARGE.
            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .addServiceUuid(ParcelUuid(serviceUuid))
                .build()
            val scanResponse = AdvertiseData.Builder()
                .addServiceData(
                    ParcelUuid(serviceUuid),
                    Base64.decode(tabletIdHashB64, B64_FLAGS),
                )
                .build()
            // Resolve the promise from the callback so JS reflects the REAL
            // advertising state instead of assuming success.
            var settled = false
            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                    Log.i(TAG, "Advertising started")
                    if (!settled) { settled = true; promise.resolve(true) }
                }

                override fun onStartFailure(errorCode: Int) {
                    Log.e(TAG, "Advertising failed: $errorCode")
                    if (!settled) { settled = true; promise.resolve(false) }
                }
            }
            advertiser?.startAdvertising(settings, data, scanResponse, advertiseCallback)
        } catch (e: Exception) {
            promise.reject("BLE_START_FAILED", e)
        }
    }

    @ReactMethod
    fun updateSecretAndNonce(tabletSecretB64Url: String, currentNonce: String, promise: Promise) {
        try {
            tabletSecret = Base64.decode(tabletSecretB64Url, B64_FLAGS)
            currentNonceB64 = currentNonce
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("BLE_UPDATE_FAILED", e)
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise) {
        try {
            advertiseCallback?.let { advertiser?.stopAdvertising(it) }
            gattServer?.close()
            gattServer = null
            advertiser = null
            responses.clear()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("BLE_STOP_FAILED", e)
        }
    }

    // Required for NativeEventEmitter (no-ops, RN calls these reflectively).
    @ReactMethod fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {}
    @ReactMethod fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Double) {}

    private fun emit(event: String) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, null)
    }

    private fun computeResponse(challenge: ByteArray): ByteArray? {
        val secret = tabletSecret ?: return null
        val nonce = currentNonceB64 ?: return null
        val challengeB64 = Base64.encodeToString(challenge, B64_FLAGS)
        // Canonical message — must match packages/shared buildBleResponseMessage.
        val message = "$challengeB64.$nonce"
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        val hmacB64 = Base64.encodeToString(mac.doFinal(message.toByteArray(Charsets.UTF_8)), B64_FLAGS)
        // Echo the inputs alongside the HMAC ("challenge|nonce|hmac") so the
        // phone/server can pinpoint which input diverged when verification fails.
        return "$challengeB64|$nonce|$hmacB64".toByteArray(Charsets.US_ASCII)
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            if (newState == BluetoothGatt.STATE_CONNECTED) emit("onCentralConnected")
            if (newState == BluetoothGatt.STATE_DISCONNECTED) responses.remove(device.address)
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray,
        ) {
            if (characteristic.uuid == challengeCharUuid) {
                val response = computeResponse(value)
                if (response != null) {
                    responses[device.address] = response
                    emit("onChallengeReceived")
                }
                if (responseNeeded) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        if (response != null) BluetoothGatt.GATT_SUCCESS else BluetoothGatt.GATT_FAILURE,
                        0,
                        null,
                    )
                }
            } else if (responseNeeded) {
                gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice,
            requestId: Int,
            offset: Int,
            characteristic: BluetoothGattCharacteristic,
        ) {
            if (characteristic.uuid == responseCharUuid) {
                val response = responses[device.address]
                if (response != null && offset <= response.size) {
                    gattServer?.sendResponse(
                        device,
                        requestId,
                        BluetoothGatt.GATT_SUCCESS,
                        offset,
                        response.copyOfRange(offset, response.size),
                    )
                    return
                }
            }
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
        }
    }
}
