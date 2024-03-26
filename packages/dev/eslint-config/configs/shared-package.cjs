module.exports = {
	ignorePatterns: ['node_modules', 'dist'],
	plugins: ['@typescript-eslint', 'vitest', 'import', 'sonarjs'],
	extends: [
		'eslint:recommended',
		'plugin:import/recommended',
		'plugin:import/typescript',
		'plugin:vitest/recommended',
		'./typescript.cjs',
		'./tests.cjs',
	],
	rules: {
		// Disabling since rule has a bug where it has false positive when named export matches module name
		'import/no-named-as-default': 'off',
		'import/no-named-as-default-member': 'off',
		'import/no-default-export': 'error',
		'import/no-extraneous-dependencies': ['error', { packageDir: './' }],
		'import/order': [
			'warn',
			{
				alphabetize: { order: 'asc' },
				'newlines-between': 'always',
			},
		],
		'object-shorthand': ['error', 'always'],
		'max-lines': ['error', { max: 600 }],
		'max-params': ['error', { max: 4 }],
		'max-statements': ['error', { max: 15 }],
		complexity: ['error', { max: 20 }],
		'sonarjs/cognitive-complexity': 'error',
	},
	overrides: [
		{
			files: ['*.ts', '*.tsx'],
			excludedFiles: ['test/**/*', '*.spec.ts', '*.test.ts'], // Test has its own rules
			rules: {
				'@typescript-eslint/no-empty-interface': 'warn',
				'@typescript-eslint/ban-ts-comment': 'off',
				'@typescript-eslint/no-use-before-define': 'off',
				'@typescript-eslint/no-non-null-assertion': 'warn',
				'@typescript-eslint/no-var-requires': 'off',
				'@typescript-eslint/indent': 'off',
				'@typescript-eslint/no-explicit-any': 'warn',
				'@typescript-eslint/no-unsafe-member-access': 'warn',
				'@typescript-eslint/explicit-function-return-type': 'off',
				'@typescript-eslint/consistent-type-imports': 'warn',
				'@typescript-eslint/no-unused-vars': [
					'warn',
					{
						argsIgnorePattern: '^_',
						varsIgnorePattern: '^_',
						caughtErrorsIgnorePattern: '^_',
					},
				],
			},
		},
	],
}
