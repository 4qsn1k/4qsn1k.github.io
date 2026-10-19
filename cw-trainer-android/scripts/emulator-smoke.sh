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
