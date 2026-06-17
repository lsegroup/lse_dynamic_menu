/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { AddSnippetDialog } from "@html_builder/snippets/add_snippet_dialog";
import { isBrowserFirefox } from "@web/core/browser/feature_detection";
import { onMounted } from "@odoo/owl";

/**
 * Two targeted patches for AddSnippetDialog — deliberately NOT copying
 * setup() to stay version-agnostic against whatever Odoo build is on the
 * server.
 *
 * 1. Firefox "load" event (pre-hook onMounted):
 *    Older Odoo builds unconditionally await the iframe "load" event in
 *    Firefox, but Firefox >= 148 no longer fires it for about:blank. We
 *    dispatch a synthetic "load" after 200 ms so the original hook can
 *    proceed. Registered BEFORE super.setup() so it runs first; by the
 *    time the 200 ms timer fires, the original async hook has already
 *    registered its listener and is suspended waiting.
 *
 * 2. insertStyle() timeout:
 *    After a deploy, Odoo lazily compiles SCSS on first request (can take
 *    10-90 s). The original onMounted awaits insertStyle(), which means
 *    `root` never gets assigned while bundles compile. When the user
 *    drops a snippet or otherwise closes the dialog, onWillUnmount runs
 *    `root.destroy()` on an undefined reference → crash.
 *    We race insertStyle() against a 500 ms timeout. The <link> elements
 *    are already in the iframe document so CSS continues loading in the
 *    background; root gets assigned promptly so destroy() always works.
 */
patch(AddSnippetDialog.prototype, {
    setup() {
        onMounted(() => {
            if (!isBrowserFirefox()) return;
            const iframeEl = this.iframeRef?.el;
            if (!iframeEl) return;
            setTimeout(() => iframeEl.dispatchEvent(new Event("load")), 200);
        });
        super.setup();
    },

    async insertStyle() {
        await Promise.race([
            super.insertStyle(),
            new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
    },
});
