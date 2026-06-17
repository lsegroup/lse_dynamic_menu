/** @odoo-module **/

import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

/**
 * LSE Dynamic Menu — Frontend Interaction (Odoo 19 Colibri)
 *
 * data-url-path           → base URL used to query menu items
 * data-lse-menu-height    → scroll container height in px (default 100)
 * data-lse-link-color     → hex colour for normal link text
 * data-lse-hover-color    → hex colour for hovered link text
 * data-lse-font-size      → font size in px
 * data-lse-font-weight    → font weight: "400" normal | "700" bold
 * data-lse-fade-color     → hex colour for scroll fade overlays (default #ffffff)
 * data-lse-fade-opacity   → fade overlay opacity 0-100 (default 92)
 */
class LseDynamicMenu extends Interaction {
    static selector = ".s_lse_dynamic_menu";
    static disabledInEditableMode = true;

    setup() {
        this._loadMenu();
        this._applyStyles();

        this.el.addEventListener("lse_reload_menu", () => this._loadMenu());

        this._attrObserver = new MutationObserver((mutations) => {
            let reload = false, restyle = false;
            for (const m of mutations) {
                if (m.attributeName === "data-url-path") reload = true;
                else restyle = true;
            }
            if (reload) this._loadMenu();
            if (restyle) this._applyStyles();
        });
        this._attrObserver.observe(this.el, {
            attributes: true,
            attributeFilter: [
                "data-url-path",
                "data-lse-menu-height",
                "data-lse-link-color",
                "data-lse-hover-color",
                "data-lse-font-size",
                "data-lse-font-weight",
                "data-lse-fade-color",
                "data-lse-fade-opacity",
            ],
        });

        const list = this.el.querySelector(".lse-menu-list");
        if (list) {
            list.addEventListener("scroll", () => this._updateScrollShadow());
        }
    }

    destroy() {
        if (this._attrObserver) this._attrObserver.disconnect();
    }

    // ------------------------------------------------------------------

    async _loadMenu() {
        const urlPath = this.el.dataset.urlPath || "/services";
        try {
            const res = await fetch(
                `/lse_dynamic_menu/get_items?url_path=${encodeURIComponent(urlPath)}`
            );
            if (!res.ok) {
                this._showError(`Server returned ${res.status}`);
                return;
            }
            const items = await res.json();
            this._render(items);
        } catch (err) {
            this._showError("Could not reach /lse_dynamic_menu/get_items");
            console.error("[LSE Dynamic Menu]", err);
        }
    }

    _render(items) {
        const list = this.el.querySelector(".lse-menu-list");
        if (!list) return;
        list.innerHTML = "";
        if (!items || !items.length) {
            list.innerHTML = `<li class="nav-item">
                <span class="nav-link text-muted fst-italic">No menu items found for this path.</span>
            </li>`;
        } else {
            items.forEach((item) => list.appendChild(this._createItem(item)));
        }
        this._updateScrollShadow();
    }

    _createItem(item) {
        const hasChildren = item.children && item.children.length > 0;
        const li = document.createElement("li");
        li.className = hasChildren ? "nav-item dropdown" : "nav-item";

        if (hasChildren) {
            const a = document.createElement("a");
            a.className = "nav-link dropdown-toggle";
            a.href = item.url || "#";
            a.setAttribute("data-bs-toggle", "dropdown");
            a.setAttribute("aria-expanded", "false");
            a.textContent = item.name;

            const ul = document.createElement("ul");
            ul.className = "dropdown-menu";
            item.children.forEach((child) => {
                const childLi = document.createElement("li");
                const childA = document.createElement("a");
                childA.className = "dropdown-item";
                childA.href = child.url || "#";
                childA.textContent = child.name;
                childLi.appendChild(childA);
                ul.appendChild(childLi);
            });
            li.appendChild(a);
            li.appendChild(ul);
        } else {
            const a = document.createElement("a");
            a.className = "nav-link";
            a.href = item.url || "#";
            a.textContent = item.name;
            li.appendChild(a);
        }
        return li;
    }

    _applyStyles() {
        const ds = this.el.dataset;

        const h = parseInt(ds.lseMenuHeight, 10) || 100;
        const list = this.el.querySelector(".lse-menu-list");
        if (list) list.style.height = h + "px";

        if (ds.lseLinkColor) this.el.style.setProperty("--lse-link-color", ds.lseLinkColor);
        else this.el.style.removeProperty("--lse-link-color");

        if (ds.lseHoverColor) this.el.style.setProperty("--lse-link-hover-color", ds.lseHoverColor);
        else this.el.style.removeProperty("--lse-link-hover-color");

        if (ds.lseFontSize) this.el.style.setProperty("--lse-font-size", ds.lseFontSize + "px");
        else this.el.style.removeProperty("--lse-font-size");

        if (ds.lseFontWeight) this.el.style.setProperty("--lse-font-weight", ds.lseFontWeight);
        else this.el.style.removeProperty("--lse-font-weight");

        const fadeHex = ds.lseFadeColor || "#ffffff";
        const fadeAlpha =
            parseFloat(ds.lseFadeOpacity !== undefined ? ds.lseFadeOpacity : 92) / 100;
        this.el.style.setProperty("--lse-fade-color", this._hexToRgba(fadeHex, fadeAlpha));

        this._updateScrollShadow();
    }

    _updateScrollShadow() {
        const list = this.el.querySelector(".lse-menu-list");
        const outer = list && list.closest(".lse-scroll-outer");
        if (!outer || !list) return;
        outer.classList.toggle("lse-scrolled", list.scrollTop > 4);
        const hasMore =
            list.scrollHeight > list.clientHeight + 4 &&
            list.scrollTop + list.clientHeight < list.scrollHeight - 4;
        outer.classList.toggle("lse-scroll-more", hasMore);
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _showError(msg) {
        const list = this.el.querySelector(".lse-menu-list");
        if (list) {
            list.innerHTML = `<li class="nav-item">
                <span class="nav-link text-danger fst-italic">[LSE Dynamic Menu] ${msg}</span>
            </li>`;
        }
    }
}

registry.category("public.interactions").add("LseDynamicMenu", LseDynamicMenu);