"""Debug editor error in detail"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

FRONTEND = 'http://localhost:4000'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_default_timeout(20000)

    all_logs = []
    page.on('console', lambda m: all_logs.append(f"[{m.type}] {m.text}"))
    page.on('pageerror', lambda e: all_logs.append(f"[PAGE ERROR] {e}"))

    # Load homepage first
    page.goto(FRONTEND, wait_until='networkidle')
    links = page.locator('a[href*="editor"]').all()
    if not links:
        print("No editor links found!")
        browser.close()
        sys.exit(1)

    href = links[0].get_attribute('href')
    full_url = FRONTEND + href
    print(f"Navigating to: {full_url[:100]}")

    # Navigate
    page.goto(full_url, wait_until='domcontentloaded')
    page.wait_for_timeout(5000)

    print(f"\nFinal URL: {page.url}")
    print(f"Title: {page.title()}")

    # Screenshot
    page.screenshot(path='/tmp/debug_editor.png', full_page=True)

    # Get page source for analysis
    content = page.content()
    print(f"\nPage body text: {page.locator('body').inner_text()[:500]}")

    print(f"\nAll console messages ({len(all_logs)}):")
    for log in all_logs[:30]:
        print(f"  {log[:200]}")

    browser.close()
