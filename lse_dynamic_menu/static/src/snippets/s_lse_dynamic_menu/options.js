/** @odoo-module **/

import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { ColorPicker } from "@web/core/color_picker/color_picker";

/**
 * LSE Dynamic Menu — Builder Plugin (Odoo 19)
 *
 * Runs inside website.website_builder_assets.
 * this.document = the page iframe's document (content being edited).
 * Parent frame (editor sidebar) = this.document.defaultView.parent.document.
 *
 * Injects a sidebar options panel when the user clicks a .s_lse_dynamic_menu
 * snippet in the editor, exactly mirroring the previous vanilla-JS approach
 * but wrapped in proper Plugin lifecycle so Odoo's builder never crashes.
 */

const PANEL_ID = "lse_dynamic_menu_panel";

// ── Style tokens (dark Odoo sidebar palette) ──────────────────────────────────
const C_HDR   = "#2B2B33";
const C_ROW   = "#3E3E46";
const C_TEXT  = "#e0e0e8";
const C_MUTED = "#9090a0";
const C_BORD  = "rgba(255,255,255,0.1)";
const C_ACTIVE = "#256F7E";

const S_INPUT  = `font-size:0.82rem;border:1px solid ${C_BORD};border-radius:4px;padding:3px 7px;flex:1;min-width:0;background:${C_HDR};color:${C_TEXT};`;
const S_NUM_SM = `font-size:0.78rem;border:1px solid ${C_BORD};border-radius:3px;padding:2px 4px;width:44px;background:${C_HDR};color:${C_TEXT};text-align:center;`;
const S_LABEL  = `font-size:0.8rem;white-space:nowrap;min-width:70px;margin:0;color:${C_MUTED};`;
const S_LBL_SM = `font-size:0.78rem;white-space:nowrap;margin:0;color:${C_MUTED};`;
const S_ROW    = `display:flex;align-items:center;gap:8px;padding:6px 12px;background:${C_ROW};border-bottom:1px solid rgba(0,0,0,0.22);`;
// S_COLOR is a base for color swatches — background is overridden inline per swatch
const S_COLOR  = `display:inline-block;width:26px;height:22px;border:1px solid ${C_BORD};border-radius:3px;cursor:pointer;flex-shrink:0;`;

const TRASH_SVG =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
    '     stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '  <polyline points="3 6 5 6 21 6"/>' +
    '  <path d="m19 6-.867 13.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 6"/>' +
    '  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
    "</svg>";

function btnStyle(active) {
    return active
        ? `font-size:0.73rem;border-radius:3px;padding:2px 9px;cursor:pointer;background:${C_ACTIVE};color:#fff;border:1px solid ${C_ACTIVE};`
        : `font-size:0.73rem;border-radius:3px;padding:2px 9px;cursor:pointer;background:${C_HDR};color:${C_MUTED};border:1px solid ${C_BORD};`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function rgbToHex(rgb) {
    if (!rgb) return null;
    const m = rgb.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return null;
    return "#" + [m[1], m[2], m[3]].map((v) => ("0" + parseInt(v, 10).toString(16)).slice(-2)).join("");
}

function resolveDefaultLinkColor(el) {
    try {
        const link = el.querySelector(".nav-link");
        if (link) {
            const hex = rgbToHex(el.ownerDocument.defaultView.getComputedStyle(link).color);
            if (hex) return hex;
        }
    } catch (e) { /* ignore */ }
    return "#212529";
}

function resolveDefaultHoverColor(el) {
    try {
        const roots = [el, el.ownerDocument.documentElement];
        const props = ["--lse-link-hover-color", "--link-color", "--bs-link-color"];
        for (const root of roots) {
            for (const prop of props) {
                const val = el.ownerDocument.defaultView.getComputedStyle(root).getPropertyValue(prop).trim();
                if (val) {
                    if (val.startsWith("#")) return val;
                    const hex = rgbToHex(val);
                    if (hex) return hex;
                }
            }
        }
    } catch (e) { /* ignore */ }
    return "#0d6efd";
}

function attachInput(input, delay, cb) {
    let timer;
    input.addEventListener("input", (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => cb(e.target.value), delay);
    });
    ["click", "mousedown", "keydown", "keyup"].forEach((ev) =>
        input.addEventListener(ev, (e) => e.stopPropagation())
    );
}

// ── Plugin ────────────────────────────────────────────────────────────────────

class LseDynamicMenuBuilderPlugin extends Plugin {
    static id = "lse_dynamic_menu_builder";

    setup() {
        this._boundClick = this._onPageClick.bind(this);
        // this.document is the page iframe's document
        this.document.addEventListener("click", this._boundClick);
    }

    destroy() {
        this.document.removeEventListener("click", this._boundClick);
        this._removePanel();
    }

    // ── Sidebar document (parent/editor frame) ────────────────────────────────

    _sidebarDoc() {
        try {
            const view = this.document.defaultView;
            if (view && view.parent !== view) return view.parent.document;
        } catch (e) { /* cross-origin guard */ }
        return this.document;
    }

    // ── Panel lifecycle ───────────────────────────────────────────────────────

    _removePanel() {
        const doc = this._sidebarDoc();
        const p = doc.getElementById(PANEL_ID);
        if (p) p.remove();
        const tab = doc.querySelector(".o_customize_tab");
        if (tab) tab.style.removeProperty("height");
    }

    _findInsertionPoint() {
        const doc = this._sidebarDoc();
        const customizeTab = doc.querySelector(".o_customize_tab");
        if (customizeTab) return { parent: customizeTab, before: null };

        const lowerPanel = doc.querySelector(".o_we_lower_panel");
        if (lowerPanel && lowerPanel.parentElement) {
            return { parent: lowerPanel.parentElement, before: lowerPanel };
        }
        const el =
            doc.querySelector(".o_we_customize_panel") ||
            doc.querySelector(".o-website-builder_sidebar") ||
            doc.querySelector(".o_snippets_options_wrap");
        return el ? { parent: el, before: null } : null;
    }

    // ── Odoo ColorPicker (Theme/Custom/Gradient tabs) via popover service ─────

    _openColorPicker(swatchEl, currentColor, onChange) {
        if (!this.services?.popover) return;
        const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(currentColor) ? currentColor : "#000000";
        const applyColor = (color) => { onChange(color); swatchEl.style.background = color; };
        this.services.popover.add(
            swatchEl,
            ColorPicker,
            {
                state: {
                    selectedColor: safeColor,
                    defaultTab: "custom",
                    selectedTab: "custom",
                },
                getUsedCustomColors: () => [],
                applyColor,
                applyColorPreview: applyColor,
                applyColorResetPreview: () => {},
                colorPrefix: "color-prefix-",
                cssVarColorPrefix: "hb-cp-",
                enabledTabs: ["theme", "gradient", "custom"],
                noTransparency: true,
                className: "o-hb-colorpicker",
            },
            {
                position: "bottom",
                popoverClass: "o-hb-colorpicker-popover",
            }
        );
    }

    // ── Click handler ─────────────────────────────────────────────────────────

    _onPageClick(e) {
        const snippet = e.target.closest && e.target.closest(".s_lse_dynamic_menu");
        const inPalette = e.target.closest &&
            e.target.closest(".o_snippets_list, .o_we_snippets_tabs");

        if (snippet && !inPalette) {
            setTimeout(() => this._buildPanel(snippet), 600);
        } else {
            const sidebarDoc = this._sidebarDoc();
            if (!e.target.closest || !e.target.closest("#" + PANEL_ID)) {
                // Also check if click was in the sidebar doc
                if (!sidebarDoc.getElementById(PANEL_ID)?.contains(e.target)) {
                    this._removePanel();
                }
            }
        }
    }

    // ── Build panel ───────────────────────────────────────────────────────────

    _buildPanel(snippetEl) {
        this._removePanel();
        const insertion = this._findInsertionPoint();
        if (!insertion) return;

        const ds          = snippetEl.dataset;
        const urlPath     = ds.urlPath        || "/services";
        const menuHeight  = parseInt(ds.lseMenuHeight, 10) || 100;
        const linkColor   = ds.lseLinkColor   || resolveDefaultLinkColor(snippetEl);
        const hoverColor  = ds.lseHoverColor  || resolveDefaultHoverColor(snippetEl);
        const fontSize    = parseInt(ds.lseFontSize, 10) || 14;
        const fontWeight  = ds.lseFontWeight  || "400";
        const fadeColor   = ds.lseFadeColor   || "#ffffff";
        const fadeOp      = ds.lseFadeOpacity !== undefined ? ds.lseFadeOpacity : "92";

        const isBold = fontWeight === "700" || fontWeight === "600";
        const doc    = this._sidebarDoc();
        const panel  = doc.createElement("div");
        panel.id = PANEL_ID;
        panel.style.cssText = "overflow:hidden;font-family:inherit;border-bottom:1px solid rgba(0,0,0,.4);";

        panel.innerHTML =
            // Header
            `<div style="display:flex;align-items:center;padding:7px 12px;background:${C_HDR};border-bottom:1px solid rgba(0,0,0,.35);">` +
            `  <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${C_TEXT};">Dynamic Menu</span>` +
            `  <button id="lse_delete_btn" title="Remove this snippet" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#fff;padding:2px;line-height:1;display:flex;align-items:center;">${TRASH_SVG}</button>` +
            `</div>` +

            // URL Path
            `<div style="${S_ROW}">` +
            `  <label style="${S_LABEL}">URL Path</label>` +
            `  <input type="text" id="lse_url_path" style="${S_INPUT}" value="${urlPath}" placeholder="/services"/>` +
            `</div>` +

            // Height
            `<div style="${S_ROW}">` +
            `  <label style="${S_LABEL}">Height</label>` +
            `  <input type="number" id="lse_height" min="80" max="800" step="20" style="${S_INPUT}" value="${menuHeight}"/>` +
            `  <span style="${S_LBL_SM}">px</span>` +
            `</div>` +

            // Link / Hover colour
            `<div style="${S_ROW}">` +
            `  <label style="${S_LABEL}">Link Color</label>` +
            `  <div id="lse_link_color" style="${S_COLOR}background:${linkColor};" title="Link color"></div>` +
            `  <label style="${S_LBL_SM}margin-left:4px;">Hover</label>` +
            `  <div id="lse_hover_color" style="${S_COLOR}background:${hoverColor};" title="Hover color"></div>` +
            `</div>` +

            // Font size
            `<div style="${S_ROW}">` +
            `  <label style="${S_LABEL}">Font Size</label>` +
            `  <button id="lse_font_dec" style="${btnStyle(false)}padding:1px 9px;font-size:1rem;line-height:1.2;">−</button>` +
            `  <input type="number" id="lse_font_size" min="8" max="72" style="${S_NUM_SM}" value="${fontSize}"/>` +
            `  <span style="${S_LBL_SM}">px</span>` +
            `  <button id="lse_font_inc" style="${btnStyle(false)}padding:1px 9px;font-size:1rem;line-height:1.2;">+</button>` +
            `</div>` +

            // Font weight
            `<div style="${S_ROW}">` +
            `  <label style="${S_LABEL}">Font Weight</label>` +
            `  <div style="display:flex;gap:4px;">` +
            `    <button id="lse_fw_regular" style="${btnStyle(!isBold)}">Regular</button>` +
            `    <button id="lse_fw_bold"    style="${btnStyle(isBold)}">Bold</button>` +
            `  </div>` +
            `</div>` +

            // Scroll fade
            `<div style="${S_ROW.replace("border-bottom:1px solid rgba(0,0,0,0.22)", "border-bottom:none")}">` +
            `  <label style="${S_LABEL}">Scroll Fade</label>` +
            `  <div id="lse_fade_color" style="${S_COLOR}background:${fadeColor};" title="Fade color"></div>` +
            `  <label style="${S_LBL_SM}margin-left:4px;">Opacity</label>` +
            `  <input type="number" id="lse_fade_opacity" min="0" max="100" style="${S_NUM_SM}" value="${fadeOp}"/>` +
            `  <span style="${S_LBL_SM}">%</span>` +
            `</div>`;

        // ── Wire controls ─────────────────────────────────────────────────────

        panel.querySelector("#lse_delete_btn").addEventListener("click", (e) => {
            e.stopPropagation();
            snippetEl.remove();
            this._removePanel();
        });

        attachInput(panel.querySelector("#lse_url_path"), 500, (val) => {
            snippetEl.dataset.urlPath = val.trim() || "/services";
            snippetEl.dispatchEvent(new CustomEvent("lse_reload_menu"));
        });

        attachInput(panel.querySelector("#lse_height"), 400, (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n >= 80) snippetEl.dataset.lseMenuHeight = n;
        });

        const linkColorSwatch  = panel.querySelector("#lse_link_color");
        const hoverColorSwatch = panel.querySelector("#lse_hover_color");
        [linkColorSwatch, hoverColorSwatch].forEach((el) =>
            ["click", "mousedown"].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()))
        );
        linkColorSwatch.addEventListener("click", () => {
            this._openColorPicker(
                linkColorSwatch,
                snippetEl.dataset.lseLinkColor || linkColor,
                (v) => { snippetEl.dataset.lseLinkColor = v; }
            );
        });
        hoverColorSwatch.addEventListener("click", () => {
            this._openColorPicker(
                hoverColorSwatch,
                snippetEl.dataset.lseHoverColor || hoverColor,
                (v) => { snippetEl.dataset.lseHoverColor = v; }
            );
        });

        const fontSizeInput = panel.querySelector("#lse_font_size");
        const fwRegular     = panel.querySelector("#lse_fw_regular");
        const fwBold        = panel.querySelector("#lse_fw_bold");

        const refreshWeightBtns = (w) => {
            const b = w === "700" || w === "600";
            fwRegular.style.cssText = btnStyle(!b);
            fwBold.style.cssText    = btnStyle(b);
        };

        const setFontSize = (n) => {
            snippetEl.dataset.lseFontSize = n;
            fontSizeInput.value = n;
        };

        panel.querySelector("#lse_font_dec").addEventListener("click", (e) => {
            e.stopPropagation();
            setFontSize(Math.max(8, parseInt(fontSizeInput.value, 10) - 1));
        });
        panel.querySelector("#lse_font_inc").addEventListener("click", (e) => {
            e.stopPropagation();
            setFontSize(Math.min(72, parseInt(fontSizeInput.value, 10) + 1));
        });
        attachInput(fontSizeInput, 300, (val) => {
            const n = parseInt(val, 10);
            if (!isNaN(n) && n >= 8 && n <= 72) setFontSize(n);
        });

        fwRegular.addEventListener("click", (e) => {
            e.stopPropagation();
            snippetEl.dataset.lseFontWeight = "400";
            refreshWeightBtns("400");
        });
        fwBold.addEventListener("click", (e) => {
            e.stopPropagation();
            snippetEl.dataset.lseFontWeight = "700";
            refreshWeightBtns("700");
        });

        const fadeColorSwatch = panel.querySelector("#lse_fade_color");
        ["click", "mousedown"].forEach((ev) => fadeColorSwatch.addEventListener(ev, (e) => e.stopPropagation()));
        fadeColorSwatch.addEventListener("click", () => {
            this._openColorPicker(
                fadeColorSwatch,
                snippetEl.dataset.lseFadeColor || fadeColor,
                (v) => { snippetEl.dataset.lseFadeColor = v; }
            );
        });
        attachInput(panel.querySelector("#lse_fade_opacity"), 300, (v) => { snippetEl.dataset.lseFadeOpacity = v; });

        // ── Inject ────────────────────────────────────────────────────────────
        if (insertion.before) {
            insertion.parent.insertBefore(panel, insertion.before);
        } else {
            insertion.parent.appendChild(panel);
        }

        const tab = doc.querySelector(".o_customize_tab");
        if (tab) tab.style.setProperty("height", "auto", "important");
    }
}

registry.category("website-plugins").add("lse_dynamic_menu_builder", LseDynamicMenuBuilderPlugin);