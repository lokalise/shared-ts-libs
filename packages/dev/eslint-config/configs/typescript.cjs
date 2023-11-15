module.exports = {
	parserOptions: {
		ecmaVersion: 2024,
		sourceType: 'module',
	},
	settings: {
		'import/parsers': {
			'@typescript-eslint/parser': ['.ts', '.tsx'],
		},
		'import/resolver': {
			typescript: {},
			node: {},
		},
	},
	overrides: [
		{
			files: ['*.ts', '.tsx'],
			extends: [
				'plugin:@typescript-eslint/recommended',
				'plugin:@typescript-eslint/recommended-requiring-type-checking',
			],
			parser: '@typescript-eslint/parser',
			rules: {
				'@typescript-eslint/no-unused-vars': [
					'warn',
					{
						argsIgnorePattern: '^_',
						varsIgnorePattern: '^_',
						caughtErrorsIgnorePattern: '^_',
					},
				],
				// Produces false positives so disabling for now
				'@typescript-eslint/no-redundant-type-constituents': 'off',
			},
		},
	],
}
