from odoo import api, fields, models


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    lse_license_summary = fields.Char(compute='_compute_lse_license_stats')

    @api.depends_context('uid')
    def _compute_lse_license_stats(self):
        all_lic = self.env['lse.license'].search([])
        valid   = all_lic.filtered(lambda r: r.status in ('valid', 'grace'))
        n_all   = len(all_lic)
        n_valid = len(valid)
        summary = f'{n_valid} of {n_all} product(s) licensed'
        for rec in self:
            rec.lse_license_summary = summary

    def action_open_lse_licenses(self):
        return {
            'type': 'ir.actions.act_window',
            'name': 'LSE Licenses',
            'res_model': 'lse.license',
            'view_mode': 'list,form',
            'target': 'current',
        }

    def action_check_all_licenses(self):
        self.env['lse.license'].action_check_all()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'License Check Complete',
                'message': 'All LSE licenses have been re-validated.',
                'type': 'success',
                'sticky': False,
            },
        }
