from playwright.sync_api import sync_playwright
import time

MEDIA_ID = "bd994238-2a6d-4da1-968a-d594effe8ade"
MEDIA_URL = "http://localhost:3001/uploads/videos/92276103-bf1e-4d50-a018-b5adfe201657.mp4"
URL = f"http://localhost:4000/editor/{MEDIA_ID}?mediaUrl={MEDIA_URL}"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(URL)
    page.wait_for_load_state('domcontentloaded')
    time.sleep(4)
    page.screenshot(path='/tmp/editor_current.png', full_page=False)
    print("Screenshot saved: /tmp/editor_current.png")
    browser.close()
