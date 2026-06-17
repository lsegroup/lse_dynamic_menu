import json
from odoo import http
from odoo.http import request


class LseDynamicMenuController(http.Controller):

    @http.route(
        '/lse_dynamic_menu/get_items',
        type='http',
        auth='public',
        website=True,
        methods=['GET'],
        csrf=False,
    )
    def get_menu_items(self, url_path='/', **kwargs):
        """
        Return JSON list of menu items under the given url_path.
        Looks up website.menu first; falls back to published website.page records.
        """
        if not request.env['lse.license'].sudo().is_product_licensed('lse_dynamic_menu'):
            return request.make_response('[]', [('Content-Type', 'application/json; charset=utf-8')])

        website = request.website
        items = self._build_items(website, url_path)
        headers = [('Content-Type', 'application/json; charset=utf-8')]
        return request.make_response(json.dumps(items), headers=headers)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_items(self, website, url_path):
        """Try website.menu hierarchy first, then fall back to pages."""
        parent = request.env['website.menu'].sudo().search([
            ('website_id', '=', website.id),
            ('url', '=', url_path),
        ], limit=1)

        if parent:
            return self._menus_to_dict(parent.child_id)

        return self._pages_to_dict(website, url_path)

    def _menus_to_dict(self, menus):
        result = []
        for menu in menus.sorted('sequence'):
            result.append({
                'name': menu.name,
                'url': menu.url or '#',
                'children': self._menus_to_dict(menu.child_id),
            })
        return result

    def _pages_to_dict(self, website, url_path):
        """
        Find all published pages whose URL starts with url_path + '/'.
        Returns only direct children (one level deep).
        """
        base = url_path.rstrip('/')
        pages = request.env['website.page'].sudo().search([
            ('website_id', 'in', [website.id, False]),
            ('is_published', '=', True),
            ('url', '=like', base + '/%'),
        ])

        seen = {}
        for page in pages:
            remainder = page.url[len(base):].lstrip('/')
            segment = remainder.split('/')[0]
            child_url = base + '/' + segment
            if child_url not in seen:
                seen[child_url] = {
                    'name': segment.replace('-', ' ').replace('_', ' ').title(),
                    'url': child_url,
                    'children': [],
                }

        return list(seen.values())