/*
 * Project note: ESP32 firmware for the Smart Tole dustbin prototype.
 * Update Wi-Fi credentials, backend IP, and sensor calibration before flashing; the board sends MAC-based readings to the Express API.
 */
#include <WiFi.h>
#include <HTTPClient.h>

// ESP32 supports 2.4 GHz Wi-Fi only. Use your router/mobile hotspot 2.4 GHz SSID.
const char* WIFI_SSID = "NCMT STAFF";
const char* WIFI_PASSWORD = "0SIX@SEPT1997";

// Replace with your laptop/server IP on the same Wi-Fi network.
const char* API_URL = "http://10.10.15.243:5000/api/iot/garbage-reading";
const char* DEVICE_CONFIG_URL = "http://10.10.15.243:5000/api/iot/device-config";

// Optional: match server/.env IOT_DEVICE_API_KEY if you set one.
const char* DEVICE_API_KEY = "";

const char* DEVICE_STATUS = "Active";

const int TRIG_PIN = 5;
const int ECHO_PIN = 18;

const float BIN_HEIGHT_CM = 40.0f;
const float SENSOR_OFFSET_CM = 2.0f;
const float EMPTY_TOLERANCE_CM = 3.0f;
const int DISTANCE_SAMPLE_COUNT = 7;
const unsigned long ECHO_TIMEOUT_US = 30000;
const unsigned long SEND_INTERVAL_MS = 30000;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
const unsigned long WIFI_RETRY_DELAY_MS = 5000;
const unsigned long HTTP_TIMEOUT_MS = 8000;

String linkedBinId = "";
String linkedResidentName = "";
String linkedZone = "General";
String linkedLocationLabel = "";
String linkedDeviceStatus = DEVICE_STATUS;
bool hasLinkedAssignment = false;

String wifiStatusText(wl_status_t status) {
  switch (status) {
    case WL_CONNECTED:
      return "Connected";
    case WL_NO_SSID_AVAIL:
      return "SSID not found";
    case WL_CONNECT_FAILED:
      return "Connection failed";
    case WL_CONNECTION_LOST:
      return "Connection lost";
    case WL_DISCONNECTED:
      return "Disconnected";
    case WL_IDLE_STATUS:
      return "Connecting/idle";
    default:
      return "Unknown";
  }
}

float readDistanceSampleCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(4);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);

  if (duration <= 0) {
    return -1;
  }

  return duration * 0.0343f / 2.0f;
}

void sortSamples(float values[], int count) {
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (values[j] < values[i]) {
        float temp = values[i];
        values[i] = values[j];
        values[j] = temp;
      }
    }
  }
}

float readDistanceCm() {
  float samples[DISTANCE_SAMPLE_COUNT];
  int validCount = 0;

  for (int i = 0; i < DISTANCE_SAMPLE_COUNT; i++) {
    float sample = readDistanceSampleCm();

    if (sample > 0 && sample < 400) {
      samples[validCount++] = sample;
    }

    delay(60);
  }

  if (validCount == 0) {
    return -1;
  }

  sortSamples(samples, validCount);
  float median = samples[validCount / 2] - SENSOR_OFFSET_CM;

  if (median < 0) {
    median = 0;
  }

  return median;
}

int toFillPercentage(float distanceCm) {
  if (distanceCm < 0) {
    return -1;
  }

  float adjustedDistanceCm = distanceCm;

  if (adjustedDistanceCm > BIN_HEIGHT_CM + EMPTY_TOLERANCE_CM) {
    adjustedDistanceCm = BIN_HEIGHT_CM;
  }

  float percentage = ((BIN_HEIGHT_CM - adjustedDistanceCm) / BIN_HEIGHT_CM) * 100.0f;

  if (percentage < 0) {
    percentage = 0;
  }

  if (percentage > 100) {
    percentage = 100;
  }

  return (int) roundf(percentage);
}

String toStatus(int fillPercentage) {
  if (fillPercentage <= 0) {
    return "Empty";
  }

  if (fillPercentage >= 80) {
    return "Full";
  }

  if (fillPercentage >= 50) {
    return "Warning";
  }

  return "Normal";
}

String getDeviceId() {
  return WiFi.macAddress();
}

String urlEncodeDeviceId(String value) {
  value.replace(":", "%3A");
  return value;
}

void printStartupBanner() {
  Serial.println();
  Serial.println("========================================");
  Serial.println("Smart Tole ESP32 Dustbin Monitor");
  Serial.println("Serial Monitor: 115200 baud");
  Serial.println("========================================");
  Serial.print("Using device ID: ");
  Serial.println(getDeviceId());
  Serial.print("Backend reading API: ");
  Serial.println(API_URL);
  Serial.print("Backend config API: ");
  Serial.println(DEVICE_CONFIG_URL);
}

void printAssignmentSummary() {
  Serial.print("Linked Bin ID: ");
  Serial.println(linkedBinId.length() > 0 ? linkedBinId : "(not assigned)");
  Serial.print("Assigned Resident: ");
  Serial.println(linkedResidentName.length() > 0 ? linkedResidentName : "(not assigned)");
  Serial.print("Device Status: ");
  Serial.println(linkedDeviceStatus.length() > 0 ? linkedDeviceStatus : DEVICE_STATUS);
  Serial.print("Zone: ");
  Serial.println(linkedZone.length() > 0 ? linkedZone : "General");
}

String extractJsonString(const String& json, const String& key) {
  String pattern = "\"" + key + "\":\"";
  int start = json.indexOf(pattern);

  if (start < 0) {
    return "";
  }

  start += pattern.length();
  int end = json.indexOf("\"", start);

  if (end < 0) {
    return "";
  }

  return json.substring(start, end);
}

bool fetchDeviceConfig() {
  HTTPClient http;
  String deviceId = getDeviceId();
  String url = String(DEVICE_CONFIG_URL) + "?deviceId=" + urlEncodeDeviceId(deviceId);
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (String(DEVICE_API_KEY).length() > 0) {
    http.addHeader("x-device-key", DEVICE_API_KEY);
  }

  int responseCode = http.GET();
  String responseBody = http.getString();

  Serial.print("GET ");
  Serial.print(url);
  Serial.print(" -> ");
  Serial.println(responseCode);

  if (responseCode < 0) {
    Serial.print("HTTP config error: ");
    Serial.println(http.errorToString(responseCode));
    Serial.println("Check that the laptop server is running and this IP/port is reachable from ESP32.");
    Serial.println("Open this from another device browser on same Wi-Fi: http://192.168.1.70:5000/");
  }

  if (responseCode >= 200 && responseCode < 300) {
    linkedBinId = extractJsonString(responseBody, "binId");
    linkedResidentName = extractJsonString(responseBody, "residentName");
    linkedZone = extractJsonString(responseBody, "zone");
    linkedLocationLabel = extractJsonString(responseBody, "locationLabel");
    linkedDeviceStatus = extractJsonString(responseBody, "deviceStatus");

    if (linkedZone.length() == 0) {
      linkedZone = "General";
    }

    if (linkedDeviceStatus.length() == 0) {
      linkedDeviceStatus = DEVICE_STATUS;
    }

    hasLinkedAssignment = linkedBinId.length() > 0;

    printAssignmentSummary();
    if (!hasLinkedAssignment) {
      Serial.println("Device registered, but no dustbin assignment is linked yet.");
    }
    http.end();
    return true;
  }

  if (responseCode == 404) {
    Serial.println("Device detected by server, waiting for admin to assign a dustbin and resident.");
  } else if (responseCode >= 0) {
    Serial.println(responseBody);
  }
  linkedBinId = "";
  linkedResidentName = "";
  linkedZone = "General";
  linkedLocationLabel = "";
  linkedDeviceStatus = DEVICE_STATUS;
  hasLinkedAssignment = false;
  http.end();
  return false;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  // Stop any previous connection attempt before applying Wi-Fi credentials again.
  WiFi.disconnect();
  delay(300);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");

  unsigned long startTime = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startTime < WIFI_CONNECT_TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    wl_status_t status = WiFi.status();
    Serial.print("Wi-Fi connection failed: ");
    Serial.println(wifiStatusText(status));
    Serial.println("Check SSID/password and router signal.");
    Serial.println("Important: ESP32 connects to 2.4 GHz Wi-Fi only, not 5 GHz.");
    Serial.println("If your Wi-Fi name ends with _5 or 5G, use the 2.4 GHz network name instead.");
    WiFi.disconnect();
    return false;
  }

  Serial.print("Connected. ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Gateway IP: ");
  Serial.println(WiFi.gatewayIP());
  Serial.print("Signal strength (RSSI): ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
  Serial.print("IoT Device ID (MAC): ");
  Serial.println(getDeviceId());
  fetchDeviceConfig();
  return true;
}

void sendReading(int fillPercentage) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi disconnected. Reconnecting...");
    if (!connectWifi()) {
      Serial.println("Skipping upload because Wi-Fi is not connected.");
      return;
    }
  }

  bool hasConfig = fetchDeviceConfig();

  if (!hasConfig || !hasLinkedAssignment) {
    Serial.println("Skipping reading upload until this ESP32 is assigned from the admin panel.");
    return;
  }

  HTTPClient http;
  http.begin(API_URL);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");

  if (String(DEVICE_API_KEY).length() > 0) {
    http.addHeader("x-device-key", DEVICE_API_KEY);
  }

  String deviceId = getDeviceId();
  String payload =
    String("{") +
    "\"deviceId\":\"" + deviceId + "\"," +
    (linkedBinId.length() > 0 ? "\"binId\":\"" + linkedBinId + "\"," : "") +
    "\"fillPercentage\":" + String(fillPercentage) + "," +
    "\"zone\":\"" + linkedZone + "\"," +
    "\"locationLabel\":\"" + linkedLocationLabel + "\"," +
    "\"deviceStatus\":\"" + linkedDeviceStatus + "\"" +
    "}";

  int responseCode = http.POST(payload);
  String responseBody = http.getString();

  Serial.print("POST ");
  Serial.print(API_URL);
  Serial.print(" -> ");
  Serial.println(responseCode);

  if (responseCode < 0) {
    Serial.print("HTTP upload error: ");
    Serial.println(http.errorToString(responseCode));
    Serial.println("Reading was not uploaded. Check backend IP, port, server status, and firewall.");
  }

  if (responseBody.length() > 0) {
    Serial.println(responseBody);
  }

  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  printStartupBanner();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  if (!connectWifi()) {
    Serial.print("Will retry Wi-Fi in ");
    Serial.print(WIFI_RETRY_DELAY_MS / 1000);
    Serial.println(" seconds.");
  }
}

void loop() {
  bool wifiReady = WiFi.status() == WL_CONNECTED;

  if (WiFi.status() != WL_CONNECTED) {
    delay(WIFI_RETRY_DELAY_MS);
    wifiReady = connectWifi();
  }

  float distanceCm = readDistanceCm();

  if (distanceCm < 0) {
    Serial.println("No echo received from HC-SR04.");
    Serial.println("Check VCC, GND, TRIG pin 5, ECHO pin 18, and sensor direction.");
    delay(SEND_INTERVAL_MS);
    return;
  }

  int fillPercentage = toFillPercentage(distanceCm);
  String status = toStatus(fillPercentage);

  Serial.print("Filtered Distance (cm): ");
  Serial.println(distanceCm);
  Serial.print("Configured Bin Height (cm): ");
  Serial.println(BIN_HEIGHT_CM);
  Serial.print("Sensor Offset (cm): ");
  Serial.println(SENSOR_OFFSET_CM);
  Serial.print("Fill Percentage: ");
  Serial.println(fillPercentage);
  Serial.print("Status: ");
  Serial.println(status);
  printAssignmentSummary();

  if (wifiReady) {
    sendReading(fillPercentage);
  } else {
    Serial.println("Wi-Fi offline. Sensor reading shown locally, upload skipped this cycle.");
  }

  delay(SEND_INTERVAL_MS);
}
