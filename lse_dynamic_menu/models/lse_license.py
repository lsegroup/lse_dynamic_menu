import http.client
import json
import logging
import socket
import requests
from odoo import api, fields, models

_logger = logging.getLogger(__name__)

_LICENSE_SERVER  = 'https://license.globalclouddata.org'
_AGENT_SOCKET    = '/var/run/lse-agent/agent.sock'


class _AgentConn(http.client.HTTPConnection):
    """HTTPConnection that dials a Unix domain socket instead of TCP."""
    def __init__(self, path):
        super().__init__('localhost')
        self._path = path

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(2)
        s.connect(self._path)
        self.sock = s


def _agent_check(slug):
    """
    Query the local lse-agent Unix socket.
    Returns True  → agent says licensed
    Returns False → agent says NOT licensed (hard block)
    Returns None  → agent not reachable (fall back to DB status)
    """
    try:
        conn = _AgentConn(_AGENT_SOCKET)
        conn.request('GET', f'/status/{slug}')
        resp = conn.getresponse()
        data = json.loads(resp.read())
        conn.close()
        return bool(data.get('valid'))
    except Exception:
        return None  # agent not installed / unreachable → fall back


class LseLicense(models.Model):
    _name = 'lse.license'
    _description = 'LSE Product License'
    _order = 'name'

    slug = fields.Char('Product Slug', required=True, readonly=True, index=True)
    name = fields.Char('Product', required=True, readonly=True)
    key = fields.Char('License Key')
    status = fields.Selection([
        ('unchecked', 'Not Checked'),
        ('valid',     'Valid'),
        ('grace',     'Grace Period'),
        ('invalid',   'Invalid'),
    ], default='unchecked', readonly=True)
    last_checked = fields.Datetime('Last Checked', readonly=True)
    expires      = fields.Date('Expires', readonly=True)
    message      = fields.Char('Message', readonly=True)

    _sql_constraints = [
        ('slug_unique', 'UNIQUE(slug)', 'Product slug must be unique'),
    ]

    # ── Public API used by each LSE addon ────────────────────────────────────

    @api.model
    def register(self, slug, name):
        """Register a product. Idempotent and race-condition safe."""
        existing = self.search([('slug', '=', slug)], limit=1)
        if not existing:
            sp = 'lse_license_reg'
            self.env.cr.execute(f'SAVEPOINT {sp}')
            try:
                self.create({'slug': slug, 'name': name})
                self.env.cr.execute(f'RELEASE SAVEPOINT {sp}')
                _logger.info('lse_license: registered product %s', slug)
            except Exception:
                self.env.cr.execute(f'ROLLBACK TO SAVEPOINT {sp}')
        elif existing.name != name:
            existing.write({'name': name})

    @api.model
    def is_product_licensed(self, slug):
        """
        Return True if the product is licensed.

        Checks the local lse-agent Unix socket first (cryptographically
        verified, tamper-resistant).  Falls back to the Odoo DB status
        when the agent is not installed — so deployments without the
        agent still work during grace/trial.  If the agent IS reachable
        and says invalid, we block immediately regardless of DB state.
        """
        agent_result = _agent_check(slug)
        if agent_result is not None:
            if not agent_result:
                _logger.debug('lse_license: agent denied %s', slug)
            return agent_result

        # Agent not installed — fall back to DB status
        rec = self.search([('slug', '=', slug)], limit=1)
        if not rec:
            return False
        return rec.status in ('valid', 'grace', 'unchecked')

    # ── Validation ───────────────────────────────────────────────────────────

    def action_check(self):
        for rec in self:
            rec._do_validate()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'License Checked',
                'message': f'{self.name}: {dict(self._fields["status"].selection)[self.status]}',
                'type': 'success' if self.status in ('valid', 'grace') else 'warning',
            },
        }

    @api.model
    def action_check_all(self):
        self.search([])._do_validate()

    def _do_validate(self):
        domain  = self.env['ir.config_parameter'].sudo().get_param('web.base.url', '')
        db_uuid = self.env['ir.config_parameter'].sudo().get_param('database.uuid', '')

        for rec in self:
            try:
                if rec.key:
                    rec._validate_with_key(domain, db_uuid)
                else:
                    rec._validate_grace(domain, db_uuid)
            except Exception as exc:
                _logger.warning('lse_license: check failed for %s: %s', rec.slug, exc)
                rec.write({
                    'status': 'invalid',
                    'message': f'Connection failed: {exc}',
                    'last_checked': fields.Datetime.now(),
                })

    def _validate_with_key(self, domain, db_uuid):
        self.ensure_one()
        resp = requests.post(
            f'{_LICENSE_SERVER}/LSE-License/validate',
            json={'key': self.key, 'domain': domain, 'db_uuid': db_uuid, 'product': self.slug},
            timeout=10,
            verify=True,
        )
        data = resp.json()
        if data.get('valid'):
            self.write({
                'status': 'valid',
                'expires': (data.get('expires_at') or '')[:10] or False,
                'message': '',
                'last_checked': fields.Datetime.now(),
            })
        else:
            self.write({
                'status': 'invalid',
                'message': data.get('message', 'Invalid license key.'),
                'last_checked': fields.Datetime.now(),
            })

    def _validate_grace(self, domain, db_uuid):
        self.ensure_one()
        resp = requests.post(
            f'{_LICENSE_SERVER}/LSE-License/ping',
            json={'domain': domain, 'db_uuid': db_uuid, 'product': self.slug},
            timeout=10,
            verify=True,
        )
        data = resp.json()
        if data.get('valid'):
            days = data.get('grace_days_remaining', 0)
            self.write({
                'status': 'grace',
                'message': f'Trial period — {days} day(s) remaining',
                'last_checked': fields.Datetime.now(),
            })
        else:
            self.write({
                'status': 'invalid',
                'message': data.get('message', 'Trial period expired. A license key is required.'),
                'last_checked': fields.Datetime.now(),
            })
