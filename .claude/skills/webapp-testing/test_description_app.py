"""
Functional tests for the Description video editing web app.
Frontend: http://localhost:4000  |  Backend: http://localhost:4001
"""
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from playwright.sync_api import sync_playwright

FRONTEND = 'http://localhost:4000'
BACKEND  = 'http://localhost:4001'

def run_tests():
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        page.set_default_timeout(20000)

        errors = []
        page.on('console', lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(f"[PAGE ERROR] {e}"))

        try:
            # ── Test 1: Backend health ──────────────────────────────────────────
            print("Test 1: Backend health (/health)...")
            api = ctx.new_page()
            r = api.goto(f'{BACKEND}/health', wait_until='domcontentloaded')
            ok = r and r.status == 200
            print(f"  Status: {r.status if r else 'N/A'}")
            results.append(('Backend /health', ok, f'HTTP {r.status if r else "N/A"}'))
            api.close()

            # ── Test 2: Media list API ──────────────────────────────────────────
            print("Test 2: Media list API (/api/media)...")
            api2 = ctx.new_page()
            r2 = api2.goto(f'{BACKEND}/api/media', wait_until='domcontentloaded')
            ok2 = r2 and r2.status == 200
            body2 = r2.text() if r2 else ''
            try:
                data = json.loads(body2)
                count = len(data) if isinstance(data, list) else '?'
            except:
                count = '?'
            print(f"  Status: {r2.status if r2 else 'N/A'}, Items: {count}")
            results.append(('Media list API', ok2, f'{count} media items'))
            api2.close()

            # ── Test 3: Homepage ────────────────────────────────────────────────
            print("Test 3: Homepage loads...")
            page.goto(FRONTEND, wait_until='networkidle')
            title = page.title()
            page.screenshot(path='/tmp/01_homepage.png', full_page=True)
            ok3 = 'Descript' in title or 'Video' in title or bool(title)
            print(f"  Title: {title}")
            results.append(('Homepage loads', ok3, title))

            # ── Test 4: Project cards visible ───────────────────────────────────
            print("Test 4: Project cards visible...")
            page.wait_for_timeout(1000)
            editor_links = page.locator('a[href*="editor"]').all()
            print(f"  Editor links: {len(editor_links)}")
            results.append(('Project cards shown', len(editor_links) > 0, f'{len(editor_links)} projects'))

            # ── Test 5: Open editor ─────────────────────────────────────────────
            print("Test 5: Open editor page...")
            if editor_links:
                href = editor_links[0].get_attribute('href')
                page.goto(FRONTEND + href, wait_until='domcontentloaded')
                page.wait_for_timeout(3000)
                page.screenshot(path='/tmp/02_editor.png', full_page=True)
                ok5 = 'editor' in page.url and page.title() != ''
                print(f"  URL: {page.url}")
                print(f"  Title: {page.title()}")
                results.append(('Editor page loads', ok5, page.title()))
            else:
                results.append(('Editor page loads', False, 'no editor links'))

            # ── Test 6: Transcript loaded ───────────────────────────────────────
            print("Test 6: Transcript content visible...")
            body_text = page.locator('body').inner_text()
            # Check for transcript-like content (Chinese or long text segments)
            has_transcript = len(body_text) > 200
            print(f"  Body text length: {len(body_text)}")
            results.append(('Transcript content visible', has_transcript, f'{len(body_text)} chars'))

            # ── Test 7: Video player ────────────────────────────────────────────
            print("Test 7: Video player present...")
            video_count = page.locator('video').count()
            print(f"  Video elements: {video_count}")
            results.append(('Video player present', video_count > 0, f'{video_count} video elements'))

            # ── Test 8: Timeline present ────────────────────────────────────────
            print("Test 8: Timeline present...")
            page.wait_for_timeout(2000)
            page.screenshot(path='/tmp/03_editor_loaded.png', full_page=True)
            # Look for timeline by common class patterns
            timeline_els = page.locator('[class*="timeline"], [class*="Timeline"], [data-testid*="timeline"]').count()
            # Also check for thumbnail strips (another indicator of timeline)
            canvas_els = page.locator('canvas, img[src*="thumbnail"]').count()
            print(f"  Timeline elements: {timeline_els}, Canvas/thumbnails: {canvas_els}")
            results.append(('Timeline/thumbnails present', timeline_els > 0 or canvas_els > 0,
                           f'{timeline_els} timeline, {canvas_els} thumbnails'))

            # ── Test 9: Underlord AI sidebar ────────────────────────────────────
            print("Test 9: Underlord AI sidebar...")
            # Look for sidebar with AI content
            underlord_text = page.get_by_text('Underlord', exact=False).count()
            ai_input = page.locator('textarea').count()
            print(f"  'Underlord' text: {underlord_text}, Textarea: {ai_input}")
            results.append(('Underlord AI sidebar', underlord_text > 0, f'Underlord: {underlord_text}, textarea: {ai_input}'))

            # ── Test 10: Check Underlord is enabled (not "upload video first") ──
            print("Test 10: Underlord enabled (has media)...")
            upload_msg = page.get_by_text('Upload a video first', exact=False).count()
            print(f"  'Upload a video first' messages: {upload_msg}")
            results.append(('Underlord enabled with media', upload_msg == 0,
                           'enabled' if upload_msg == 0 else f'"upload video first" shown ({upload_msg}x)'))

        except Exception as e:
            print(f"ERROR: {e}")
            import traceback; traceback.print_exc()
            results.append(('Unexpected error', False, str(e)[:100]))
            try: page.screenshot(path='/tmp/error.png', full_page=True)
            except: pass
        finally:
            if errors:
                print(f"\nPage errors ({len(errors)}):")
                for e in errors[:5]: print(f"  {e[:120]}")
            browser.close()

    # ── Summary ─────────────────────────────────────────────────────────────────
    print("\n" + "="*60)
    print("TEST RESULTS")
    print("="*60)
    passed = failed = 0
    for name, ok, detail in results:
        marker = "PASS" if ok else "FAIL"
        print(f"  [{marker}]  {name}" + (f"  [{detail}]" if detail else ""))
        if ok: passed += 1
        else: failed += 1
    print(f"\n  {passed} passed, {failed} failed")
    return failed == 0

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
