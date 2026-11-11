# pip install selenium   |   python examples/selenium.py https://www.google.com/recaptcha/api2/demo
import sys
from pathlib import Path
from selenium import webdriver

DETECTOR = (Path(__file__).parent.parent / "dist" / "captcha-detector.js").read_text()
# Wrapping in a local `module` keeps the page's globals untouched.
CHECK = "var module = {exports: {}};" + DETECTOR + "; return module.exports.detect();"

driver = webdriver.Chrome()
driver.get(sys.argv[1] if len(sys.argv) > 1 else "https://www.google.com/recaptcha/api2/demo")
result = driver.execute_script(CHECK)
print(result["summary"])
for d in result["detections"]:
    print("-", d["name"], d["kind"], "visible" if d["visible"] else "")
driver.quit()
