"""Quick diagnostic - screenshot the editor page directly"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

FRONTEND = 'http://localhost:4000'
BACKEND  = 'http://localhost:4001'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_default_timeout(20000)

    errors = []
    page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type in ('error','warning') else None)

    # Step 1: homepage
    print("Loading homepage...")
    page.goto(FRONTEND, wait_until='networkidle')
    page.screenshot(path='/tmp/01_home.png', full_page=True)

    # Find editor links
    links = page.locator('a[href*="editor"]').all()
    print(f"Editor links: {len(links)}")
    for i, l in enumerate(links[:3]):
        print(f"  [{i}] {l.get_attribute('href')}")

    if links:
        href = links[0].get_attribute('href')
        # Navigate directly
        full_url = FRONTEND + href if href.startswith('/') else href
        print(f"\nNavigating directly to: {full_url}")
        page.goto(full_url, wait_until='networkidle')
        page.screenshot(path='/tmp/02_editor_direct.png', full_page=True)
        print(f"Final URL: {page.url}")
        print(f"Title: {page.title()}")

        # Check key elements
        video_count = page.locator('video').count()
        print(f"Video elements: {video_count}")

        # Wait a bit more for dynamic content
        page.wait_for_timeout(3000)
        page.screenshot(path='/tmp/03_editor_wait.png', full_page=True)
        print(f"After wait URL: {page.url}")

        # Get page content
        text = page.locator('body').inner_text()
        print(f"Page text (first 300 chars): {text[:300]}")

    print("\nConsole errors:")
    for e in errors[:10]:
        print(f"  {e[:100]}")

    # Test backend health directly
    print("\nBackend health check...")
    api = browser.new_page()
    r = api.goto(f'{BACKEND}/api/media', wait_until='domcontentloaded')
    print(f"  /api/media: HTTP {r.status if r else 'N/A'}")
    r2 = api.goto(f'{BACKEND}/health', wait_until='domcontentloaded')
    print(f"  /health: HTTP {r2.status if r2 else 'N/A'}")
    r3 = api.goto(f'{BACKEND}/api/health', wait_until='domcontentloaded')
    print(f"  /api/health: HTTP {r3.status if r3 else 'N/A'}")
    api.close()

    browser.close()
print("Done. Screenshots saved to /tmp/")
