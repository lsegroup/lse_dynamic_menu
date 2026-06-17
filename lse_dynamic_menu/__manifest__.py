{
    'name': 'Dynamic Menu',
    'version': '19.0.1.7.0',
    'category': 'Website',
    'summary': 'Dynamic dropdown menu website snippet built from a preset URL path',
    'author': 'LSE Group',
    'website': 'https://lumanet.info',
    'depends': ['website'],
    'data': [
        'security/ir.model.access.csv',
        'views/lse_license_views.xml',
        'views/res_config_settings_views.xml',
        'views/snippets/options.xml',
        'data/ir_cron.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'lse_dynamic_menu/static/src/snippets/s_lse_dynamic_menu/000.scss',
            'lse_dynamic_menu/static/src/snippets/s_lse_dynamic_menu/000.js',
        ],
        'website.website_builder_assets': [
            'lse_dynamic_menu/static/src/snippets/s_lse_dynamic_menu/options.js',
            'lse_dynamic_menu/static/src/builder/firefox_dialog_fix.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'OPL-1',
    'images': ['static/description/banner.png'],
    'price': 199.00,
    'currency': 'USD',
    'live_test_url': 'https://lumanet.info',
}
