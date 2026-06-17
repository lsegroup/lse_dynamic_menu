import logging
from odoo import models

_logger = logging.getLogger(__name__)


class LseDynamicMenuLicense(models.AbstractModel):
    _name = 'lse.dynamic.menu.license'
    _description = 'lse_dynamic_menu license registration'

    def _register_hook(self):
        super()._register_hook()
        self.env.cr.execute("SELECT to_regclass('public.lse_license')")
        if self.env.cr.fetchone()[0] is not None:
            self.env['lse.license'].sudo().register(
                'lse_dynamic_menu',
                'Dynamic Menu for Odoo 19',
            )
        else:
            _logger.debug('lse_dynamic_menu: lse_license table not yet created, registration deferred')
