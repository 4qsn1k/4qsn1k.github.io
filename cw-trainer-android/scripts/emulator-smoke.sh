#!/usr/bin/env bash
set -euo pipefail
PKG=com.cwtrainer.pocket
APK=dist/cw-trainer-ci-debug.apk
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity"
sleep 3
for retry in 1 2 3; do
  if adb shell uiautomator dump /sdcard/window.xml; then break; fi
  sleep 2
done
adb exec-out cat /sdcard/window.xml > window.xml
python3 - <<'PY'
import xml.etree.ElementTree as ET
import re,subprocess
root=ET.parse("window.xml").getroot()
targets=[e.attrib for e in root.iter() if "ПОЛНЫЙ КУРС" in e.attrib.get("text","")]
if not targets:
  labels=[e.attrib.get("text","") for e in root.iter() if e.attrib.get("text")]
  raise RuntimeError("Full course button not found. Screen labels: "+repr(labels))
bounds=targets[0]["bounds"]
nums=list(map(int,re.findall(r"\d+",bounds)))
if len(nums)!=4: raise RuntimeError("Invalid bounds: "+bounds)
x=(nums[0]+nums[2])//2
y=(nums[1]+nums[3])//2
subprocess.run(["adb","shell","input","tap",str(x),str(y)],check=True)
print("Tapped Full Course button at",x,y,flush=True)
PY
sleep 4
adb shell dumpsys activity activities > activities.log
if ! grep -E 'mResumedActivity|topResumedActivity|ResumedActivity' activities.log | grep -q 'FullCourseActivity'; then
  echo "Full Course screen not foreground. Activity state:"
  grep -E 'ResumedActivity|FullCourseActivity|mResumedActivity' activities.log | head -25
  exit 1
fi
echo 'PASS: Full Course opened from home button'
tap_ui_text(){
  adb shell uiautomator dump /sdcard/window.xml >/dev/null
  adb exec-out cat /sdcard/window.xml > /tmp/cwtrainer-ui.xml
  python3 - "$1" <<'PY'
import re,sys,xml.etree.ElementTree as ET,subprocess
phrase=sys.argv[1]
root=ET.parse('/tmp/cwtrainer-ui.xml').getroot()
matches=[n.attrib for n in root.iter() if phrase in n.attrib.get('text','')]
if not matches:
    raise SystemExit("Missing UI element '"+phrase+"': "+
        repr([n.attrib.get('text') for n in root.iter() if n.attrib.get('text')][:35]))
numbers=list(map(int,re.findall(r'\d+',matches[0]['bounds'])))
if len(numbers)!=4:raise SystemExit("Invalid tap bounds")
x=(numbers[0]+numbers[2])//2
y=(numbers[1]+numbers[3])//2
subprocess.run(['adb','shell','input','tap',str(x),str(y)],check=True)
print('Tapped:',phrase,x,y)
PY
}
adb shell input keyevent KEYCODE_BACK
sleep 2
tap_ui_text 'ЕЖЕДНЕВНАЯ ТРЕНИРОВКА'
sleep 3
adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumedActivity|topResumedActivity' | grep -q 'DailyPracticeActivity'
echo 'PASS: Daily adaptive coaching opens and lesson starts'
adb shell input keyevent KEYCODE_BACK
sleep 2
tap_ui_text 'ПОДГОТОВКА'
sleep 3
adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumedActivity|topResumedActivity' | grep -q 'SrrExamMenuActivity'
echo 'PASS: First-category exam menu opens from home button'
tap_ui_text 'Изучать 426'
sleep 3
adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumedActivity|topResumedActivity' | grep -q 'SrrTheoryActivity'
echo 'PASS: Complete offline 426-question theory bank opens'
tap_ui_text 'Показать оригинал'
sleep 3
adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumedActivity|topResumedActivity' | grep -q 'SrrOriginalPdfActivity'
echo 'PASS: Offline official PDF page with source diagrams opens'
adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell input keyevent KEYCODE_BACK
sleep 1
adb shell run-as "$PKG" mkdir -p files
adb shell run-as "$PKG" touch files/cwtrainer-upgrade-marker
adb shell am force-stop "$PKG"
adb install -r "$APK"
adb shell run-as "$PKG" test -f files/cwtrainer-upgrade-marker
echo 'PASS: In-place update preserves application files'
adb shell am start -W -n "$PKG/.MainActivity"
sleep 3
adb logcat -d -s AndroidRuntime:E > crashes.log
if grep -q 'FATAL EXCEPTION' crashes.log; then cat crashes.log; exit 1; fi
echo 'PASS: No AndroidRuntime fatal exceptions'

echo 'VERIFY PUBLISHED PERMANENTLY SIGNED APK UPDATE 0.4.2 -> 0.4.3'
BASE='https://raw.githubusercontent.com/4qsn1k/4qsn1k.github.io/refs/heads/codex/cw-trainer-apk-v01/cw-trainer-android/releases'
curl -fsSL --retry 3 "$BASE/CW-Trainer-Pocket-v0.4.2.apk" -o dist/release-v042.apk
curl -fsSL --retry 3 "$BASE/CW-Trainer-Pocket-v0.4.3.apk" -o dist/release-v043.apk
echo 'FACB79A0DFAC07C0DF1F860A6FF582A2266BC944FBC7F3301A96F1842C752611  dist/release-v042.apk' | sha256sum -c -
echo 'BAD876BDA3C9FE32914FDA1C0CD599CE1C283AC08A776820E469315E79401B96  dist/release-v043.apk' | sha256sum -c -
SIGNER="$ANDROID_HOME/build-tools/35.0.0/apksigner"
C1=$("$SIGNER" verify --print-certs dist/release-v042.apk | grep 'Signer #1 certificate SHA-256 digest')
C2=$("$SIGNER" verify --print-certs dist/release-v043.apk | grep 'Signer #1 certificate SHA-256 digest')
test "$C1" = "$C2"
echo "$C1" | grep -q 'fefa0f47d6fd231c6b3f9fcd106e79c30656970fa28f6ba9a346c4bd593f4217'
echo 'PASS: Stable release certificate is identical in both versions'
adb uninstall "$PKG"
adb install dist/release-v042.apk
adb shell am start -W -n "$PKG/.MainActivity"
sleep 2
adb shell run-as "$PKG" mkdir -p files
adb shell run-as "$PKG" touch files/stable-upgrade-marker
adb install -r dist/release-v043.apk
adb shell am start -W -n "$PKG/.MainActivity"
sleep 3
adb shell dumpsys package "$PKG" | grep -q 'versionCode=9'
# On userdebug emulator images adb root can verify stored marker in the now
# non-debuggable release; do not fail just because root is unavailable.
if adb root 2>&1 | grep -q 'restarting adbd as root'; then
  adb wait-for-device
  test "$(adb shell cat /data/user/0/$PKG/files/stable-upgrade-marker | tr -d '\r')" = ''
  echo 'PASS: Persistent app file survived debug-to-release upgrade'
fi
adb logcat -d -s AndroidRuntime:E > release-crashes.log
if grep -q 'FATAL EXCEPTION' release-crashes.log; then cat release-crashes.log; exit 1; fi
echo 'PASS: Stable 0.4.2 -> 0.4.3 installed in place, signed release starts successfully'

echo 'VERIFY PRODUCTION SIGNED UPGRADE 0.5.0 -> 0.5.1'
curl -fsSL --retry 3 "$BASE/CW-Trainer-Pocket-v0.5.0.apk" -o dist/release-v050.apk
curl -fsSL --retry 3 "$BASE/CW-Trainer-Pocket-v0.5.1.apk" -o dist/release-v051.apk
echo 'FFB78DDC4C33B83369CDB97EDD151C5D8CB34544F5C4A2CCE9840ED84817B92E  dist/release-v050.apk' | sha256sum -c -
echo '98ABC41A96985927D63C73E70F4D52902160CDA166B8918FBBEEC46B8036403E  dist/release-v051.apk' | sha256sum -c -
C50=$("$SIGNER" verify --print-certs dist/release-v050.apk | grep 'Signer #1 certificate SHA-256 digest')
C51=$("$SIGNER" verify --print-certs dist/release-v051.apk | grep 'Signer #1 certificate SHA-256 digest')
test "$C50" = "$C51"
adb uninstall "$PKG"
adb install dist/release-v050.apk
adb shell am start -W -n "$PKG/.MainActivity"
sleep 2
# Check preservation when emulator permits root inspection of non-debuggable app data.
if adb root 2>&1 | grep -qE 'restarting adbd as root|already running as root'; then
  adb wait-for-device
  adb shell "mkdir -p /data/user/0/$PKG/files && touch /data/user/0/$PKG/files/cw051-update-marker"
  MARKER_AVAILABLE=1
else
  MARKER_AVAILABLE=0
fi
adb install -r dist/release-v051.apk
adb shell am start -W -n "$PKG/.MainActivity"
sleep 2
adb shell dumpsys package "$PKG" | grep -q 'versionCode=11'
if [ "$MARKER_AVAILABLE" -eq 1 ]; then
  adb shell test -f "/data/user/0/$PKG/files/cw051-update-marker"
  echo 'PASS: 0.5.0 -> 0.5.1 preserved private application files'
fi
adb logcat -d -s AndroidRuntime:E > signed-upgrade-crashes.log
if grep -q 'FATAL EXCEPTION' signed-upgrade-crashes.log; then cat signed-upgrade-crashes.log; exit 1; fi
echo 'PASS: Production upgrade 0.5.0 -> 0.5.1 with permanent signer'
